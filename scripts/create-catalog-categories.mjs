/**
 * One-off reference data: creates the catalog categories used by the client's medicine
 * catalogue, ahead of the bulk import.
 *
 * Why this exists rather than "just use the admin form": BulkMedicineImportService rejects any
 * row whose category name it cannot resolve — it never auto-creates one, so a typo cannot spawn
 * a junk category in the storefront browse tree. The client's file uses 41 categories, and the
 * Catalog page creates them one at a time, so the import cannot start without 41 form
 * submissions in the right order.
 *
 * WHY THE NAMES LOOK ODD IN PLACES ("Antimalarial", "Purgative", "Appetite Stimulant"):
 * the importer resolves a row by `normalizeHeader(name)` or `normalizeHeader(slug)` — lowercase
 * with punctuation stripped. So "ANTIMALARIAL" in the sheet matches the name "Antimalarial"
 * but NOT "Antimalarials". These names are deliberately faithful to the client's spelling,
 * singulars included. Pluralising one here silently orphans every row that used it.
 *
 * The upload files have five spellings corrected in the category column (9 rows), because no
 * name/slug pair can serve two spellings at once:
 *   ANATACIDS       → ANTACIDS          (merged, 1 row)
 *   ELECTOLYTE      → ELECTROLYTES      (merged, 1 row)
 *   ANTI-PSYCHOTICS → ANTIPSYCHOTICS    (merged, 1 row)
 *   ANTIHELMENTHICS → ANTHELMINTICS     (misspelling, 5 rows)
 *   ANTI-ASHMATICS  → ANTI-ASTHMATICS   (misspelling, 1 row)
 *
 * Usage — reports what it WOULD do and changes nothing:
 *   MONGODB_URI="mongodb+srv://..." node scripts/create-catalog-categories.mjs
 * Apply for real:
 *   MONGODB_URI="mongodb+srv://..." node scripts/create-catalog-categories.mjs --apply
 *
 * Additive and safe to run more than once: an existing slug is left exactly as it is, never
 * renamed or reordered.
 */
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const require = createRequire(import.meta.url);
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// mongoose ships as a production dependency of the API workspace.
const mongoose = require(path.join(repoRoot, 'apps/api/node_modules/mongoose'));

const APPLY = process.argv.includes('--apply');
const URI = process.env.MONGODB_URI;

if (!URI) {
  console.error('Set MONGODB_URI to the target database.');
  process.exit(2);
}

/** Verified to resolve every category spelling in the corrected upload files. */
const CATEGORIES = [
  'Analgesics',
  'Antacids',
  'Anthelmintics',
  'Anti-Asthmatics',
  'Anti-Gout',
  'Anti-Hyperlipidemics',
  'Anti-Scabies',
  'Antibiotics',
  'Anticonvulsant',
  'Antidepressant',
  'Antidiabetics',
  'Antidiarrheals',
  'Antifungals',
  'Antihistamines',
  'Antihypertensives',
  'Antimalarial',
  'Antiplatelets',
  'Antipsychotics',
  'Antitussives',
  'Antivirals',
  'Anxiolytics',
  'Appetite Stimulant',
  'BPH Agents',
  'Cold & Flu',
  'Consumables',
  'Diagnostics',
  'Diuretics',
  'Electrolytes',
  'Gastrointestinals',
  'Herbals',
  'Hormonals',
  'IV Fluids',
  'Multivitamins',
  'Muscle Relaxants',
  'Ophthalmics',
  'Oral Contraceptive',
  'Probiotics',
  'Purgative',
  'Respiratory',
  'Supplements',
  'Topicals',
];

/** Same rule as CatalogService.slugify — the importer looks up by name OR slug. */
const slugify = (name) =>
  name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

async function main() {
  await mongoose.connect(URI);
  const categories = mongoose.connection.collection('categories');

  const existing = await categories.find({}, { projection: { slug: 1, name: 1 } }).toArray();
  const bySlug = new Map(existing.map((c) => [c.slug, c]));

  const now = new Date();
  const toCreate = [];
  for (const [index, name] of CATEGORIES.entries()) {
    const slug = slugify(name);
    if (bySlug.has(slug)) continue;
    toCreate.push({
      slug,
      name,
      path: [],
      displayOrder: index,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    });
  }

  console.log(`Database has ${existing.length} categories.`);
  console.log(`${CATEGORIES.length} wanted, ${toCreate.length} missing:`);
  for (const c of toCreate) console.log(`  + ${c.name}  (${c.slug})`);

  if (toCreate.length === 0) {
    console.log('\nNothing to create.');
  } else if (!APPLY) {
    console.log('\nDry run — nothing written. Re-run with --apply to create these.');
  } else {
    const res = await categories.insertMany(toCreate, { ordered: false });
    console.log(`\nCreated ${res.insertedCount} categories.`);
  }

  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
