// TEMP diagnostic — run the reader over a folder of bills.
import fs from 'fs';
import path from 'path';
import { parseIrepsBillPdfDirect } from './lib/ireps-direct-pdf-parser';

(async () => {
  const targets = process.argv.slice(2);
  const files = targets.flatMap(t => fs.statSync(t).isDirectory()
    ? fs.readdirSync(t).filter(n => n.toLowerCase().endsWith('.pdf')).sort().map(n => path.join(t, n))
    : [t]);
  for (const p of files) {
    const label = path.basename(p).slice(0, 26).padEnd(27);
    try {
      const r = await parseIrepsBillPdfDirect(fs.readFileSync(p));
      console.log(`OK   ${label} ${r.billNo.padEnd(30)} gross ${String(r.grossBillAmount).padEnd(12)} items ${String(r.items.length).padStart(3)}  diff ${r.amountDifference}`);
    } catch (e: any) {
      console.log(`FAIL ${label} ${e.message.split('\n')[0].slice(0, 110)}`);
    }
  }
})();
