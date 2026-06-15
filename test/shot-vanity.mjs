// Renders a build-a-vanity assembly in the room (Task 4 visual check).
//   node test/shot-vanity.mjs <out.png>
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer';
import { HTML_PATH } from './harness.mjs';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const THREE_SRC = fs.readFileSync(path.join(__dirname, 'vendor', 'three.min.js'), 'utf8');
const out = process.argv[2] || '/tmp/vanity.png';
const W = 1100, H = 800;
const browser = await puppeteer.launch({ headless: 'new',
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
try {
  const page = await browser.newPage();
  await page.setViewport({ width: W, height: H, deviceScaleFactor: 1 });
  page.on('pageerror', e => console.error('PAGE ERROR:', e.message));
  await page.goto('file://' + HTML_PATH, { waitUntil: 'domcontentloaded' });
  await page.addScriptTag({ content: THREE_SRC });
  await page.evaluate(() => { window._3 = window.THREE; });
  const diag = await page.evaluate(async (cfg) => {
    try {
      const pg = document.getElementById('pg-design3d'); if (pg) { pg.classList.add('on'); pg.style.display = 'block'; }
      const c = document.getElementById('d3-canvas'); c.style.width = cfg.W + 'px'; c.style.height = cfg.H + 'px'; c.style.display = 'block';
      const ov = document.getElementById('login-overlay'); if (ov) ov.style.display = 'none';
      if (!D3.inited) initD3();
      d3Resize();
      const it = buildVanity({ cabinet: 'VC-750-WH', benchtop: 'VB-750-ST', basin: 'VBSN-ABV', tapware: '10330', wall: 0, off: 1500 });
      D3.auto = false; D3.orb = { th: 0.28, ph: 1.46, r: 2.25, ty: 1.0 }; d3Cam();
      return { ok: true, components: it && it.components, skus: d3ItemSkus(it).map(s => s.sku),
               lines: vanityAssemblyTotals(it.components).lines.length };
    } catch (e) { return { ok: false, err: e.message + '\n' + e.stack }; }
  }, { W, H });
  if (!diag.ok) throw new Error('vanity seed failed: ' + diag.err);
  await new Promise(r => setTimeout(r, 700));
  const dataUrl = await page.evaluate(() => {
    const c = document.getElementById('d3-canvas');
    D3.ren.setPixelRatio(2); D3.ren.setSize(c.clientWidth, c.clientHeight); D3.ren.render(D3.scene, D3.cam);
    return D3.ren.domElement.toDataURL('image/png');
  });
  fs.writeFileSync(out, Buffer.from(dataUrl.split(',')[1], 'base64'));
  console.log(`✓ ${out} — vanity ${diag.lines} line items, skus ${diag.skus.join('+')}`);
} finally { await browser.close(); }
