import { readFileSync } from 'fs';
async function main() {
  const pdfjs: any = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await pdfjs.getDocument({ data: new Uint8Array(readFileSync(process.argv[2])), useSystemFonts: true }).promise;
  console.log('pages:', doc.numPages);
  for (let n = 1; n <= doc.numPages; n++) {
    const c = await (await doc.getPage(n)).getTextContent();
    const t = c.items.map((i: any) => i.str).join(' ').replace(/\s+/g, ' ').trim();
    if (/46\s*A\.?\s*6|Classification of works|Earth\s*work in formation/i.test(t)) {
      console.log(`\n========== page ${n} ==========\n${t.slice(0, 2600)}`);
    }
  }
}
main().catch(e => { console.error('ERR', e.message); process.exit(1); });
