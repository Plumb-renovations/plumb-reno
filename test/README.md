# Test harness — HomeReno Business System

The whole app is one `<script>` inside `HomeReno_Business_System (57).html`. These
tests run that script's **pure business logic** in Node (no browser, no WebGL,
zero npm dependencies) so we can keep changes safe across the build.

## Run it

```bash
npm run check     # syntax check + test rig + 4 audits + integrity (the full gate)
npm run syntax    # just the syntax check
npm test          # just the rig + audits + integrity
```

`npm run check` exits non-zero if anything is red. Run it after every change.

## What's here

| File | Purpose |
|------|---------|
| `harness.mjs` | Extracts the `<script>` body, evaluates it in a `vm` sandbox with light browser/Three.js stubs, and captures top-level bindings (`CAT`, `getBase`, `qT`, `estTotals`, `FIN_PROPS`, …) for testing. Never mutates the HTML. |
| `syntax.mjs` | Compiles the entire embedded script (no run) — catches syntax errors. |
| `run.mjs` | Test rig + 4 audits + catalogue integrity check. |
| `expected.json` | Expected catalogue counts. **Bump these when Task 2 adds/removes products.** |

## The 4 audits (enforce the non-negotiables)

1. **Client never sees cost/profit** — client portal renderers carry no cost tokens
   (`.buy`, `.sell`, `profit`, `iP(`, `.markup`, `gross`).
2. **Suppliers never blank** — every catalogue product resolves a supplier.
3. **Product vs construction quotes separate** — quotes are only ever typed
   `product` or `construction`.
4. **Nothing hard-deleted (financial)** — sales soft-cancel (cancelled/void flag +
   `auditLog`); invoices are never `splice`d out.

## Catalogue integrity

Checks `CAT` row count and unique-SKU count against `expected.json`, plus per-row
structure (sku/name/category present; qty/buy/sell numeric and non-negative; no
product priced below cost).

> Note: the catalogue currently has **723 rows / 666 unique SKUs** — 57 SKUs repeat
> across finishes/variants. That's expected, not an error; it's tracked in
> `expected.json` so accidental drift is caught.
