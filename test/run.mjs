// Test rig + 4 audits + catalogue integrity check for HomeReno_Business_System.
//
//   node test/run.mjs
//
// Exits 0 only when: every test passes, all 4 audits are clean, and the
// integrity check matches test/expected.json. Anything red -> exit 1.
//
// The 4 audits enforce the non-negotiables:
//   AUDIT 1  Client never sees cost/profit   (client portals carry no cost tokens)
//   AUDIT 2  Suppliers never blank           (every catalogue product resolves a supplier)
//   AUDIT 3  Product vs construction quotes   (quotes only ever typed product|construction)
//   AUDIT 4  Nothing hard-deleted (financial) (sales soft-cancel + audit log; invoices never spliced)

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { loadApp, HTML_PATH } from './harness.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EXPECTED = JSON.parse(fs.readFileSync(path.join(__dirname, 'expected.json'), 'utf8'));
const SRC = fs.readFileSync(HTML_PATH, 'utf8');

// ── tiny assert framework ───────────────────────────────────────────────────
let pass = 0; const failures = [];
function ok(name, cond, detail) {
  if (cond) { pass++; } else { failures.push(name + (detail ? ' — ' + detail : '')); }
}
function eq(name, got, want) {
  ok(name, got === want, `expected ${JSON.stringify(want)}, got ${JSON.stringify(got)}`);
}
function approx(name, got, want, tol = 1e-6) {
  ok(name, Math.abs(got - want) <= tol, `expected ~${want}, got ${got}`);
}
function fnBody(name) {
  const m = new RegExp('function\\s+' + name + '\\s*\\(').exec(SRC);
  if (!m) return null;
  let i = SRC.indexOf('{', m.index), d = 0; const start = i;
  for (; i < SRC.length; i++) {
    const c = SRC[i];
    if (c === '{') d++; else if (c === '}') { d--; if (d === 0) return SRC.slice(start, i + 1); }
  }
  return null;
}

const app = loadApp();
const { CAT, BASE, getBase, fmt, today, pad, qT, iT, iP, priceFor, estTotals, supplierFor,
        FIN_PROPS, D3_FINISHES, S } = app;

// ── TEST RIG ────────────────────────────────────────────────────────────────
// formatting / utils
eq('fmt currency', fmt(1234.5), '$1,234.50');
eq('fmt zero', fmt(0), '$0.00');
eq('fmt null-safe', fmt(null), '$0.00');
ok('today ISO shape', /^\d{4}-\d{2}-\d{2}$/.test(today()));
eq('pad default width', pad(7), '0007');
eq('pad custom width', pad(12, 2), '12');

// catalogue lookups
eq('getBase known sku buy', getBase('10392') && getBase('10392').buy, 79);
eq('getBase unknown -> null', getBase('__nope__'), null);

// quote / invoice maths (gst default 10%)
eq('settings gst default', S.settings.gst, 10);
approx('qT total inc GST', qT({ lines: [{ qty: 2, price: 100, disc: 0 }] }), 220);
approx('qT applies discount', qT({ lines: [{ qty: 1, price: 100, disc: 10 }] }), 99);
approx('iT total inc GST', iT({ lines: [{ qty: 2, price: 100, disc: 0 }] }), 220);
eq('iT cancelled -> 0', iT({ cancelled: true, lines: [{ qty: 2, price: 100 }] }), 0);
eq('iT void -> 0', iT({ void: true, lines: [{ qty: 2, price: 100 }] }), 0);
approx('iP known sku profit', iP({ lines: [{ qty: 1, price: 150, sku: '10392' }] }), 150 - 79);
approx('iP unknown sku fallback (price/1.5)', iP({ lines: [{ qty: 1, price: 150, sku: '__nope__' }] }), 50);
eq('iP cancelled line ignored', iP({ lines: [{ qty: 1, price: 150, sku: '10392', cancelled: true }] }), 0);

// priceFor: customer markup vs default sell
eq('priceFor default -> sell', priceFor({ buy: 100, sell: 150 }), 150);
{
  const cid = 'CU_TEST';
  S.customers.push({ id: cid, name: 'Markup Co', mk: 20 });
  eq('priceFor customer markup', priceFor({ buy: 100, sell: 150 }, cid), 120);
  S.customers.pop();
}

// estimate master totals + profit control point
{
  const est = {
    lines: [{ qty: 2, rate: 100, trade: 'Plumbing', label: 'Rough-in' }],
    custom: [],
    products: [{ sell: 150, buy: 100, qty: 1, cat: 'Basin Mixers' }],
    unlinked: 0,
  };
  const t = estTotals(est);
  approx('estTotals exTotal', t.exTotal, 350);
  approx('estTotals incTotal', t.incTotal, 385);
  approx('estTotals constCost (markup reversed)', t.constCost, 160);
  approx('estTotals internal cost', t.internal, 260);
  approx('estTotals gross profit', t.gp, 90);
  approx('estTotals margin %', t.margin, 90 / 350 * 100, 1e-6);
}

// finish/material map (Task 1 relies on this)
ok('D3_FINISHES non-empty', Array.isArray(D3_FINISHES) && D3_FINISHES.length >= 7);
for (const [name] of D3_FINISHES) {
  const fp = FIN_PROPS[name] || FIN_PROPS[name.split('/')[0]];
  ok('FIN_PROPS covers finish: ' + name, !!fp);
  if (fp) {
    ok('metalness in range: ' + name, fp.m >= 0 && fp.m <= 1, `m=${fp.m}`);
    ok('roughness in range: ' + name, fp.r >= 0 && fp.r <= 1, `r=${fp.r}`);
  }
}

// ── AUDITS ──────────────────────────────────────────────────────────────────
const auditResults = [];
function audit(name, problems) {
  auditResults.push({ name, ok: problems.length === 0, problems });
}

// AUDIT 1 — Client never sees cost/profit.
{
  const COST = [/\.buy\b/, /\.sell\b/, /\bprofit\b/, /iP\(/, /\.markup\b/, /\bgross\b/];
  const problems = [];
  for (const fn of ['pjPortalHTML', 'pjPortalStandalone', 'pjPortalExport']) {
    const b = fnBody(fn);
    if (!b) { problems.push(`${fn}: function not found`); continue; }
    for (const re of COST) if (re.test(b)) problems.push(`${fn}: leaks ${re}`);
  }
  audit('Client never sees cost/profit', problems);
}

// AUDIT 2 — Suppliers never blank.
{
  const blank = {};
  for (const b of BASE) if (!supplierFor({ sku: b.sku })) blank[b.cat] = (blank[b.cat] || 0) + 1;
  audit('Suppliers never blank',
    Object.keys(blank).map(c => `${blank[c]} products in "${c}" have no supplier`));
}

// AUDIT 3 — Product vs construction quotes stay separate.
{
  const types = [...SRC.matchAll(/S\.quotes\.push\(\{[^]*?type:'([a-z]+)'/g)].map(m => m[1]);
  const bad = types.filter(t => t !== 'product' && t !== 'construction');
  const problems = [];
  if (!types.length) problems.push('no S.quotes.push with a type found');
  if (bad.length) problems.push('unexpected quote types: ' + bad.join(', '));
  audit('Product vs construction quotes separate', problems);
}

// AUDIT 4 — Nothing hard-deleted (financial records).
{
  const problems = [];
  if (/S\.invoices\.splice\(/.test(SRC)) problems.push('S.invoices.splice present (invoices hard-deleted)');
  for (const fn of ['saleCancel', 'saleLineCancel']) {
    const b = fnBody(fn);
    if (!b) { problems.push(`${fn}: not found`); continue; }
    if (!/cancelled\s*=\s*true|\.void\s*=\s*true|void:true/.test(b)) problems.push(`${fn}: does not set a cancelled/void flag`);
    if (!/auditLog\(/.test(b)) problems.push(`${fn}: does not write to auditLog`);
  }
  audit('Nothing hard-deleted (financial)', problems);
}

// ── INTEGRITY CHECK (catalogue) ─────────────────────────────────────────────
const integrity = [];
(function () {
  if (CAT.length !== EXPECTED.catalogue)
    integrity.push(`CAT length ${CAT.length} != expected ${EXPECTED.catalogue}`);
  const uniq = new Set(CAT.map(p => p.s)).size;
  if (uniq !== EXPECTED.uniqueSkus)
    integrity.push(`unique SKUs ${uniq} != expected ${EXPECTED.uniqueSkus}`);
  let badStruct = 0, badNum = 0, negMargin = 0;
  for (const p of CAT) {
    if (!p.s || typeof p.s !== 'string' || !p.n || !p.c) badStruct++;
    if ([p.q, p.b, p.p].some(v => typeof v !== 'number' || Number.isNaN(v) || v < 0)) badNum++;
    if (typeof p.p === 'number' && typeof p.b === 'number' && p.p < p.b) negMargin++;
  }
  if (badStruct) integrity.push(`${badStruct} products missing sku/name/category`);
  if (badNum) integrity.push(`${badNum} products with bad/negative qty|buy|sell`);
  if (negMargin) integrity.push(`${negMargin} products priced below cost (sell < buy)`);
})();

// ── REPORT ──────────────────────────────────────────────────────────────────
const C = { g: '\x1b[32m', r: '\x1b[31m', y: '\x1b[33m', dim: '\x1b[2m', x: '\x1b[0m' };
console.log('\n' + '═'.repeat(60));
console.log(' HomeReno Business System — test rig + audits + integrity');
console.log('═'.repeat(60));

const total = pass + failures.length;
console.log(`\n${failures.length ? C.r : C.g}TESTS  ${pass}/${total} passed${C.x}`);
failures.forEach(f => console.log(`  ${C.r}✗ ${f}${C.x}`));

console.log('\nAUDITS');
auditResults.forEach(a => {
  console.log(`  ${a.ok ? C.g + '✓' : C.r + '✗'} ${a.name}${C.x}`);
  a.problems.forEach(p => console.log(`      ${C.r}- ${p}${C.x}`));
});
const auditsClean = auditResults.every(a => a.ok);

console.log('\nINTEGRITY');
if (!integrity.length) {
  console.log(`  ${C.g}✓ catalogue ${CAT.length} rows / ${new Set(CAT.map(p => p.s)).size} unique SKUs${C.x}`);
} else {
  integrity.forEach(p => console.log(`  ${C.r}✗ ${p}${C.x}`));
}

const allGreen = failures.length === 0 && auditsClean && integrity.length === 0;
console.log('\n' + '─'.repeat(60));
console.log(allGreen
  ? `${C.g} ALL GREEN — ${pass} tests, 4/4 audits clean, integrity OK${C.x}`
  : `${C.r} RED — ${failures.length} test failures, ${auditResults.filter(a => !a.ok).length} audit issues, ${integrity.length} integrity issues${C.x}`);
console.log('─'.repeat(60) + '\n');

process.exit(allGreen ? 0 : 1);
