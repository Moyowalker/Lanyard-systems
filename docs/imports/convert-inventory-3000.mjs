#!/usr/bin/env node
/**
 * Convert an inventory EXPORT csv (the shape produced by Inventory → Export) into the
 * bulk-medicine IMPORT template shape that the admin "Bulk import" accepts.
 *
 *   node docs/imports/convert-inventory-3000.mjs \
 *     docs/imports/inventory-3000.source.csv \
 *     docs/imports/inventory-3000.import.csv
 *
 * It is deliberately self-contained (no deps) so reviewers can re-run and diff.
 *
 * Decisions applied (see docs/imports/README.md — all need human sign-off):
 *   - regulatoryClass → POM for every row (safe default: most of these are clinical
 *     injectables/capsules; defaulting OTC would wrongly let prescription/controlled
 *     drugs sell without a script). Downgrade true OTC items before publishing.
 *   - status → draft (hidden on the storefront until reviewed, priced and published).
 *   - price → 0 placeholder (the importer requires a price; real prices MUST be set
 *     before publishing).
 *   - form values not in the product enum are remapped (see FORM_MAP); unknowns → other.
 *   - expiry DD/MM/YYYY → ISO YYYY-MM-DD.
 *   - the source lists each medicine across several batch rows, AND the same product
 *     name appears with different forms (e.g. "Paracetamol 500mg" as tablet/capsule/
 *     injection/syrup — almost certainly randomly-generated sample data). Rows are
 *     therefore aggregated per (name + form), quantities summed into one opening-stock
 *     batch, and an explicit unique slug ("<name>-<form>") is emitted so the importer
 *     doesn't collapse different formulations onto one slug. See README for caveats.
 */
import { readFileSync, writeFileSync } from 'node:fs';

const [
  ,
  ,
  inPath = 'docs/imports/inventory-3000.source.csv',
  outPath = 'docs/imports/inventory-3000.import.csv',
] = process.argv;

const VALID_FORMS = new Set([
  'tablet',
  'capsule',
  'syrup',
  'suspension',
  'injection',
  'cream',
  'ointment',
  'drops',
  'inhaler',
  'suppository',
  'device',
  'other',
]);
const FORM_MAP = {
  'oral suspension': 'suspension',
  inhalation: 'inhaler',
  'inhalation, liquid': 'inhaler',
  infusion: 'injection',
};

const OUTPUT_COLUMNS = [
  'name',
  'slug',
  'sku',
  'genericName',
  'brand',
  'description',
  'form',
  'strength',
  'packSize',
  'categoryIds',
  'regulatoryClass',
  'nafdacRegNo',
  'manufacturer',
  'status',
  'price',
  'cost',
  'compareAt',
  'isAvailable',
  'openingQuantity',
  'reorderLevel',
  'batchNo',
  'expiry',
  'reason',
];

/** Minimal RFC-4180-ish CSV parser (handles quoted fields, commas and quotes inside). */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (c === '\r') {
      /* ignore */
    } else field += c;
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function csvField(value) {
  const s = String(value ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function slugify(name) {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function toIsoDate(value) {
  const m = String(value)
    .trim()
    .match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return { iso: '', ok: false };
  const [, d, mo, y] = m;
  return { iso: `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`, ok: true };
}

const parsed = parseCsv(readFileSync(inPath, 'utf8'));
const header = parsed[0];
const idx = Object.fromEntries(header.map((h, i) => [h.trim(), i]));
const get = (row, col) => (row[idx[col]] ?? '').trim();

const bySlug = new Map();
const remappedForms = new Map();
let badDates = 0;

for (let r = 1; r < parsed.length; r += 1) {
  const row = parsed[r];
  if (!row || row.every((c) => (c ?? '').trim() === '')) continue;

  const name = get(row, 'Product');
  if (!name) continue;
  const qty = Number(get(row, 'On hand') || '0') || 0;

  const rawForm = get(row, 'Form').toLowerCase();
  const form = VALID_FORMS.has(rawForm) ? rawForm : (FORM_MAP[rawForm] ?? 'other');
  if (form !== rawForm) remappedForms.set(rawForm, (remappedForms.get(rawForm) ?? 0) + 1);

  // Key by name + form: the same name carries multiple forms in this source, so
  // collapsing on name alone would wrongly merge distinct formulations.
  const key = `${slugify(name)}|${form}`;
  const existing = bySlug.get(key);
  if (existing) {
    existing.openingQuantity += qty; // sum batch quantities into the product's opening stock
    continue;
  }

  const { iso, ok } = toIsoDate(get(row, 'Expiry'));
  if (!ok) badDates += 1;

  bySlug.set(key, {
    name,
    slug: `${slugify(name)}-${form}`,
    sku: '',
    genericName: get(row, 'Generic'),
    brand: get(row, 'Brand'),
    description: '',
    form,
    strength: get(row, 'Strength'),
    packSize: '',
    categoryIds: '',
    regulatoryClass: 'POM',
    nafdacRegNo: '',
    manufacturer: '',
    status: 'draft',
    price: '0',
    cost: '',
    compareAt: '',
    isAvailable: 'true',
    openingQuantity: qty,
    reorderLevel: get(row, 'Reorder level') || '0',
    batchNo: get(row, 'Batch no'),
    expiry: iso,
    reason: 'Bulk import: inventory_3000',
  });
}

const out = [OUTPUT_COLUMNS.join(',')];
for (const record of bySlug.values()) {
  out.push(OUTPUT_COLUMNS.map((c) => csvField(record[c])).join(','));
}
writeFileSync(outPath, out.join('\n') + '\n', 'utf8');

const totalUnits = [...bySlug.values()].reduce((s, r) => s + r.openingQuantity, 0);
console.log(`Source rows:           ${parsed.length - 1}`);
console.log(`Unique products written: ${bySlug.size}`);
console.log(`Total opening units (summed across batches): ${totalUnits}`);
console.log(`Rows with unparseable expiry: ${badDates}`);
console.log(
  `Form remaps: ${[...remappedForms.entries()].map(([f, n]) => `"${f}"→${n}`).join(', ') || 'none'}`,
);
