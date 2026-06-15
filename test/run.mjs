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
        FIN_PROPS, D3_FINISHES, S, VANITY_PARTS, d3ItemSkus, vanityAssemblyTotals,
        benchTakeoff, stoneTakeoffSum, stoneTakeoffKeys, d3BenchSpec,
        cabinetryTakeoff, rateOf } = app;

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

// build-a-vanity (Task 4) — components separately priced + line-itemised
ok('VANITY_PARTS defined', Array.isArray(VANITY_PARTS) && VANITY_PARTS.length >= 8);
ok('vanity parts merged into BASE (cabinet resolves)', !!getBase('VC-750-WH'));
ok('vanity parts merged into BASE (benchtop resolves)', !!getBase('VB-750-ST'));
ok('vanity parts resolve a supplier (never blank)',
  VANITY_PARTS.every(p => !!supplierFor({ sku: p.sku })));
{
  const comp = { cabinet: 'VC-750-WH', benchtop: 'VB-750-ST', basin: 'VBSN-ABV', tapware: '10330' };
  const t = vanityAssemblyTotals(comp);
  eq('vanity assembly = 4 line items', t.lines.length, 4);
  const cab = getBase('VC-750-WH'), bt = getBase('VB-750-ST'), bs = getBase('VBSN-ABV'), tp = getBase('10330');
  approx('vanity sellEx = sum of component sells', t.sellEx, cab.sell + bt.sell + bs.sell + tp.sell);
  approx('vanity buy = sum of component buys (internal only)', t.buy, cab.buy + bt.buy + bs.buy + tp.buy);
  approx('vanity gp = sell - buy', t.gp, t.sellEx - t.buy);
  approx('vanity sellInc applies GST', t.sellInc, t.sellEx * (1 + S.settings.gst / 100));
  ok('each line carries its own sell (separately priced)', t.lines.every(l => typeof l.sell === 'number'));
  // d3ItemSkus expands an assembly into its component SKUs; plain items stay single
  const skus = d3ItemSkus({ components: comp }).map(s => s.sku);
  eq('d3ItemSkus expands assembly to 4 skus', skus.length, 4);
  ok('d3ItemSkus keeps component order cabinet->tapware',
    skus[0] === 'VC-750-WH' && skus[3] === '10330');
  eq('d3ItemSkus plain item -> single sku', d3ItemSkus({ sku: '10330' }).length, 1);
  eq('d3ItemSkus empty item -> none', d3ItemSkus({}).length, 0);
  // partial assembly (skip basin) -> 3 lines, still priced
  eq('vanity partial assembly skips missing parts',
    vanityAssemblyTotals({ cabinet: 'VC-750-WH', benchtop: 'VB-750-ST', tapware: '10330' }).lines.length, 3);
}

// stone benchtop auto-takeoff (Task 5)
{
  const t = benchTakeoff({ w: 750, d: 465, sinks: 1 });
  approx('benchTakeoff area m² = w*d', t.area_m2, 0.349, 1e-3);
  approx('benchTakeoff edge lm = front + 2 ends', t.edge_lm, 0.75 + 2 * 0.465, 1e-3);
  eq('benchTakeoff sink cut-outs', t.sink_cuts, 1);
  eq('benchTakeoff no waterfalls by default', t.waterfalls, 0);
  // a waterfall end removes that end from edge lm and counts as 'ea'
  const wf = benchTakeoff({ w: 1200, d: 600, waterfalls: 1, sinks: 1 });
  approx('benchTakeoff waterfall edge = front + 1 end', wf.edge_lm, 1.2 + 1 * 0.6, 1e-3);
  eq('benchTakeoff waterfall count', wf.waterfalls, 1);
  // aggregate + map to existing rate keys
  const sum = stoneTakeoffSum([{ w: 750, d: 465, sinks: 1 }, { w: 1200, d: 600, waterfalls: 1, undermount: 1 }]);
  eq('stoneTakeoffSum counts benches', sum.benches, 2);
  approx('stoneTakeoffSum total area', sum.area_m2, +(0.349 + 0.72).toFixed(2), 0.01);
  eq('stoneTakeoffSum undermount cuts', sum.undermount_cuts, 1);
  const keys = stoneTakeoffKeys(sum);
  ok('takeoff maps onto stone_20 (area)', keys.stone_20 === sum.area_m2);
  ok('takeoff maps onto stone_edge (lm)', keys.stone_edge === sum.edge_lm);
  ok('takeoff maps onto stone_waterfall / cut-outs',
    keys.stone_waterfall === 1 && keys.stone_cut_under === 1 && keys.stone_cut_sink === 1);
  // every mapped key is a real Pricing-Setup rate key
  const rateKeys = new Set();
  app.RATE_DEFS.forEach(g => g.items.forEach(it => rateKeys.add(it.k)));
  ok('all takeoff keys exist in RATE_DEFS', Object.keys(keys).every(k => rateKeys.has(k)));
  // basin type drives the cut-out kind
  const above = d3BenchSpec({ def: { id: 'vanity', bw: 750, bd: 465 }, components: { basin: 'VBSN-ABV' } });
  eq('above-counter basin -> no benchtop cut-out', above.sinks + above.undermount, 0);
  const under = d3BenchSpec({ def: { id: 'vanity', bw: 750, bd: 465 }, components: { basin: 'VBSN-UM' } });
  eq('undermount basin -> 1 undermount cut-out', under.undermount, 1);
  const dbl = d3BenchSpec({ def: { id: 'vanity', bw: 1200, bd: 465 }, sty: 'double', components: {} });
  eq('double vanity -> 2 sink cut-outs', dbl.sinks, 2);
}

// wardrobe + kitchen cabinetry pricing (Task 6) — reuses existing cabinetry rates
{
  const rateKeys = new Set();
  app.RATE_DEFS.forEach(g => g.items.forEach(it => rateKeys.add(it.k)));
  // wardrobe joinery -> cab_wardrobe lineal metres
  const wardrobe = [
    { def: { id: 'hang', bw: 1200 } },
    { def: { id: 'shelves', bw: 900 } },
    { def: { id: 'drawers', bw: 900 } },
    { def: { id: 'mdoor', bw: 600 } },
  ];
  const wq = cabinetryTakeoff(wardrobe);
  approx('wardrobe cabinetry lm = sum of widths', wq.cab_wardrobe, 1.2 + 0.9 + 0.9 + 0.6, 1e-2);
  ok('wardrobe uses the cab_wardrobe rate key', rateKeys.has('cab_wardrobe'));
  approx('wardrobe price = lm × rate', wq.cab_wardrobe * rateOf('cab_wardrobe'), 3.6 * rateOf('cab_wardrobe'), 1e-6);
  // kitchen joinery -> graded base/over/island/tall keys
  const kitchen = [
    { def: { id: 'kbench', bw: 1800 } },
    { def: { id: 'ksink', bw: 800 } },
    { def: { id: 'island', bw: 1600 } },
    { def: { id: 'ohead', bw: 1500 } },
    { def: { id: 'tall', bw: 700 } },
  ];
  const kq = cabinetryTakeoff(kitchen);
  approx('kitchen base run lm (kbench+ksink)', kq.cab_base_lam, 1.8 + 0.8, 1e-2);
  approx('kitchen island lm', kq.cab_island_lam, 1.6, 1e-2);
  approx('kitchen overhead lm', kq.cab_over_lam, 1.5, 1e-2);
  approx('kitchen tall lm', kq.cab_tall_lam, 0.7, 1e-2);
  ok('all kitchen cabinetry keys exist in RATE_DEFS', Object.keys(kq).every(k => rateKeys.has(k)));
  // grade switches the rate key
  const kq2 = cabinetryTakeoff([{ def: { id: 'kbench', bw: 1800 } }], '2pac');
  ok('grade selects the 2pac rate key', kq2.cab_base_2pac === 1.8 && rateKeys.has('cab_base_2pac'));
  // item dims override def width
  eq('drawn width overrides def bw',
    cabinetryTakeoff([{ def: { id: 'hang', bw: 1200 }, dims: { w: 2400 } }]).cab_wardrobe, 2.4);
  // non-cabinetry items (e.g. a bathroom vanity) are not charged as cabinetry
  eq('vanity not counted as cabinetry', Object.keys(cabinetryTakeoff([{ def: { id: 'vanity', bw: 900 } }])).length, 0);
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
