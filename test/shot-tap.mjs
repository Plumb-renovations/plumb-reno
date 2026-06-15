// Close-up render of a single tap (makeMixer) for the Task 1e detail pass.
//   node test/shot-tap.mjs <out.png> [type] [finish]
// Builds an isolated studio scene (env + key/fill + ground) and frames one mixer
// close, so tapware detail can be judged at close range.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer';
import { HTML_PATH } from './harness.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const THREE_SRC = fs.readFileSync(path.join(__dirname, 'vendor', 'three.min.js'), 'utf8');
const out = process.argv[2] || '/tmp/tap.png';
const type = process.argv[3] || 'gooseneck';
const finish = process.argv[4] || 'Chrome';
const W = 900, H = 900;

const browser = await puppeteer.launch({
  headless: 'new',
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'],
});
try {
  const page = await browser.newPage();
  await page.setViewport({ width: W, height: H, deviceScaleFactor: 1 });
  page.on('pageerror', e => console.error('PAGE ERROR:', e.message));
  await page.goto('file://' + HTML_PATH, { waitUntil: 'domcontentloaded' });
  await page.addScriptTag({ content: THREE_SRC });
  await page.evaluate(() => { window._3 = window.THREE; });

  const diag = await page.evaluate(async (cfg) => {
    try {
      loadThree(() => {});            // sets the app's internal _3 = THREE (window.THREE present)
      const T = window.THREE;
      const ren = new T.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
      ren.setSize(cfg.W, cfg.H); ren.setPixelRatio(2);
      ren.shadowMap.enabled = true; ren.shadowMap.type = T.PCFSoftShadowMap;
      ren.toneMapping = T.ACESFilmicToneMapping; ren.toneMappingExposure = 0.95; ren.outputEncoding = T.sRGBEncoding;
      document.body.appendChild(ren.domElement);
      const scene = new T.Scene(); scene.background = new T.Color(0x202833);
      scene.environment = d3Env();
      const key = new T.DirectionalLight(0xfff4e2, 2.6); key.position.set(0.4, 0.8, 0.5);
      key.castShadow = true; key.shadow.mapSize.set(2048, 2048);
      key.shadow.camera.left = -0.5; key.shadow.camera.right = 0.5; key.shadow.camera.top = 0.5; key.shadow.camera.bottom = -0.5;
      key.shadow.bias = -0.0004; scene.add(key);
      scene.add(new T.HemisphereLight(0xeaf2fa, 0x6b5847, 0.5));
      const fill = new T.DirectionalLight(0xdfe8f2, 0.5); fill.position.set(-0.5, 0.4, -0.3); scene.add(fill);
      const ground = new T.Mesh(new T.PlaneGeometry(2, 2), new T.MeshStandardMaterial({ color: 0xece9e2, roughness: 0.6, metalness: 0.0 }));
      ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);

      const tap = makeMixer(cfg.finish, cfg.type);
      tap.traverse(o => { if (o.isMesh) o.castShadow = true; });
      scene.add(tap);
      const cam = new T.PerspectiveCamera(40, cfg.W / cfg.H, 0.01, 10);
      cam.position.set(0.26, 0.24, 0.34); cam.lookAt(0, 0.16, 0.06);
      ren.render(scene, cam);
      window.__d = ren.domElement.toDataURL('image/png');
      let n = 0; tap.traverse(o => { if (o.isMesh) n++; });
      return { ok: true, meshes: n };
    } catch (e) { return { ok: false, err: e.message + '\n' + e.stack }; }
  }, { W, H, type, finish });

  if (!diag.ok) throw new Error('tap render failed: ' + diag.err);
  const dataUrl = await page.evaluate(() => window.__d);
  fs.writeFileSync(out, Buffer.from(dataUrl.split(',')[1], 'base64'));
  console.log(`✓ ${out} — ${type} / ${finish}, ${diag.meshes} meshes`);
} finally {
  await browser.close();
}
