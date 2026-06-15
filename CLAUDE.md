# CLAUDE.md — Plumb Renovations business system

Guidance for working in this repo. Read this first.

## What this is
A single-file business + design system for a renovation company:
`HomeReno_Business_System (57).html` (~9k lines, one `<script>`). Quoting,
invoicing, stock, suppliers, projects, a Three.js 3D room designer, client/trade
portals — all in one file, state in `localStorage`.

## The gate — run after EVERY change
```bash
npm run check     # syntax check + test rig + 4 audits + catalogue integrity
```
Zero dependencies, no browser. Must be green before you commit. See `test/README.md`.
Optional render screenshots need `npm i puppeteer` (Three.js r128 is vendored in
`test/vendor/`; cdnjs is blocked in this environment).

## NON-NEGOTIABLES (enforced by the 4 audits in `test/run.mjs`)
1. **Client never sees profit or cost.** Client/portal views carry no `.buy`,
   `.sell`, profit, margin or markup.
2. **Suppliers never blank.** Every catalogue product resolves a supplier.
3. **Add to existing features — don't rebuild.** Extend maps/functions
   (e.g. `FIN_PROPS`, `CAT`), don't replace them.
4. **Nothing financial hard-deleted.** Sales/invoices soft-cancel (cancelled/void
   flag + `auditLog`), never `splice`d.
5. **Product vs construction quotes stay separate.** `type:'product'` vs
   `type:'construction'`; never co-mingled.
6. **Billable vs absorbed variations stay distinct.** Absorbed reduces job profit
   and is auto-approved + logged; billable is charged to the client.

If a change would break one of these, stop — don't work around the audit.

## Architecture notes
- **Catalogue:** `const CAT` (723 rows) → `BASE` (working list). `getBase(sku)`.
  Pricing: `qT`/`iT`/`iP`, `priceFor`, `estTotals` (margin source of truth).
- **3D designer (`D3*`):** `d3Setup` (renderer/lights/loop), `D3_DEFS` (fittings),
  `makeMixer`, materials via `d3Metal`/`d3Surf`/`FIN_PROPS`/`D3_FINISHES`,
  `d3Tex` (tiles). Takeoffs: `stoneTakeoff*`/`cabinetryTakeoff` feed
  `d3Quantities` → construction quote. Build-a-vanity: `VANITY_PARTS`,
  `d3ItemSkus`, `buildVanity`. Imported models: `applyFinishToModel`.
- **Tests:** `/test` — `harness.mjs` evaluates the embedded script in a `vm`
  sandbox and captures top-level bindings; `run.mjs` is the rig + audits +
  integrity; `expected.json` holds catalogue counts (bump when CAT changes).

## Working rules
- Commit per task, only when the gate is green. Keep commits scoped.
- For render work: change ONE thing, re-render, compare; save before/after to
  `/screenshots` and note them in `PROGRESS.md`.
- Don't touch credentials/secrets/.env or anything outside this folder.
- When a decision is the owner's (catalogue values, outward-facing/irreversible
  actions), don't guess — write the proposal into `PROGRESS.md` and move on.

## Environment
Network egress is allowlisted: npm / github / googleapis reachable;
`cdnjs.cloudflare.com`, `cdn.playwright.dev`, `fienza.com.au`, `supabase.com`
are blocked. This gates live Fienza images and the Supabase backend — see the
deferred plans in `PROGRESS.md`.
