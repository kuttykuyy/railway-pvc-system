/**
 * Which model reads bills best? Measure it on your own bills.
 *
 * Runs every PDF in a folder through the app's AI bill extraction once per model, and
 * scores each result against the bill itself: the deterministic IREPS parser gives the
 * exact payable rows and the printed total wherever it reconciles, and every model's row
 * list is compared to that. Tokens, time and estimated cost are tallied per model. The
 * output is a table on the console and a JSON file with every row, so the choice of
 * model is made on numbers from real bills rather than on reputation.
 *
 * Usage (from the app/ folder, with DATABASE_URL and the provider keys in .env):
 *
 *   npx tsx --require dotenv/config scripts/eval-bill-extraction.ts \
 *     --pdfs ./eval-bills \
 *     --models route-llm,anthropic:claude-sonnet-5,anthropic:claude-opus-5 \
 *     --out eval-results.json
 *
 *   --pdfs    folder of bill PDFs (IREPS running account bills)
 *   --models  comma-separated model specs (see lib/ai/llm-client.ts); "parser" means the
 *             deterministic reader only. Omit to score the parser alone, which needs no key.
 *   --out     where to write the JSON results (default eval-results.json)
 *
 * A model needs its provider key: ABACUSAI_API_KEY for route-llm or any Abacus model name,
 * ANTHROPIC_API_KEY for anthropic:<model>. Every model call costs real money; the tally
 * at the end says how much.
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, basename } from 'node:path';
import { parseIrepsBillPdfDirect } from '../lib/ireps-direct-pdf-parser';
import { onUsage, type UsageEvent } from '../lib/ai/model-spec';
import { estimateCostUsd } from '../lib/ai-pricing';

interface Row { itemNo: string; amount: number }
interface Truth { total: number | null; rows: Row[] | null; source: 'parser' | 'none'; note?: string }
interface ModelScore {
  model: string;
  ok: boolean;
  error?: string;
  itemCount: number;
  itemsSum: number;
  totalDiff: number | null;
  rowsMatched: number | null;
  rowsMissed: number | null;
  rowsExtra: number | null;
  seconds: number;
  promptTokens: number;
  completionTokens: number;
  costUsd: number;
  answeredBy: string[];
}
interface BillResult { file: string; truth: Truth; models: ModelScore[] }

const round2 = (n: number) => Math.round(n * 100) / 100;
const normItem = (v: unknown) => String(v ?? '').replace(/[()IG\s-]/gi, '').replace(/\.$/, '').toUpperCase();

function arg(name: string, fallback = ''): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

async function groundTruth(buffer: Buffer): Promise<Truth> {
  try {
    const parsed = await parseIrepsBillPdfDirect(buffer);
    return {
      total: round2(parsed.grossBillAmount ?? parsed.itemAmountTotal),
      rows: parsed.items.map(i => ({ itemNo: normItem(i.itemNo), amount: round2(i.amountSinceLastBill) })),
      source: 'parser',
    };
  } catch (error: any) {
    // The parser could not reconcile this bill — exactly the case the AI exists for. There
    // is no exact row list to score against, so only each model's own consistency is shown.
    return { total: null, rows: null, source: 'none', note: String(error?.message || error).split('\n')[0] };
  }
}

function scoreRows(truth: Row[], got: Row[]): { matched: number; missed: number; extra: number } {
  const remaining = [...got];
  let matched = 0;
  for (const t of truth) {
    const idx = remaining.findIndex(g => Math.abs(g.amount - t.amount) <= 0.05 && (!t.itemNo || !g.itemNo || g.itemNo === t.itemNo));
    if (idx >= 0) { matched += 1; remaining.splice(idx, 1); }
  }
  return { matched, missed: truth.length - matched, extra: remaining.length };
}

async function main() {
  const dir = arg('pdfs', './eval-bills');
  const out = arg('out', 'eval-results.json');
  const models = arg('models', 'parser').split(',').map(s => s.trim()).filter(Boolean).filter(s => s !== 'parser');
  const files = readdirSync(dir).filter(f => /\.pdf$/i.test(f)).sort();
  if (!files.length) { console.error(`No PDFs found in ${dir}`); process.exit(1); }

  // Loaded only when a model is asked for: the route module pulls in the web framework.
  const extractWithAi = models.length
    ? (await import('../app/api/bills/cement-analysis/route')).extractBillDetailsWithAi
    : null;

  const results: BillResult[] = [];
  for (const file of files) {
    const buffer = readFileSync(join(dir, file));
    const truth = await groundTruth(buffer);
    console.log(`\n${file}: ${truth.source === 'parser' ? `parser reconciled — ${truth.rows!.length} payable rows, total ${truth.total}` : `parser could not reconcile (${truth.note})`}`);
    const scores: ModelScore[] = [];

    for (const spec of models) {
      const usage: UsageEvent[] = [];
      const stop = onUsage(e => usage.push(e));
      const started = Date.now();
      const score: ModelScore = { model: spec, ok: false, itemCount: 0, itemsSum: 0, totalDiff: null, rowsMatched: null, rowsMissed: null, rowsExtra: null, seconds: 0, promptTokens: 0, completionTokens: 0, costUsd: 0, answeredBy: [] };
      try {
        const pdf = new File([new Uint8Array(buffer)], file, { type: 'application/pdf' });
        const details = await extractWithAi!(pdf, 'http://localhost', undefined, { modelSpec: spec });
        const rows: Row[] = (details.items || []).map((i: any) => ({ itemNo: normItem(i.itemNo || i.dsrCode), amount: round2(Number(i.amountSinceLastBill ?? i.amountIncludingSpecialConditionSinceLastBill ?? 0)) }));
        score.ok = true;
        score.itemCount = rows.length;
        score.itemsSum = round2(rows.reduce((s, r) => s + r.amount, 0));
        const reference = truth.total ?? (typeof details.scheduleSummaryTotal === 'number' ? details.scheduleSummaryTotal : null);
        score.totalDiff = reference === null ? null : round2(score.itemsSum - reference);
        if (truth.rows) {
          const r = scoreRows(truth.rows, rows);
          score.rowsMatched = r.matched; score.rowsMissed = r.missed; score.rowsExtra = r.extra;
        }
      } catch (error: any) {
        score.error = String(error?.message || error).split('\n')[0];
      } finally {
        stop();
      }
      score.seconds = round2((Date.now() - started) / 1000);
      score.promptTokens = usage.reduce((s, u) => s + u.promptTokens, 0);
      score.completionTokens = usage.reduce((s, u) => s + u.completionTokens, 0);
      score.costUsd = Math.round(usage.reduce((s, u) => s + estimateCostUsd(u.model, u.promptTokens, u.completionTokens), 0) * 10000) / 10000;
      score.answeredBy = [...new Set(usage.map(u => u.model))];
      scores.push(score);
      console.log(`  ${spec.padEnd(30)} ${score.ok ? `${score.itemCount} rows, sum ${score.itemsSum}, diff ${score.totalDiff ?? 'n/a'}, matched ${score.rowsMatched ?? 'n/a'}/${truth.rows?.length ?? 'n/a'}` : `FAILED: ${score.error}`} · ${score.seconds}s · $${score.costUsd} · ${score.answeredBy.join('+') || '-'}`);
    }
    results.push({ file: basename(file), truth, models: scores });
  }

  // Per-model totals across every bill.
  const summary = models.map(spec => {
    const rows = results.map(r => r.models.find(m => m.model === spec)!).filter(Boolean);
    const scorable = rows.filter(m => m.ok && m.totalDiff !== null);
    return {
      model: spec,
      bills: rows.length,
      failed: rows.filter(m => !m.ok).length,
      exactTotal: scorable.filter(m => Math.abs(m.totalDiff!) <= 0.05).length,
      within1Rupee: scorable.filter(m => Math.abs(m.totalDiff!) <= 1).length,
      rowsMatched: rows.reduce((s, m) => s + (m.rowsMatched || 0), 0),
      rowsMissed: rows.reduce((s, m) => s + (m.rowsMissed || 0), 0),
      rowsExtra: rows.reduce((s, m) => s + (m.rowsExtra || 0), 0),
      avgSeconds: round2(rows.reduce((s, m) => s + m.seconds, 0) / Math.max(1, rows.length)),
      totalCostUsd: Math.round(rows.reduce((s, m) => s + m.costUsd, 0) * 10000) / 10000,
    };
  });
  if (summary.length) { console.log('\nSummary across bills:'); console.table(summary); }
  else console.log('\nParser-only run: no model was named (use --models to compare models).');

  writeFileSync(out, JSON.stringify({ generatedAt: new Date().toISOString(), summary, results }, null, 2));
  console.log(`\nWrote ${out}`);
}

main().catch(error => { console.error(error); process.exit(1); });
