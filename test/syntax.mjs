// Syntax check for the embedded <script> in the single-file app.
// Compiles (does NOT run) the entire script body via vm; throws on a syntax error.
//
//   node test/syntax.mjs

import fs from 'fs';
import vm from 'vm';
import { HTML_PATH } from './harness.mjs';

const text = fs.readFileSync(HTML_PATH, 'utf8');
const lines = text.split('\n');
const start = lines.findIndex(l => l.trim() === '<script>');
const end = lines.findIndex((l, i) => i > start && l.trim() === '</script>');
if (start < 0 || end < 0) {
  console.error('✗ syntax: could not locate <script>…</script>');
  process.exit(1);
}
const body = lines.slice(start + 1, end).join('\n');
try {
  new vm.Script(body, { filename: 'app-under-test.js' }); // compile only
  console.log(`✓ syntax OK — ${end - start - 1} lines of embedded JS compile cleanly`);
  process.exit(0);
} catch (e) {
  console.error('✗ syntax error:', e.message);
  process.exit(1);
}
