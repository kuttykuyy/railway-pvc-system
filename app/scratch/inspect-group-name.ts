import fs from 'fs';
import { extractPositionedPdfPages } from '../lib/pdf-layout-extract';

async function main() {
  const buf = fs.readFileSync(String.raw`C:\Users\Admin\OneDrive\New folder\Desktop\Signed Bill (16).pdf`);
  const pages = await extractPositionedPdfPages(buf);
  for (const page of pages) {
    const sorted = [...page.items].sort((a,b)=>a.y-b.y||a.x-b.x);
    const lines: Array<{y:number, text:string}> = [];
    for (const item of sorted) {
      const line = lines.find(l => Math.abs(l.y-item.y)<=2.5);
      if (line) line.text += ' ' + item.text; else lines.push({y:item.y, text:item.text});
    }
    for (const l of lines) {
      if (/group name/i.test(l.text)) {
        console.log('page', page.pageNumber, 'y', l.y, JSON.stringify(l.text));
      }
    }
  }
}
main().catch(e=>{console.error(e);process.exit(1);});
