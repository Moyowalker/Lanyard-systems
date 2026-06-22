# Inventory 3000 — bulk import (for review)

This folder stages a medicine list (`inventory_3000.csv`, uploaded by the client) for
import into the catalog via the admin **Products → Bulk import**. It is here so the team
can **validate and confirm the data before it is imported** — merging this PR does **not**
import anything; it just lands the reviewed, import-ready file and the script that made it.

## Files

| File                         | What it is                                                                                                                                           |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `inventory-3000.source.csv`  | The original upload, unchanged. It is in our **inventory export** shape, not the import shape.                                                       |
| `convert-inventory-3000.mjs` | Self-contained Node script (no deps) that converts the source into the import template. Re-runnable: `node docs/imports/convert-inventory-3000.mjs`. |
| `inventory-3000.import.csv`  | The generated, import-ready file (matches `docs/medicine-import-template.csv`). **2,615 products.**                                                  |

## What the source actually contains

- **3,000 rows**, columns: `Product, Generic, Brand, Form, Strength, On hand, Reserved, Available, Reorder level, Batch no, Expiry, Batch qty` — i.e. an **export**, missing the fields an import needs (price, regulatory class, etc.).
- Only **756 distinct product names**, listed across multiple batch rows (each batch = 100 units, all expiring `30/12/2028`, sequential batch numbers `B10000…`).

### ⚠️ Data-quality finding — please confirm this is the real catalog

The source looks like **randomly-generated sample data**, not a curated catalogue:

- **696 of the 756 names carry several different forms.** For example **"Paracetamol 500mg"** appears as **tablet, capsule, injection, and syrup**; same for Tramadol, Diclofenac, etc. A real "Paracetamol 500mg" is one formulation.
- Every row has the **same quantity (100)**, the **same expiry**, **no brand**, **no price**, and **no regulatory class**.

Because the name alone is ambiguous, the conversion keys products by **name + form** (so the four "Paracetamol 500mg" rows become four distinct products with explicit slugs like `paracetamol-500mg-tablet`). That yields **2,615 products** and preserves all 300,000 units. If this file is meant to be the production catalogue, it should be cleaned at source (one row per real product, with form in the name, real prices, and correct regulatory class).

## Transformations applied (all reversible in the admin)

| Field    | Rule                                                                                                                                                                                     |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Headers  | Mapped to the import template (`Product`→`name`, `Generic`→`genericName`, `On hand`→`openingQuantity`, `Reorder level`→`reorderLevel`, `Batch no`→`batchNo`, `Expiry`→`expiry`).         |
| `form`   | Lower-cased; values outside the product enum remapped — `inhalation`/`inhalation, liquid`→`inhaler`, `infusion`→`injection`, `oral suspension`→`suspension`; anything unknown → `other`. |
| `expiry` | `DD/MM/YYYY` → ISO `YYYY-MM-DD` (e.g. `30/12/2028` → `2028-12-30`).                                                                                                                      |
| quantity | Summed across all batch rows of the same product into one opening-stock batch (batches all share one expiry, so nothing is lost).                                                        |
| `slug`   | Explicit `"<name>-<form>"` so different formulations don't collide on one slug.                                                                                                          |

## ❗ Decisions that need your confirmation

These were chosen as **safe staging defaults** so nothing goes live by accident — adjust before publishing:

1. **`status = draft`** — every product imports **hidden** from the storefront. You publish after pricing/reviewing.
2. **`price = 0`** — the importer requires a price; this is a placeholder. **Real selling prices must be set** (Inventory → Pricing) before publishing.
3. **`regulatoryClass = POM`** (prescription-only) for **all** rows — conservative default since many are clinical injectables/controlled drugs; defaulting to OTC would wrongly let them sell without a prescription. Downgrade genuine OTC items, and mark true controlled substances (opioids, etc.) as `CONTROLLED`.
4. **Brand / NAFDAC / category / cost** left blank (absent in the source).

## How to import (after this PR is approved)

1. Admin → **Products** → **Bulk import**.
2. Pick the **branch** to receive the stock.
3. Upload **`inventory-3000.import.csv`**.
4. Review the import result (created products / prices / received inventory / row errors).
5. Set real **prices** (Inventory → Pricing), fix **regulatory class** where needed, then **publish**.

> The import writes ~2,615 products + prices + stock sequentially in one request. If it
> times out on the hosted environment, split the CSV into chunks (e.g. 500 rows each) and
> upload them in turn.

## Validation

`convert-inventory-3000.mjs` plus a structural check confirm the generated file has: 2,615
rows, **0** invalid forms, **0** invalid regulatory classes/statuses, **0** bad dates, **0**
non-numeric prices/quantities, **0** empty names/batch numbers, and **0** duplicate slugs.
