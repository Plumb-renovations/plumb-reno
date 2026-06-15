# Build progress — Plumb Renovations business system

Branch: `claude/relaxed-tesla-nr0ibz` · single-file app: `HomeReno_Business_System (57).html`

---

## ★ FINAL SUMMARY (autonomous run)

**All 5 autonomous tasks complete and green.** Each ended with the full gate
passing and was committed separately; before/after screenshots are in
`/screenshots`.

- **Test count: 98 tests passing, 4/4 audits clean, catalogue integrity OK (723 rows / 666 unique SKUs).**
- Run the gate yourself any time: `npm run check` (zero dependencies; no browser needed).
- Screenshots: `/screenshots` (referenced per task below).
- Non-negotiables held throughout (enforced by the 4 audits): client never sees
  cost/profit · suppliers never blank · add-don't-rebuild · nothing financial
  hard-deleted · product vs construction quotes separate.

**Important context note:** the repo did **not** contain `CLAUDE.md`, a
`CLAUDE_CODE_BUILD_BRIEF.md`, a test rig, "4 audits", or an integrity check when
I started — only the HTML file and one upload commit. I built the harness
(`/test`) as task zero so "keep tests green" is real. The non-negotiables are now
enforced by the 4 audits in `test/run.mjs`.

**Deferred for your review (NOT done while you were away — plans at the bottom):**
catalogue DATA edits from your handwritten sheets · real product images ·
backend/hosting migration · multi-user logins · live portal links · Google
Calendar push · push notifications · real outbound email.

**Environment limit you should know about:** this sandbox uses a network egress
**allowlist**. `npm`, `github.com` and `storage.googleapis.com` are reachable
(that's how I stood up a headless Chrome for screenshots), but
`cdnjs.cloudflare.com` (the Three.js the app loads), `cdn.playwright.dev`,
`fienza.com.au` and `supabase.com` are **blocked (403)**. That directly gates
real product images (Fienza) and the Supabase backend — see deferred plans.

---

## Foundation — Test harness (task zero)

Zero-dependency Node harness that loads the embedded `<script>` in a `vm`
sandbox (browser/Three.js stubbed) and exercises the pure business logic.

- `test/harness.mjs` — loader + sandbox, captures top-level bindings.
- `test/syntax.mjs` — compiles the whole embedded script (syntax check).
- `test/run.mjs` — test rig + **4 audits** + catalogue integrity.
- `test/expected.json` — catalogue counts (bump when catalogue changes).
- Screenshot harnesses (need `npm i puppeteer`): `test/shot.mjs` (room),
  `test/shot-tap.mjs` (tapware), `test/shot-vanity.mjs`, `test/shot-asset.mjs`.
  Three.js r128 + OBJLoader are vendored in `test/vendor/` (cdnjs is blocked).

The 4 audits: (1) client never sees cost/profit; (2) suppliers never blank;
(3) product vs construction quotes separate; (4) nothing financial hard-deleted.

Baseline at this point: **47 tests**, 4/4 audits, integrity OK.

---

## Task 1 — Realistic 3D renders (a–e)  ✅

Render → screenshot → change ONE thing → re-render loop. The renderer already
had ACESFilmic tone mapping, sRGB output, PCFSoftShadowMap and an env map, so
this **extended** them rather than rebuilding.

- **1a Lighting/tone:** real soft key (directional sun, 2048 shadow map sized to
  the room) + hemisphere/ambient fill + opposite fill; exposure 1.05→0.95;
  richer 128px studio IBL with a horizon highlight.
- **1b PBR per finish:** extended `FIN_PROPS` (kept keys; added colour, env
  intensity, clearcoat); `d3Metal` uses MeshPhysicalMaterial clearcoat for
  Chrome/Brass. Chrome now reads as reflective metal.
- **1c Tile/grout:** `d3Tex` recessed darker grout + wider joints + per-tile
  bevel. **Biggest visible win** — walls/floor read as real tiling.
- **1d Shadows/AO:** PCFSoft already on; added dependency-free soft contact
  shadows under floor fixtures (`d3ContactShadow`) as AO grounding.
- **1e makeMixer detail:** escutcheon, tapered body, collar, aerator tip,
  rounded lever paddle (7→10 meshes — detail without exploding poly count).

Screenshots: `screenshots/task1_room_BEFORE.png` → `task1_room_AFTER.png`;
`screenshots/task1_tap_BEFORE.png` → `task1_tap_AFTER.png`.
Commits: `0875739`, `100848f`, `d59a0f8`, `5400b82`, `663298e`.
Tests after: **47** (render changes verified by screenshot; FIN_PROPS coverage
is asserted in the rig).

**1f (bump Three off r128) — deferred:** the app loads Three from cdnjs which is
blocked here, so I can't validate a CDN-version bump end-to-end; low value /
higher risk than a–e. Easy to do on a branch later.

## Task 2 — Build-a-vanity workflow  ✅

Assemble a vanity from separately-priced components (cabinet + benchtop + basin +
tapware), each a line item, rendered together in 3D.

- `VANITY_PARTS` component library merged into BASE (prices/orders/supplier/
  cost-hiding like any product; kept out of CAT so the 723 count is unchanged).
- `d3ItemSkus(it)` expands an assembly into one priced SKU per part;
  `vanityAssemblyTotals()` pure pricing. Wired into `d3Quote` + `d3Estimate`
  (products portion — construction stays separate, per the rule).
- `buildVanity()` composes the 3D geometry (sizes the bench to the cabinet);
  `d3VanityBuilder()` modal + "🧩 Build Vanity" toolbar button.

Screenshot: `screenshots/task2_build_vanity.png`. Commit: `5e952ea`.
Tests after: **62** (+15: expansion, per-part pricing, GST, partial assembly,
supplier resolution).

## Task 3 — Stone benchtop auto-takeoff  ✅

Drawn vanity/bench → stone takeoff feeding the existing Pricing-Setup stone
rates, shown on the construction quote.

- `benchTakeoff` (area m², exposed edge lm, waterfalls, sink/cooktop cut-outs),
  `stoneTakeoffSum`, `stoneTakeoffKeys` (→ `stone_20`/`stone_edge`/
  `stone_waterfall`/`stone_cut_sink`/`_under`/`_cook`). `d3BenchSpec` lets the
  basin type drive the cut-out kind. Merged into `d3Quantities`.
- Verified end-to-end: a 1200 double vanity → `20mm stone 0.6 m²`,
  `Edge 2.2 lm`, `Undermount cut-out 2 ea` on the construction quote.

Commit: `ee26aaa`. Tests after: **78** (+16).

## Task 4 — Kitchen render polish + wardrobe mode  ✅

Kitchen and wardrobe room modes already existed and inherit the Task 1 render
work. Two gaps closed:

- Kitchen benchtops now use the reflective stone material (matches vanity tops).
- Drawn kitchen/wardrobe joinery was **not priced** — added `cabinetryTakeoff`
  mapping kbench/ksink→base, island, overhead, tall, trough→laundry, and
  wardrobe hang/shelves/drawers/mdoor→`cab_wardrobe`, in lineal metres at the
  existing Custom Cabinetry rates. Wired into `d3Quantities`.
- Verified: wardrobe → `Wardrobe cabinetry 3.6 lm @ $420`; kitchen → base/
  overhead/tall/island lines.

Screenshots: `screenshots/task4_kitchen.png`, `screenshots/task4_wardrobe.png`.
Commit: `8944ab4`. Tests after: **89** (+11, incl. wardrobe pricing).

## Task 5 — Finish-swap for imported GLB/GLTF/OBJ  ✅

Imported models have no `def.make()` to rebuild, so `d3Finish` now re-materials
them in place from `D3_FINISHES`/`FIN_PROPS` (the finish swatches in the
properties panel already call `d3Finish`).

- `isImportedModel(it)`, `applyFinishToModel(it, finish)` (remembers the import's
  original material so finishes can be restored; double-sided for imports with
  inconsistent winding). Verified by importing an OBJ and swapping finishes.

Screenshots: `screenshots/task5_import_BEFORE_white.png` →
`task5_import_AFTER_brass.png` / `task5_import_AFTER_matteblack.png`.
Tests after: **98** (+9: import detection + re-material/restore bookkeeping).

---

## DEFERRED — needs your input / supervision (plans only)

### A. Catalogue DATA from your handwritten stock sheets
Not started — needs your values. **Plan:** attach photos/PDFs of the notebook;
I OCR every legible row (name, SKU, cost, sell, qty, brand/range), reconcile
against `const CAT` (723 rows), correct any price/cost that differs, add missing
products, and **flag illegible rows for you to confirm — no silent guessing**.
If products are added I bump `test/expected.json` and tell you the new count,
and show a summary table of changed/added/flagged before committing.
Note found along the way: CAT has **57 duplicate SKUs** (723 rows, 666 unique) —
worth confirming whether those are intended finish/variant duplicates.

### B. Real product images
Needs internet + decisions. **Plan:** build the img-by-SKU mapping into
`getBase().img`. `fienza.com.au` is **blocked by egress here**, so I can't fetch
live. Two options: (1) you widen egress to allow `fienza.com.au` and I pull
official images by SKU/name; or (2) I generate the `img`-by-SKU mapping
structure with placeholders and give you the exact list of files to drop in and
where. I'll list any SKUs with no image found.

### C. Backend / hosting / multi-user / portals / calendar / notifications / email
Large, irreversible, credential-bearing — must be supervised. **Plan (phased):**
1. Stand up Supabase (Auth + Postgres schema mirroring the current localStorage
   state). `supabase.com` is **blocked by egress here** — needs egress widened
   or to be run from your machine, plus your project URL + keys (I will not
   handle secrets autonomously).
2. Incremental migration off localStorage behind a data-access layer so the app
   keeps working during the transition; keep tests green at each step.
3. A hosting target + live client/trade portal links on the deployed URL.
4. Real multi-user logins per staff member (keep the role gates).
5. Google Calendar push (OAuth) replacing the `.ics` export.
6. Push notifications (order required / delayed / received / overdue /
   installation ready).
7. Real outbound email replacing the `mailto:` drafts (keep the same templates).
Each of 4–7 needs credentials/OAuth consent and is outward-facing, so I'll
prepare the code and pause for you at each integration point.
