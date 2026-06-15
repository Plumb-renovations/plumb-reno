// Screenshot harness for the 3D bathroom designer.
//
//   node test/shot.mjs <out.png> [layout] [orbTh] [orbPh] [orbR] [orbTy] [light]
//
// Loads the single-file app in headless Chrome (software WebGL via SwiftShader),
// injects the locally-vendored Three.js r128 (cdnjs is blocked here), seeds a
// demo bathroom via the app's own auto-layout, and writes a PNG of the render.
//
// This is the "render the designer to an image" half of the screenshot loop used
// for Task 1. It drives the real app code — no rendering is re-implemented here.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer';
import { HTML_PATH } from './harness.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const THREE_SRC = fs.readFileSync(path.join(__dirname, 'vendor', 'three.min.js'), 'utf8');

const out = process.argv[2] || '/tmp/render.png';
const layout = parseInt(process.argv[3] ?? '0', 10);
const orb = {
  th: parseFloat(process.argv[4] ?? '0.62'),
  ph: parseFloat(process.argv[5] ?? '1.18'),
  r: parseFloat(process.argv[6] ?? '5.2'),
  ty: parseFloat(process.argv[7] ?? '1.15'),
};
const light = process.argv[8] || 'natural';
const W = 1280, H = 800;

const browser = await puppeteer.launch({
  headless: 'new',
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader',
         '--enable-webgl', '--ignore-gpu-blocklist', `--window-size=${W},${H}`],
});
try {
  const page = await browser.newPage();
  await page.setViewport({ width: W, height: H, deviceScaleFactor: 1 });
  page.on('pageerror', e => console.error('PAGE ERROR:', e.message));

  await page.goto('file://' + HTML_PATH, { waitUntil: 'domcontentloaded' });
  // Provide Three.js BEFORE the designer initialises so its CDN loader short-circuits.
  await page.addScriptTag({ content: THREE_SRC });
  await page.evaluate(() => { window._3 = window.THREE; });

  const diag = await page.evaluate(async (cfg) => {
    try {
      const pg = document.getElementById('pg-design3d');
      if (pg) { pg.classList.add('on'); pg.style.display = 'block'; }
      const c = document.getElementById('d3-canvas');
      c.style.width = cfg.W + 'px'; c.style.height = cfg.H + 'px';
      c.style.display = 'block'; c.style.position = 'relative';
      // hide login overlay if present so nothing covers the page
      const ov = document.getElementById('login-overlay'); if (ov) ov.style.display = 'none';

      if (!D3.inited) initD3();        // builds scene, default 3000×2400 room, lights, loop
      D3.light = cfg.light; d3Lights();
      d3Resize();

      // seed a demo bathroom via the app's auto-layout
      const door = { wall: 1, off: Math.max(80, (D3.W - 820) / 2), w: 820, h: 2040, kind: 'door' };
      const lys = (typeof d3AIGen === 'function') ? d3AIGen(door) : [];
      if (lys.length) { D3._ai = lys; d3ApplyAI(Math.min(cfg.layout, lys.length - 1)); }

      D3.auto = false;
      D3.orb = { th: cfg.orb.th, ph: cfg.orb.ph, r: cfg.orb.r, ty: cfg.orb.ty };
      d3Cam();
      return { ok: true, placed: D3.placed.length, layouts: lys.length,
               cw: c.clientWidth, ch: c.clientHeight };
    } catch (e) { return { ok: false, err: e.message + '\n' + e.stack }; }
  }, { W, H, orb, layout, light });

  if (!diag.ok) throw new Error('seed failed: ' + diag.err);
  // let the render loop settle (wall-fade lerp, env, shadows), then capture at high DPI
  await new Promise(r => setTimeout(r, 800));
  const dataUrl = await page.evaluate(() => {
    const c = document.getElementById('d3-canvas');
    D3.ren.setPixelRatio(2); D3.ren.setSize(c.clientWidth, c.clientHeight);
    D3.ren.render(D3.scene, D3.cam);
    return D3.ren.domElement.toDataURL('image/png');
  });
  fs.writeFileSync(out, Buffer.from(dataUrl.split(',')[1], 'base64'));
  const kb = (fs.statSync(out).size / 1024).toFixed(0);
  console.log(`✓ ${out}  (${kb} KB) — ${diag.placed} fittings, layout ${layout}, ${light}, canvas ${diag.cw}×${diag.ch}`);
} finally {
  await browser.close();
}
