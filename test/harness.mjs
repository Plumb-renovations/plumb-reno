// Zero-dependency test harness for HomeReno_Business_System.
//
// The whole app is one big <script> inside a single HTML file. To exercise its
// PURE business logic in Node (no browser, no WebGL), we:
//   1. extract the <script> body up to (but not including) the DOM bootstrap calls,
//   2. evaluate it inside a vm sandbox with light-weight stubs for the browser /
//      Three.js globals it touches at load time,
//   3. capture the top-level const/let/function bindings we want to assert on via a
//      direct-eval trailer (top-level `const` does not become a global property).
//
// Nothing here mutates the HTML; it only reads it.

import fs from 'fs';
import vm from 'vm';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const HTML_PATH = path.resolve(__dirname, '..', 'HomeReno_Business_System (57).html');

// Names we want to pull out of the app's top-level scope for testing.
const CAPTURE = [
  'CAT', 'BASE', 'SK', 'CAT_SUPPLIER', 'RATE_DEFS', 'D3_DEFS',
  'D3_FINISHES', 'SURF_FINISHES', 'FIN_PROPS',
  'S', 'loadState', 'persist', 'autoLinkSuppliers',
  'getBase', 'fmt', 'today', 'pad',
  'iT', 'qT', 'iP', 'autoMkup', 'priceFor',
  'supplierFor', 'estTotals',
  'VANITY_PARTS', 'd3ItemSkus', 'vanityAssemblyTotals',
  'benchTakeoff', 'stoneTakeoffSum', 'stoneTakeoffKeys', 'd3BenchSpec',
  'cabinetryTakeoff', 'CAB_RATE_BY_DEF', 'rateOf',
  'isImportedModel', 'applyFinishToModel', 'loadThree',
];

// ── Browser / Three.js stubs ────────────────────────────────────────────────
// A recursively callable/constructable no-op proxy — covers THREE.* and any
// chained builder call without us enumerating the whole API.
function deepStub(label = 'stub') {
  const fn = function () { return proxy; };
  const proxy = new Proxy(fn, {
    get(_t, prop) {
      if (prop === Symbol.toPrimitive) return () => 0;
      if (prop === Symbol.iterator) return function* () {};
      if (prop === 'toString' || prop === 'toJSON') return () => label;
      if (prop === Symbol.toStringTag) return label;
      if (prop === 'length') return 0;
      return proxy;
    },
    set() { return true; },
    apply() { return proxy; },
    construct() { return proxy; },
    has() { return true; },
  });
  return proxy;
}

function makeElement() {
  const el = {
    style: {}, dataset: {}, classList: {
      add() {}, remove() {}, toggle() {}, contains() { return false; },
    },
    children: [], value: '', textContent: '', innerHTML: '', checked: false,
    className: '', id: '', clientWidth: 800, clientHeight: 600, offsetWidth: 800, offsetHeight: 600,
    appendChild(c) { return c; }, removeChild(c) { return c; }, append() {}, remove() {},
    insertAdjacentHTML() {}, setAttribute() {}, getAttribute() { return null; },
    removeAttribute() {}, addEventListener() {}, removeEventListener() {},
    querySelector() { return makeElement(); }, querySelectorAll() { return []; },
    focus() {}, blur() {}, click() {}, select() {}, scrollIntoView() {},
    getBoundingClientRect() { return { top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0 }; },
    getContext() { return deepStub('ctx'); }, toDataURL() { return ''; },
    closest() { return null; }, contains() { return false; },
  };
  return el;
}

function makeSandbox() {
  const store = new Map();
  const localStorage = {
    getItem: k => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: k => store.delete(k),
    clear: () => store.clear(),
  };
  const elCache = new Map();
  const documentStub = {
    getElementById(id) {
      if (!elCache.has(id)) elCache.set(id, makeElement());
      return elCache.get(id);
    },
    querySelector() { return makeElement(); },
    querySelectorAll() { return []; },
    createElement() { return makeElement(); },
    createElementNS() { return makeElement(); },
    addEventListener() {}, removeEventListener() {},
    body: makeElement(), head: makeElement(), documentElement: makeElement(),
  };
  const sandbox = {
    console,
    localStorage,
    document: documentStub,
    navigator: { clipboard: { writeText: async () => {} }, userAgent: 'node-harness' },
    alert() {}, confirm() { return true; }, prompt() { return null; },
    setTimeout: () => 0, clearTimeout() {}, setInterval: () => 0, clearInterval() {},
    requestAnimationFrame: () => 0, cancelAnimationFrame() {},
    fetch: async () => ({ ok: true, json: async () => ({}), text: async () => '' }),
    THREE: deepStub('THREE'),
    FileReader: class { readAsText() {} readAsDataURL() {} },
    Blob: class {}, URL: { createObjectURL: () => 'blob:stub', revokeObjectURL() {} },
    Image: class {}, Audio: class {},
    matchMedia: () => ({ matches: false, addListener() {}, removeListener() {} }),
    devicePixelRatio: 1, innerWidth: 1280, innerHeight: 800,
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  sandbox.self = sandbox;
  sandbox.location = { hash: '', href: 'http://localhost/', search: '', pathname: '/' };
  sandbox.window.location = sandbox.location;
  return sandbox;
}

export function loadApp() {
  const text = fs.readFileSync(HTML_PATH, 'utf8');
  const lines = text.split('\n');
  const scriptStart = lines.findIndex(l => l.trim() === '<script>');
  if (scriptStart < 0) throw new Error('harness: <script> tag not found');
  // The DOM bootstrap is the final top-level block. `rdLoginUsers();` also appears
  // inside a function body, so anchor on the LAST occurrence that is immediately
  // followed by the distinctive deep-link guard.
  let bootIdx = -1;
  for (let i = lines.length - 1; i > scriptStart; i--) {
    if (lines[i].trim() === 'rdLoginUsers();' &&
        lines[i + 1] && lines[i + 1].trim().startsWith('if(!pjPortalDeepLink()')) {
      bootIdx = i;
      break;
    }
  }
  if (bootIdx < 0) throw new Error('harness: bootstrap marker rdLoginUsers(); not found');

  const body = lines.slice(scriptStart + 1, bootIdx).join('\n');
  const trailer = `
;globalThis.__APP = {};
${JSON.stringify(CAPTURE)}.forEach(function(__n){ try { globalThis.__APP[__n] = eval(__n); } catch (e) {} });
`;

  const sandbox = makeSandbox();
  vm.createContext(sandbox);
  try {
    new vm.Script(body + trailer, { filename: 'app-under-test.js' }).runInContext(sandbox);
  } catch (e) {
    throw new Error('harness: app failed to evaluate at load: ' + e.stack);
  }
  const app = sandbox.__APP || {};
  app.__sandbox = sandbox;
  app.__scriptLines = bootIdx - (scriptStart + 1);
  return app;
}
