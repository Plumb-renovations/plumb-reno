// Task 7 — import a model and finish-swap it. Renders BEFORE (as-imported) and
// one PNG per finish, re-materialing the imported meshes from D3_FINISHES/FIN_PROPS.
//   node test/shot-asset.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer';
import { HTML_PATH } from './harness.mjs';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const THREE_SRC = fs.readFileSync(path.join(__dirname, 'vendor', 'three.min.js'), 'utf8');
const OBJLOADER_SRC = fs.readFileSync(path.join(__dirname, 'vendor', 'OBJLoader.js'), 'utf8');

// build a simple OBJ "vanity" (cabinet + benchtop + tap) so there's a real import
function box(cx, cy, cz, w, h, d, o) {
  const x0 = cx - w / 2, x1 = cx + w / 2, y0 = cy - h / 2, y1 = cy + h / 2, z0 = cz - d / 2, z1 = cz + d / 2;
  const v = [[x0,y0,z0],[x1,y0,z0],[x1,y1,z0],[x0,y1,z0],[x0,y0,z1],[x1,y0,z1],[x1,y1,z1],[x0,y1,z1]];
  let s = ''; v.forEach(p => s += `v ${p[0]} ${p[1]} ${p[2]}\n`);
  const f = [[1,2,3,4],[5,8,7,6],[1,5,6,2],[2,6,7,3],[3,7,8,4],[4,8,5,1]];
  f.forEach(q => s += `f ${q.map(i => i + o).join(' ')}\n`);
  return { obj: s, n: 8 };
}
let obj = 'o ImportedVanity\n', off = 0;
for (const s of [[0,0.3,0,0.6,0.6,0.45],[0,0.62,0,0.66,0.04,0.5],[0,0.78,-0.15,0.05,0.18,0.05]]) {
  const b = box(s[0], s[1], s[2], s[3], s[4], s[5], off); obj += b.obj; off += b.n;
}
const DATA = 'data:text/plain;base64,' + Buffer.from(obj).toString('base64');

const browser = await puppeteer.launch({ headless: 'new',
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--ignore-gpu-blocklist'] });
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 900, height: 800, deviceScaleFactor: 1 });
  page.on('pageerror', e => console.error('PAGE ERROR:', e.message));
  await page.goto('file://' + HTML_PATH, { waitUntil: 'domcontentloaded' });
  await page.addScriptTag({ content: THREE_SRC });
  await page.addScriptTag({ content: OBJLOADER_SRC });   // provides THREE.OBJLoader (cdnjs blocked)
  await page.evaluate(() => { window._3 = window.THREE; });

  // isolated studio so the imported model + finish read clearly (no room walls)
  const setup = await page.evaluate(async (DATA) => {
    loadThree(() => {}); const T = window.THREE;
    const ren = new T.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    ren.setSize(900, 800); ren.setPixelRatio(2);
    ren.shadowMap.enabled = true; ren.shadowMap.type = T.PCFSoftShadowMap;
    ren.toneMapping = T.ACESFilmicToneMapping; ren.toneMappingExposure = 0.95; ren.outputEncoding = T.sRGBEncoding;
    document.body.appendChild(ren.domElement);
    const scene = new T.Scene(); scene.background = new T.Color(0x202833); scene.environment = d3Env();
    const key = new T.DirectionalLight(0xfff4e2, 2.6); key.position.set(0.6, 1.0, 0.7);
    key.castShadow = true; key.shadow.mapSize.set(2048, 2048);
    key.shadow.camera.left = -1; key.shadow.camera.right = 1; key.shadow.camera.top = 1; key.shadow.camera.bottom = -1;
    key.shadow.bias = -0.0004; scene.add(key);
    scene.add(new T.HemisphereLight(0xeaf2fa, 0x6b5847, 0.5));
    const fill = new T.DirectionalLight(0xdfe8f2, 0.5); fill.position.set(-0.6, 0.5, -0.4); scene.add(fill);
    const ground = new T.Mesh(new T.PlaneGeometry(4, 4), new T.MeshStandardMaterial({ color: 0xece9e2, roughness: 0.6 }));
    ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
    const it = await new Promise((res, rej) => {
      assetLoad('obj', DATA, (model) => {
        const grp = assetNormalize(model, 0.6);
        grp.traverse(m => { if (m.isMesh) m.castShadow = true; });
        scene.add(grp);
        res({ grp, def: {}, asset: { name: 'Imported Vanity' }, fin: 'Chrome' });
      }, (err) => rej(new Error(err.message)));
    });
    const cam = new T.PerspectiveCamera(40, 900 / 800, 0.01, 20);
    cam.position.set(0.55, 0.5, 0.7); cam.lookAt(0, 0.27, 0);
    window.__ASSET = { ren, scene, cam, it };
    let n = 0; it.grp.traverse(m => { if (m.isMesh) n++; });
    return { meshes: n };
  }, DATA);

  async function shot(out) {
    await new Promise(r => setTimeout(r, 250));
    const d = await page.evaluate(() => { const a = window.__ASSET; a.ren.render(a.scene, a.cam); return a.ren.domElement.toDataURL('image/png'); });
    fs.writeFileSync(out, Buffer.from(d.split(',')[1], 'base64'));
    console.log('  ✓', out);
  }
  console.log(`imported OBJ -> ${setup.meshes} mesh(es)`);
  await shot('/tmp/asset_before.png');
  for (const fin of ['Brushed Brass', 'Matte Black', 'Chrome']) {
    await page.evaluate(f => applyFinishToModel(window.__ASSET.it, f), fin);
    await shot('/tmp/asset_' + fin.replace(/\s+/g, '_') + '.png');
  }
} finally { await browser.close(); }
