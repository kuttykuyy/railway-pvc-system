'use client';

/**
 * The "how it works" walkthrough: a video-style, auto-playing tour of the two uploads
 * — the LOA that becomes a contract, and the signed bill that becomes a PVC report —
 * built from mock-ups of the real screens, in their real words.
 *
 * Not a screen recording on purpose: it is crisp on a phone, the text is readable, it
 * is in Hindi with one tap, and it stays true when the screens it shows change, because
 * it is made of the same copy. Each step is a scene in the array below; the player
 * around them is small and boring.
 */

import { useEffect, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { ArrowRight, FileText, Receipt, Pause, Play, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useLanguage } from '@/components/i18n-provider';

type Lang = 'en' | 'hi';
interface Scene {
  part: 1 | 2;
  en: { t: string; d: string };
  hi: { t: string; d: string };
  screen: ReactNode;
}

const STEP_MS = 7000;

/* ---------- tiny mock-screen building blocks ---------- */
const Bar = ({ path }: { path: string }) => (
  <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-200 bg-slate-50 font-mono text-[11px] text-slate-500">
    <i className="h-2 w-2 rounded-full bg-slate-300" /><i className="h-2 w-2 rounded-full bg-slate-300" /><i className="h-2 w-2 rounded-full bg-slate-300" />
    <span className="ml-1">www.irpvc.in{path}</span>
  </div>
);
const App = ({ path, children, center }: { path: string; children: ReactNode; center?: boolean }) => (
  <div className="w-full max-w-[520px] rounded-xl border border-slate-200 bg-white shadow-lg overflow-hidden text-[13px]">
    <Bar path={path} />
    <div className={`p-4 grid gap-3 ${center ? 'text-center justify-items-center' : ''}`}>{children}</div>
  </div>
);
const Step = ({ n, grey }: { n: number; grey?: boolean }) => (
  <span className={`inline-grid place-items-center h-5 w-5 rounded-full text-[11px] font-semibold ${grey ? 'bg-slate-200 text-slate-500' : 'bg-emerald-600 text-white'}`}>{n}</span>
);
const Btn = ({ children, primary, dim }: { children: ReactNode; primary?: boolean; dim?: boolean }) => (
  <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-semibold border ${primary ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-slate-800 border-slate-200'} ${dim ? 'opacity-50' : ''}`}>{children}</span>
);
const Field = ({ label, value, muted }: { label: string; value: string; muted?: boolean }) => (
  <div>
    <div className="text-[10.5px] uppercase tracking-wider text-slate-500 mb-1">{label}</div>
    <div className={`rounded-md border border-slate-200 px-2.5 py-1.5 font-mono ${muted ? 'text-slate-400' : ''}`}>{value}</div>
  </div>
);
const Spinner = () => <div className="h-8 w-8 rounded-full border-[3px] border-slate-200 border-t-emerald-600 animate-spin motion-reduce:animate-none" />;

const SCENES: Scene[] = [
  {
    part: 1,
    en: { t: 'Sign in. You land here.', d: 'After signing up, the app opens on this page. Two uploads, one report — and your first bill is free.' },
    hi: { t: 'साइन इन करें। आप यहाँ पहुँचते हैं।', d: 'साइन-अप के बाद ऐप इसी पेज पर खुलता है। दो अपलोड, एक रिपोर्ट — और आपका पहला बिल मुफ़्त है।' },
    screen: (
      <App path="/welcome">
        <h3 className="font-bold text-[17px] leading-tight">Get your PVC report in two uploads</h3>
        <p className="text-slate-500">Upload the LOA, upload the bill, and the finished report is yours. Your first bills are free.</p>
        <div className="rounded-lg border-2 border-emerald-500 p-3 flex items-center justify-between gap-3"><span className="flex items-center gap-2"><Step n={1} /><b>Upload the LOA (Letter of Acceptance)</b></span><Btn primary>Choose PDF</Btn></div>
        <div className="rounded-lg border border-slate-200 p-3 flex items-center justify-between gap-3 opacity-60"><span className="flex items-center gap-2"><Step n={2} grey /><b>Upload the signed bill</b></span><Btn dim>Upload bill</Btn></div>
      </App>
    ),
  },
  {
    part: 1,
    en: { t: 'Step 1: choose your LOA PDF.', d: 'The app reads the agreement number, tender date, schedules and rates by itself. Nothing to type.' },
    hi: { t: 'स्टेप 1: अपनी LOA की PDF चुनें।', d: 'ऐप खुद ही एग्रीमेंट नंबर, टेंडर की तारीख, शेड्यूल और रेट पढ़ लेता है। कुछ टाइप नहीं करना।' },
    screen: (
      <App path="/welcome">
        <div className="rounded-lg border-2 border-emerald-500 p-3 grid gap-2">
          <div className="flex items-center justify-between gap-3"><span className="flex items-center gap-2"><Step n={1} /><b>Upload the LOA (Letter of Acceptance)</b></span><Btn primary>Reading…</Btn></div>
          <p className="text-slate-500">It reads the agreement number, tender date, schedules and rates by itself.</p>
        </div>
        <div className="mx-auto my-1 w-[110px] h-[130px] rounded-md border border-slate-200 bg-white shadow relative grid content-end p-2">
          <div className="absolute inset-x-3 top-3 h-1 bg-slate-200 shadow-[0_10px_0_#e2e8f0,0_20px_0_#e2e8f0,0_30px_0_#e2e8f0,0_40px_0_#e2e8f0]" />
          <span className="font-mono text-[10px] text-slate-500">LOA_SR_MDU_2024.pdf</span>
        </div>
      </App>
    ),
  },
  {
    part: 1,
    en: { t: 'Confirm the agreement number — or leave it blank.', d: "The LOA usually doesn't carry it. If you don't have it yet, just save: your first bill prints it, and the app takes it from there." },
    hi: { t: 'एग्रीमेंट नंबर पक्का करें — या खाली छोड़ दें।', d: 'LOA में अक्सर यह नहीं होता। अभी नहीं है तो बस Save करें: आपका पहला बिल इसे छापता है, ऐप वहीं से ले लेगा।' },
    screen: (
      <App path="/welcome">
        <div className="rounded-lg border border-emerald-300 bg-emerald-50 p-3 grid gap-2">
          <p className="font-medium">The agreement number — type it if you know it</p>
          <div className="flex items-center gap-2"><div className="flex-1 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 font-mono">SR/MDU/Civil/2024/0037</div><Btn primary>Save contract</Btn></div>
          <p className="text-[11.5px] text-slate-500">It looks like SCR/GNT/Civil/2022/0012. The LOA usually does not carry it — if you don&apos;t have it yet, just skip: your first bill PDF prints it, and we&apos;ll take it from there automatically.</p>
        </div>
      </App>
    ),
  },
  {
    part: 1,
    en: { t: 'Your contract is in. Step 2 unlocks.', d: "The bill needs a contract to attach to, so the bill upload stays locked until this is done. Now it's open." },
    hi: { t: 'आपका ठेका जुड़ गया। स्टेप 2 खुल गया।', d: 'बिल को किसी ठेके से जुड़ना होता है, इसलिए बिल अपलोड तब तक बंद रहता है। अब यह खुला है।' },
    screen: (
      <App path="/welcome">
        <div className="rounded-lg border border-emerald-400 bg-emerald-50 p-3 flex items-center justify-between gap-3"><span><span className="text-emerald-600 font-bold">✓</span> <b>Upload the LOA</b><br /><span className="text-slate-500">Done — SR/MDU/Civil/2024/0037 is in.</span></span><Btn>Add another</Btn></div>
        <div className="rounded-lg border-2 border-emerald-500 p-3 flex items-center justify-between gap-3"><span className="flex items-start gap-2"><Step n={2} /><span><b>Upload the signed bill</b><br /><span className="text-slate-500">It reads every item, checks the total against the bill&apos;s own figure, and hands you the report.</span></span></span><Btn primary>Upload bill</Btn></div>
      </App>
    ),
  },
  {
    part: 1,
    en: { t: 'Prefer typing? Contracts → New contract.', d: 'Agreement number, LOA number and date, contractor, work, date of tender opening and the schedules. The base month is set for you — the month before opening.' },
    hi: { t: 'टाइप करना चाहें? Contracts → New contract।', d: 'एग्रीमेंट नंबर, LOA नंबर-तारीख, ठेकेदार, काम, टेंडर खुलने की तारीख और शेड्यूल। बेस महीना अपने-आप तय होता है — खुलने से पिछला महीना।' },
    screen: (
      <App path="/contracts/new">
        <h3 className="font-bold text-[17px]">New contract</h3>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Agreement number" value="SR/MDU/Civil/2024/0037" />
          <Field label="Date of opening" value="14-03-2024" />
          <Field label="Contractor" value="M/s …" muted />
          <Field label="Base month (auto)" value="Feb 2024" />
        </div>
        <div className="rounded-md border-l-[3px] border-amber-500 bg-amber-50 px-2.5 py-2 text-xs">Schedules carry their own escalation, bid rate and rebate — enter them once here; every bill uses them.</div>
        <div className="flex justify-end"><Btn primary>Create contract</Btn></div>
      </App>
    ),
  },
  {
    part: 2,
    en: { t: 'Step 2: upload the signed bill.', d: 'The PDF from IREPS, with the item pages. Tap Upload bill, then Choose the bill PDF.' },
    hi: { t: 'स्टेप 2: साइन किया हुआ बिल अपलोड करें।', d: 'IREPS की PDF, आइटम वाले पेज सहित। Upload bill दबाएँ, फिर Choose the bill PDF।' },
    screen: (
      <App path="/bills/new" center>
        <Receipt className="h-10 w-10 text-emerald-600" />
        <h3 className="font-bold text-[17px]">Upload your signed bill</h3>
        <p className="text-slate-500">The PDF from IREPS, with the item pages. It is read, checked against its own total, and your report is prepared — nothing to fill in.</p>
        <span className="w-full inline-flex justify-center rounded-lg bg-emerald-600 text-white text-xs font-semibold px-3 py-2">Choose the bill PDF</span>
        <span className="text-xs text-slate-500">Type it in instead</span>
      </App>
    ),
  },
  {
    part: 2,
    en: { t: 'It reads every item and checks the total.', d: "Each row is read off the PDF and the sum is checked against the bill's own printed total — to the paisa. A long bill can take a minute or two." },
    hi: { t: 'हर आइटम पढ़ता है और टोटल जाँचता है।', d: 'हर पंक्ति PDF से पढ़ी जाती है और जोड़ बिल के अपने छपे टोटल से मिलाया जाता है — पैसे तक। लंबे बिल में एक-दो मिनट लग सकते हैं।' },
    screen: (
      <App path="/bills/new" center>
        <Spinner />
        <h3 className="font-bold text-[17px]">Reading your bill…</h3>
        <p className="text-slate-500">Every item is read off the PDF and the totals are checked against the bill&apos;s own figures.</p>
        <table className="w-[92%] border-collapse font-mono text-[11px] tabular-nums">
          <thead><tr className="bg-slate-50">{['Item', 'Unit', 'Qty', 'Amount'].map(h => <th key={h} className="border border-slate-200 px-1.5 py-1 text-left font-medium font-sans">{h}</th>)}</tr></thead>
          <tbody>
            <tr><td className="border border-slate-200 px-1.5 py-1 text-left">41</td><td className="border border-slate-200 px-1.5 py-1">Metre</td><td className="border border-slate-200 px-1.5 py-1 text-right">743.30</td><td className="border border-slate-200 px-1.5 py-1 text-right">16,70,413</td></tr>
            <tr><td className="border border-slate-200 px-1.5 py-1 text-left">46</td><td className="border border-slate-200 px-1.5 py-1">Set</td><td className="border border-slate-200 px-1.5 py-1 text-right">7.00</td><td className="border border-slate-200 px-1.5 py-1 text-right">13,47,653</td></tr>
            <tr><td className="border border-slate-200 px-1.5 py-1 text-left">47</td><td className="border border-slate-200 px-1.5 py-1">SquareFoot</td><td className="border border-slate-200 px-1.5 py-1 text-right">129.00</td><td className="border border-slate-200 px-1.5 py-1 text-right">89,684</td></tr>
            <tr className="bg-slate-50 font-semibold"><td colSpan={3} className="border border-slate-200 px-1.5 py-1 text-left font-sans">Item total = printed total</td><td className="border border-slate-200 px-1.5 py-1 text-right text-emerald-700">56,77,633 ✓</td></tr>
          </tbody>
        </table>
      </App>
    ),
  },
  {
    part: 2,
    en: { t: 'Your PVC report downloads by itself.', d: "The bill is saved and the report is prepared. It's the statement you submit to the railway — and your first one is free." },
    hi: { t: 'आपकी PVC रिपोर्ट अपने-आप डाउनलोड होती है।', d: 'बिल सेव हो जाता है और रिपोर्ट तैयार। यही स्टेटमेंट आप रेलवे को देते हैं — और पहली मुफ़्त है।' },
    screen: (
      <App path="/bills/new" center>
        <Spinner />
        <h3 className="font-bold text-[17px]">Preparing your report…</h3>
        <p className="text-slate-500">The bill is saved and the PVC report is on its way. The download starts by itself.</p>
        <div className="w-[92%] flex items-center justify-between rounded-lg border border-slate-200 px-2.5 py-2"><span className="font-mono text-[11px] text-emerald-700">⬇ PVC_Report_SR-MDU-Civil-2024-0037-B1.pdf</span><span className="rounded-full bg-emerald-100 text-emerald-700 text-[10.5px] font-semibold px-2 py-0.5">Free</span></div>
      </App>
    ),
  },
  {
    part: 2,
    en: { t: 'Later bills: Bills → New bill, same two taps.', d: "Pick the contract, upload the next period's signed bill. You can also type a bill in: bill number, measurement date, amounts, classifications, cement and steel." },
    hi: { t: 'अगले बिल: Bills → New bill, वही दो टैप।', d: 'ठेका चुनें, अगली अवधि का साइन किया बिल अपलोड करें। बिल टाइप भी कर सकते हैं: बिल नंबर, मापन तारीख, रकम, वर्गीकरण, सीमेंट और स्टील।' },
    screen: (
      <App path="/bills/new">
        <h3 className="font-bold text-[17px]">New bill</h3>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Contract" value="SR/MDU/Civil/2024/0037" />
          <Field label="Bill number" value="…/0037/B2" />
          <Field label="Date of measurement" value="31-07-2026" />
          <Field label="Bill amount" value="56,77,633.00" />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2"><Btn>Classifications</Btn><Btn>Cement &amp; steel</Btn><Btn primary>Create bill</Btn></div>
      </App>
    ),
  },
  {
    part: 2,
    en: { t: 'Read the status badges on your reports.', d: "Provisional means an index for that quarter isn't final yet and the figure may move; Final means it's settled. Regenerate a bill once its indices go final." },
    hi: { t: 'रिपोर्ट पर स्टेटस बैज समझें।', d: 'Provisional यानी उस तिमाही का कोई इंडेक्स अभी अंतिम नहीं, आँकड़ा बदल सकता है; Final यानी पक्का। इंडेक्स फाइनल होने पर बिल को Regenerate करें।' },
    screen: (
      <App path="/bills">
        <h3 className="font-bold text-[17px]">Your bills</h3>
        <table className="w-full border-collapse font-mono text-[11px] tabular-nums">
          <thead><tr className="bg-slate-50">{['Bill', 'Quarter', 'PVC', 'Status'].map(h => <th key={h} className="border border-slate-200 px-1.5 py-1 text-left font-medium font-sans">{h}</th>)}</tr></thead>
          <tbody>
            <tr><td className="border border-slate-200 px-1.5 py-1">…/0037/B1</td><td className="border border-slate-200 px-1.5 py-1">Q5</td><td className="border border-slate-200 px-1.5 py-1 text-right">86,582.01</td><td className="border border-slate-200 px-1.5 py-1"><span className="rounded-full bg-emerald-100 text-emerald-700 text-[10.5px] font-semibold px-2 py-0.5">Final</span></td></tr>
            <tr><td className="border border-slate-200 px-1.5 py-1">…/0037/B2</td><td className="border border-slate-200 px-1.5 py-1">Q6</td><td className="border border-slate-200 px-1.5 py-1 text-right">1,12,940.55</td><td className="border border-slate-200 px-1.5 py-1"><span className="rounded-full bg-amber-100 text-amber-700 text-[10.5px] font-semibold px-2 py-0.5">Provisional</span></td></tr>
          </tbody>
        </table>
        <div className="flex gap-2"><Btn>Download report</Btn><Btn>Regenerate</Btn></div>
      </App>
    ),
  },
];

export function Walkthrough() {
  const { language } = useLanguage();
  const [lang, setLang] = useState<Lang>('en');
  const [idx, setIdx] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [hovering, setHovering] = useState(false);
  const [reduced, setReduced] = useState(false);
  const [tick, setTick] = useState(0); // restarts the progress animation
  const timer = useRef<number | null>(null);

  useEffect(() => { setLang(language === 'hi' ? 'hi' : 'en'); }, [language]);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(mq.matches);
    if (mq.matches) setPlaying(false);
  }, []);

  const go = (i: number) => { setIdx((i + SCENES.length) % SCENES.length); setTick(t => t + 1); };

  useEffect(() => {
    if (timer.current) window.clearTimeout(timer.current);
    if (!playing || hovering || reduced) return;
    timer.current = window.setTimeout(() => go(idx + 1), STEP_MS);
    return () => { if (timer.current) window.clearTimeout(timer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx, playing, hovering, reduced, tick]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target && /input|textarea/i.test((e.target as HTMLElement).tagName)) return;
      if (e.key === 'ArrowRight') go(idx + 1);
      else if (e.key === 'ArrowLeft') go(idx - 1);
      else if (e.key === ' ') { e.preventDefault(); setPlaying(p => !p); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx]);

  const scene = SCENES[idx];
  const cap = scene[lang];
  const running = playing && !hovering && !reduced;

  return (
    <div className="space-y-6">
      <style>{`@keyframes hiw-fill{from{width:0}to{width:100%}}`}</style>

      <div className="flex justify-end">
        <div className="inline-flex rounded-full border border-slate-200 bg-white overflow-hidden" role="group" aria-label="Caption language">
          {(['en', 'hi'] as Lang[]).map(l => (
            <button key={l} type="button" onClick={() => setLang(l)} aria-pressed={lang === l}
              className={`px-3.5 py-1.5 text-sm font-medium ${lang === l ? 'bg-emerald-600 text-white' : 'text-slate-600 hover:bg-slate-50'}`}>
              {l === 'en' ? 'English' : 'हिन्दी'}
            </button>
          ))}
        </div>
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white shadow-xl overflow-hidden" aria-label="Walkthrough player">
        <div className="flex gap-1.5 px-3.5 pt-3" aria-hidden="true">
          {SCENES.map((_, i) => (
            <span key={i} className="flex-1 h-1 rounded bg-slate-200 overflow-hidden">
              <i
                key={i === idx ? `live-${tick}` : `s-${i}`}
                className="block h-full bg-emerald-600"
                style={i < idx
                  ? { width: '100%' }
                  : i === idx
                    ? (reduced ? { width: '100%' } : { animation: `hiw-fill ${STEP_MS}ms linear forwards`, animationPlayState: running ? 'running' : 'paused' })
                    : { width: 0 }}
              />
            </span>
          ))}
        </div>

        <div
          className="relative aspect-[16/9] mx-3.5 mt-3 rounded-xl border border-slate-200 bg-gradient-to-br from-slate-50 to-emerald-50/40 overflow-hidden flex items-center justify-center p-3 sm:p-6"
          onMouseEnter={() => setHovering(true)} onMouseLeave={() => setHovering(false)}
        >
          <span className="absolute top-3 left-4 font-mono text-[11px] tracking-widest uppercase text-slate-500">
            <b className="text-emerald-700 font-medium">Part {scene.part}</b> · {scene.part === 1 ? 'Contract' : 'Bill'}
          </span>
          <div key={idx} className="w-full flex justify-center animate-in fade-in slide-in-from-bottom-2 duration-300 motion-reduce:animate-none">
            {scene.screen}
          </div>
        </div>

        <div className="px-4 sm:px-5 pt-4 pb-1 min-h-[92px]" lang={lang}>
          <p className="text-lg font-semibold leading-snug">{cap.t}</p>
          <p className="text-slate-600 mt-1 max-w-[70ch]">{cap.d}</p>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 px-3.5 pb-3.5 pt-2">
          <div className="flex gap-2">
            <Button type="button" variant="outline" size="icon" onClick={() => go(idx - 1)} aria-label="Previous step"><ChevronLeft className="h-4 w-4" /></Button>
            <Button type="button" onClick={() => setPlaying(p => !p)} aria-pressed={playing} className="min-w-[110px]" disabled={reduced}>
              {playing ? <><Pause className="h-4 w-4 mr-1.5" />{lang === 'hi' ? 'रोकें' : 'Pause'}</> : <><Play className="h-4 w-4 mr-1.5" />{lang === 'hi' ? 'चलाएँ' : 'Play'}</>}
            </Button>
            <Button type="button" variant="outline" size="icon" onClick={() => go(idx + 1)} aria-label="Next step"><ChevronRight className="h-4 w-4" /></Button>
          </div>
          <span className="font-mono text-xs text-slate-500">{idx + 1} / {SCENES.length}</span>
        </div>
      </section>

      <div className="grid sm:grid-cols-2 gap-3.5">
        {([1, 2] as const).map(part => (
          <div key={part} className="rounded-2xl border border-slate-200 bg-white p-4">
            <h2 className="font-bold text-sm mb-2">{part === 1 ? (lang === 'hi' ? 'भाग 1 — अपना ठेका जोड़ें' : 'Part 1 — Add your contract') : (lang === 'hi' ? 'भाग 2 — बिल बनाएँ' : 'Part 2 — Create the bill')}</h2>
            <ol className="space-y-1" lang={lang}>
              {SCENES.map((s, i) => s.part === part && (
                <li key={i}>
                  <button type="button" onClick={() => go(i)}
                    className={`w-full text-left flex items-baseline gap-2.5 rounded-lg px-2 py-1.5 text-sm hover:bg-slate-50 ${i === idx ? 'bg-emerald-50' : ''}`}>
                    <span className="font-mono text-xs text-slate-500 min-w-[18px]">{i + 1}</span>
                    <span>{s[lang].t}</span>
                  </button>
                </li>
              ))}
            </ol>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-4 text-sm text-slate-600">
        <Button asChild><Link href="/welcome"><FileText className="h-4 w-4 mr-2" />{lang === 'hi' ? 'शुरू करें' : 'Start now'} <ArrowRight className="h-4 w-4 ml-1" /></Link></Button>
        <span lang={lang}>{lang === 'hi'
          ? 'अगर कोई PDF न पढ़ी जाए तो कुछ नहीं बिगड़ता — आपका खाता और मुफ़्त बिल वैसे ही रहते हैं, और आप विवरण टाइप कर सकते हैं।'
          : 'If a PDF will not read, nothing is lost — your account and your free bills stay as they are, and you can type the details in instead.'}</span>
      </div>
    </div>
  );
}
