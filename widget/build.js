// Emits the paste-ready Custom-HTML blocks from the single widget source, so a
// design change is one edit here and a re-paste, not four hand-kept copies.
const fs = require('fs');
const path = require('path');

const SRC = fs.readFileSync(path.join(__dirname, 'sgv-draws.js'), 'utf8');
const OUT = path.join(__dirname, 'dist');
fs.mkdirSync(OUT, { recursive: true });

const TARGETS = [
  { file: 'express-entry-fa.html', program: 'ee', lang: 'fa', rows: 10, note: 'Express Entry — Farsi (sugimotovisa.com)' },
  { file: 'express-entry-en.html', program: 'ee', lang: 'en', rows: 10, note: 'Express Entry — English' },
  { file: 'bc-pnp-fa.html',       program: 'bc', lang: 'fa', rows: 10, note: 'BC PNP Skills Immigration — Farsi' },
  { file: 'bc-pnp-en.html',       program: 'bc', lang: 'en', rows: 10, note: 'BC PNP Skills Immigration — English' }
];

for (const t of TARGETS) {
  const html =
    `<!-- ${t.note} -->\n` +
    `<!-- Paste this whole block into a WordPress "Custom HTML" block. -->\n` +
    `<!-- Nothing else on the page is touched; the table loads live in the browser. -->\n` +
    `<div class="sgv-draws" data-program="${t.program}" data-lang="${t.lang}" data-rows="${t.rows}"></div>\n` +
    `<script>\n${SRC}</script>\n`;
  fs.writeFileSync(path.join(OUT, t.file), html);
  console.log(`${t.file.padEnd(24)} ${String(html.length).padStart(6)} bytes`);
}
