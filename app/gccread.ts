import { readFileSync } from 'fs';
async function main() {
  const pdfjs: any = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await pdfjs.getDocument({ data: new Uint8Array(readFileSync(process.argv[2])), useSystemFonts: true }).promise;
  const want = /46\s*A|price\s*variation|classification/i;
  for (let n = 1; n <= doc.numPages; n++) {
    const c = await (await doc.getPage(n)).getTextContent();
    const t = c.items.map((i: any) => i.str).join(' ').replace(/\s+/g, ' ').trim();
    if (want.test(t)) console.log(`\n--- p${n} ---\n${t.slice(0, 900)}`);
  }
}
main().catch(e => { console.error('ERR', e.message); process.exit(1); });
