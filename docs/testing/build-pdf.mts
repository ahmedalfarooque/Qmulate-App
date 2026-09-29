/*
 * Build the printable hand-out: docs/testing/TESTING-GUIDE.md → docs/testing/TESTING-GUIDE.pdf
 *
 * Run from apps/web (Playwright's Chromium lives in its dependency tree):
 *
 *   SHOTS=/path/to/print-screenshots pnpm --filter web exec tsx ../../docs/testing/build-pdf.mts
 *
 * `SHOTS` is the directory holding VIEWPORT-ONLY screenshots (taken with
 * `FULLPAGE=0 VIEWPORT_H=1400 OUT=<dir> … screenshots.mts`). The full-page images committed under
 * docs/testing/screenshots/ are too tall to print legibly; the same file names are used so the
 * markdown needs no change. Falls back to docs/testing/screenshots/ when SHOTS is unset.
 *
 * Markdown → HTML is done by `marked` through `pnpm dlx` (no dependency added to the workspace);
 * HTML → PDF by Chromium's print engine (A4, footer with page numbers).
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from '../../apps/web/node_modules/@playwright/test/index.mjs';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const SOURCE = join(HERE, 'TESTING-GUIDE.md');
const OUTPUT = join(HERE, 'TESTING-GUIDE.pdf');
const SHOTS = process.env.SHOTS ?? join(HERE, 'screenshots');

const markdown = readFileSync(SOURCE, 'utf8');

/* ── 1 · markdown → html fragment ─────────────────────────────────────────────────────────── */
const fragment = execFileSync('pnpm', ['dlx', 'marked@15.0.12', '--gfm'], {
  input: markdown,
  encoding: 'utf8',
  maxBuffer: 64 * 1024 * 1024,
  stdio: ['pipe', 'pipe', 'ignore'],
});

/* ── 2 · post-process: heading ids, TOC, figures, image paths ─────────────────────────────── */
const slug = (text: string) =>
  text
    .replace(/<[^>]+>/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9؀-ۿ]+/g, '-')
    .replace(/^-|-$/g, '');

const toc: { level: number; id: string; text: string }[] = [];
let body = fragment.replace(/<h([23])>([\s\S]*?)<\/h\1>/g, (_m, level: string, inner: string) => {
  const text = inner.replace(/<[^>]+>/g, '');
  const id = slug(text);
  toc.push({ level: Number(level), id, text });
  return `<h${level} id="${id}">${inner}</h${level}>`;
});

// Every screenshot becomes a captioned figure; the path is rebased onto SHOTS.
body = body.replace(
  /<p>\s*<img src="screenshots\/([^"]+)" alt="([^"]*)"\s*\/?>\s*<\/p>/g,
  (_m, file: string, alt: string) =>
    `<figure><img src="file://${join(SHOTS, file)}" alt="${alt}"><figcaption>${alt}</figcaption></figure>`,
);
// Images nested inside list items (no surrounding <p>).
body = body.replace(
  /<img src="screenshots\/([^"]+)" alt="([^"]*)"\s*\/?>/g,
  (_m, file: string, alt: string) =>
    `<figure><img src="file://${join(SHOTS, file)}" alt="${alt}"><figcaption>${alt}</figcaption></figure>`,
);

// The first paragraph of the markdown is the provenance note; lift it onto the cover.
const provenance = /<p><em>([\s\S]*?)<\/em><\/p>/.exec(body)?.[1] ?? '';
body = body.replace(/<h1>[\s\S]*?<\/h1>\s*<p><em>[\s\S]*?<\/em><\/p>/, '');

const tocHtml = toc
  .map(
    (entry) =>
      `<li class="lvl${entry.level}"><a href="#${entry.id}">${entry.text}</a></li>`,
  )
  .join('\n');

const today = new Date().toISOString().slice(0, 10);

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>QMULATE — Testing Strategy and Hands-on Testing Guide</title>
<style>
  @page { size: A4; margin: 18mm 16mm 20mm 16mm; }
  :root {
    --ink: #14161c; --mist: #5b6170; --line: #d7dae2; --paper: #ffffff; --tint: #eef0f5;
    --brand: #2e3fd6; --warn: #b26a00; --danger: #b3261e;
  }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: var(--paper); color: var(--ink);
    font: 10.5pt/1.45 -apple-system, "Helvetica Neue", Helvetica, Arial, "IBM Plex Sans Arabic", sans-serif; }
  code, pre, kbd { font-family: "SF Mono", Menlo, Consolas, "Geist Mono", monospace; }

  /* cover */
  .cover { height: 250mm; display: flex; flex-direction: column; justify-content: space-between;
    page-break-after: always; padding: 10mm 4mm; }
  .cover .brand { font-weight: 700; letter-spacing: 0.18em; font-size: 12pt; color: var(--brand); }
  .cover h1 { font-size: 30pt; line-height: 1.12; margin: 0 0 6mm; letter-spacing: -0.01em; }
  .cover .sub { font-size: 13pt; color: var(--mist); max-width: 150mm; }
  .cover .meta { border-top: 1px solid var(--line); padding-top: 5mm; font-size: 9.5pt; color: var(--mist); }
  .cover .meta b { color: var(--ink); }
  .cover .notice { background: var(--tint); border-left: 3px solid var(--warn); padding: 4mm 5mm; margin: 6mm 0; font-size: 9.5pt; }

  /* toc */
  .toc { page-break-after: always; }
  .toc h2 { page-break-before: auto; margin-bottom: 3mm; }
  .toc ul { list-style: none; padding: 0; margin: 0; columns: 1; }
  .toc li { padding: 0.9mm 0; border-bottom: 1px dotted var(--line); font-size: 9.8pt; }
  .toc li.lvl3 { padding-left: 8mm; font-size: 9pt; color: var(--mist); }
  .toc a { color: inherit; text-decoration: none; }

  /* text */
  h1, h2, h3, h4 { line-height: 1.2; letter-spacing: -0.01em; page-break-after: avoid; }
  h2 { font-size: 18pt; margin: 0 0 4mm; padding-top: 2mm; page-break-before: always; border-bottom: 2px solid var(--ink); padding-bottom: 2mm; }
  h3 { font-size: 13pt; margin: 8mm 0 2.5mm; color: var(--ink); }
  h4 { font-size: 11pt; margin: 5mm 0 2mm; }
  p { margin: 0 0 3mm; orphans: 3; widows: 3; }
  a { color: var(--brand); text-decoration: none; }
  hr { border: 0; border-top: 1px solid var(--line); margin: 6mm 0; }
  strong { font-weight: 650; }
  ul, ol { margin: 0 0 3mm; padding-left: 6mm; }
  li { margin: 0 0 1.4mm; }
  li > ul, li > ol { margin-top: 1.2mm; }
  blockquote { margin: 0 0 3mm; padding: 2mm 4mm; border-left: 3px solid var(--line); color: var(--mist); }

  code { font-size: 9pt; background: var(--tint); padding: 0.2mm 1.2mm; border-radius: 1mm; }
  pre { font-size: 8.6pt; line-height: 1.4; background: var(--tint); border: 1px solid var(--line); border-radius: 1.5mm;
    padding: 3mm 3.5mm; margin: 0 0 3.5mm; white-space: pre-wrap; word-break: break-word; page-break-inside: avoid; }
  pre code { background: none; padding: 0; font-size: inherit; }

  table { width: 100%; border-collapse: collapse; margin: 0 0 4mm; font-size: 8.8pt; page-break-inside: auto; }
  thead { display: table-header-group; }
  tr { page-break-inside: avoid; }
  th, td { text-align: left; vertical-align: top; padding: 1.6mm 2mm; border-bottom: 1px solid var(--line); }
  th { background: var(--tint); font-weight: 650; border-bottom: 1.5px solid var(--ink); }
  td code, th code { font-size: 8.2pt; }

  figure { margin: 3mm 0 5mm; page-break-inside: avoid; text-align: center; }
  figure img { max-width: 100%; max-height: 150mm; width: auto; height: auto; object-fit: contain;
    border: 1px solid var(--line); border-radius: 1.5mm; box-shadow: 0 1px 2px rgba(0,0,0,.08); }
  figcaption { font-size: 8.5pt; color: var(--mist); margin-top: 1.5mm; }
  li figure { text-align: left; }
</style>
</head>
<body>

<section class="cover">
  <div>
    <div class="brand">QMULATE</div>
    <h1>Testing Strategy and<br>Hands-on Testing Guide</h1>
    <p class="sub">How the product is tested, how to run every layer, how to sign in as each user type, and where to go to test each feature — with screenshots and the expected result.</p>
    <div class="notice"><b>Fixture-only.</b> Every name, number, e-mail and password in this guide is an invented, published constant from the fixture seed. Nothing here is a secret and nothing here is real client data. Do not enter real data into a fixture-only environment.</div>
  </div>
  <div class="meta">
    <p><b>Audience</b> — testers, operators and reviewers of the QMULATE Nazarah platform (internal).</p>
    <p><b>Provenance</b> — ${provenance}</p>
    <p><b>Printed</b> — ${today}. Source of truth: <code>docs/testing/TESTING-GUIDE.md</code> in the repository; when the two disagree, the repository wins.</p>
  </div>
</section>

<section class="toc">
  <h2>Contents</h2>
  <ul>
${tocHtml}
  </ul>
</section>

${body}

</body>
</html>`;

/* ── 3 · html → pdf ───────────────────────────────────────────────────────────────────────── */
const dir = mkdtempSync(join(tmpdir(), 'qm-guide-pdf-'));
const htmlPath = join(dir, 'guide.html');
writeFileSync(htmlPath, html, 'utf8');

const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto(`file://${htmlPath}`, { waitUntil: 'load' });
// Wait for every image to decode before printing.
await page.evaluate(async () => {
  await Promise.all(
    Array.from(document.images).map((img) =>
      img.complete ? Promise.resolve() : new Promise((done) => { img.onload = done; img.onerror = done; }),
    ),
  );
});
const missing = await page.evaluate(() =>
  Array.from(document.images).filter((img) => img.naturalWidth === 0).map((img) => img.getAttribute('src')),
);
if (missing.length > 0) {
  console.error('images that did not load:\n  ' + missing.join('\n  '));
}
await page.pdf({
  path: OUTPUT,
  format: 'A4',
  printBackground: true,
  displayHeaderFooter: true,
  headerTemplate: '<span></span>',
  footerTemplate: `<div style="width:100%;font-size:7.5pt;color:#5b6170;padding:0 16mm;display:flex;justify-content:space-between;font-family:-apple-system,Helvetica,Arial,sans-serif;">
    <span>QMULATE · Testing Strategy and Hands-on Testing Guide · fixture-only</span>
    <span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span>
  </div>`,
  margin: { top: '18mm', right: '16mm', bottom: '20mm', left: '16mm' },
});
await browser.close();
console.log(`wrote ${OUTPUT} (${missing.length} missing images) from ${SHOTS}`);
