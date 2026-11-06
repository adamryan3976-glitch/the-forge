// Moves the Apps Script build to dist/gas/forge-app.html, where GitHub Pages
// publishes it for the Apps Script to download.
import fs from 'node:fs';
const from = 'dist-gas/gas.html';
const html = fs.readFileSync(from, 'utf8');
if (!html.includes('data-forge-app="1"')) throw new Error('Apps Script build is missing its marker.');
if (/<script[^>]+src=|<link[^>]+href="(?!data:)[^"]*\.css/.test(html)) throw new Error('Apps Script build is not self-contained.');
fs.mkdirSync('dist/gas', { recursive: true });
fs.writeFileSync('dist/gas/forge-app.html', html);
console.log(`dist/gas/forge-app.html ${(html.length / 1024).toFixed(0)} KB`);
