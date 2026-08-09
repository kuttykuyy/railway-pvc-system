import { readFileSync } from 'fs';
async function main() {
  const pdfjs: any = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await pdfjs.getDocument({ data: new Uint8Array(readFileSync(process.argv[2])), useSystemFonts: true }).promise;
  for (const n of [79, 80, 81]) {
    const c = await (await doc.getPage(n)).getTextContent();
    const t = c.items.map((i: any) => i.str).join(' ').replace(/\s+/g, ' ').trim();
    console.log(`\n===== page ${n} =====\n${t.slice(n === 79 ? 2400 : 0, n === 79 ? 5200 : 2400)}`);
  }
}
main().catch(e => { console.error('ERR', e.message); process.exit(1); });
