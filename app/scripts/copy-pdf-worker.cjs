/**
 * Puts pdf.js's worker where the browser can fetch it: /pdf.worker.min.mjs on our own
 * origin.
 *
 * The worker cannot come from anywhere else. A CDN copy is refused twice over —
 * browsers do not run cross-origin workers, and our CSP blocks the fallback import.
 * And it cannot be bundled: the server needs pdfjs-dist listed as a server-external
 * (its fake worker resolves a sibling file that bundling separates from it), and that
 * same listing makes webpack refuse `new URL(...)` asset references to the package
 * from client code. A plain file in /public answers both: same origin for the browser,
 * no bundler involvement at all, and version-matched because it is copied from the
 * installed package on every build.
 *
 * Runs as prebuild/predev; the copy is gitignored.
 */
const fs = require('fs');
const path = require('path');

const src = path.join(__dirname, '..', 'node_modules', 'pdfjs-dist', 'build', 'pdf.worker.min.mjs');
const dest = path.join(__dirname, '..', 'public', 'pdf.worker.min.mjs');

fs.copyFileSync(src, dest);
console.log(`Copied pdf.js worker to public/ (${(fs.statSync(dest).size / 1024).toFixed(0)} KB)`);
