/**
 * Reconciles a partially-completed bulk medicine import against the database, and produces a
 * file containing ONLY the rows that still need importing.
 *
 * Why this is needed: BulkMedicineImportService creates products, it never upserts them, and its
 * three writes per row (product → price → stock) are not transactional. So a run that fails
 * part-way — a timeout, or missing categories rejecting most rows — leaves the database in a
 * state no second upload of the same file can fix: every row that DID land now collides on the
 * unique slug, and the ones that failed are buried in a wall of "already exists" errors.
 *
 * Re-uploading the original file is therefore never the recovery. This script is.
 *
 * It answers three questions for a given branch:
 *   1. Which sheet rows already exist as products?  (matched on slug, the same way the importer
 *      generates it — CatalogService.slugify of the name.)
 *   2. Which existing products have no price row at this branch? Those are invisible in the
 *      storefront: listProducts filters to published products WITH a price, so a product whose
 *      row died between createProduct and upsertPrice is created but unreachable.
 *   3. Which rows never made it at all?
 *
 * With --apply it creates the missing price rows from the sheet (so the orphans become visible),
 * and always writes <source>-remaining.xlsx with the rows still to upload.
 *
 * Usage — report only, writes the remaining-rows file, changes nothing in the database:
 *   MONGODB_URI="mongodb+srv://..." node scripts/reconcile-medicine-import.mjs \
 *     --branch <branchId> "C:/path/medicine-import (MAIN UPLOAD).xlsx"
 *
 * Also repair the missing price rows:
 *   MONGODB_URI="..." node scripts/reconcile-medicine-import.mjs --branch <id> --apply <file>
 *
 * Safe to run repeatedly. It never creates or deletes a product, and never overwrites a price
 * that already exists.
 */
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const require = createRequire(import.meta.url);
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const mongoose = require(path.join(repoRoot, 'apps/api/node_modules/mongoose'));
const XLSX = require(path.join(repoRoot, 'apps/api/node_modules/xlsx'));

const APPLY = process.argv.includes('--apply');
const URI = process.env.MONGODB_URI;
const branchArg = process.argv[process.argv.indexOf('--branch') + 1];
const source = process.argv.slice(2).find((a) => /\.(xlsx|xls|csv)$/i.test(a));

if (!URI || !branchArg || !source) {
  console.error(
    'Usage: MONGODB_URI="..." node scripts/reconcile-medicine-import.mjs --branch <branchId> [--apply] <file.xlsx>',
  );
  process.exit(2);
}

/** Same rule as CatalogService.slugify. */
const slugify = (name) =>
  name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

/** Same rule as BulkMedicineImportService.moneyToKobo for a naira column. */
const nairaToKobo = (value) => {
  const text = String(value ?? '').replace(/[,₦\s]/g, '');
  if (!text) return undefined;
  const amount = Number(text);
  return Number.isFinite(amount) ? Math.round(amount * 100) : undefined;
};

async function main() {
  await mongoose.connect(URI);
  const db = mongoose.connection;
  const branchId = new mongoose.Types.ObjectId(branchArg);

  const branch = await db.collection('branches').findOne({ _id: branchId });
  if (!branch) {
    console.error(`No branch with id ${branchArg}.`);
    process.exit(1);
  }

  const workbook = XLSX.readFile(source, { cellDates: true });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: false });

  // One query for the whole file rather than per row.
  const slugs = rows.map((r) => slugify(String(r.name ?? '')));
  const products = await db
    .collection('products')
    .find({ slug: { $in: slugs } }, { projection: { slug: 1, status: 1 } })
    .toArray();
  const bySlug = new Map(products.map((p) => [p.slug, p]));

  const priced = await db
    .collection('price_lists')
    .find(
      { branchId, productId: { $in: products.map((p) => p._id) } },
      { projection: { productId: 1 } },
    )
    .toArray();
  const pricedIds = new Set(priced.map((p) => String(p.productId)));

  const missing = [];
  const unpriced = [];
  const unpublished = [];
  for (const [index, row] of rows.entries()) {
    const product = bySlug.get(slugs[index]);
    if (!product) {
      missing.push(row);
      continue;
    }
    if (!pricedIds.has(String(product._id))) unpriced.push({ row, product });
    if (product.status !== 'published') unpublished.push(product.slug);
  }

  console.log(`Branch: ${branch.name ?? branchArg}`);
  console.log(`Sheet rows:            ${rows.length}`);
  console.log(`Already imported:      ${rows.length - missing.length}`);
  console.log(`  of those, unpriced:  ${unpriced.length}  (invisible in the storefront)`);
  console.log(`  of those, not published: ${unpublished.length}`);
  console.log(`Still to import:       ${missing.length}`);

  // Chunked, because the importer writes three documents per row sequentially and a long run
  // exhausts the request timeout part-way — which is what created this mess in the first place.
  if (missing.length > 0) {
    const CHUNK = 350;
    const parts = Math.ceil(missing.length / CHUNK);
    console.log('');
    for (let i = 0, part = 1; i < missing.length; i += CHUNK, part++) {
      const slice = missing.slice(i, i + CHUNK);
      const out = source.replace(/\.(xlsx|xls|csv)$/i, `-remaining-${part}-of-${parts}.xlsx`);
      const nb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(nb, XLSX.utils.json_to_sheet(slice), 'Medicines');
      XLSX.writeFile(nb, out);
      console.log(`Wrote ${slice.length} rows → ${out}`);
    }
  }

  if (unpriced.length === 0) {
    console.log('\nNo missing prices to repair.');
  } else if (!APPLY) {
    console.log(`\nDry run — ${unpriced.length} price rows would be created. Re-run with --apply.`);
    for (const { row } of unpriced.slice(0, 10)) console.log(`  ${row.name}  ₦${row.price}`);
  } else {
    const now = new Date();
    const docs = unpriced
      .map(({ row, product }) => {
        const priceKobo = nairaToKobo(row.price);
        if (priceKobo === undefined) return null;
        return {
          branchId,
          productId: product._id,
          priceKobo,
          costKobo: nairaToKobo(row.cost),
          currency: 'NGN',
          // A ₦0 price is a gap in the sheet, not a giveaway — same rule the importer applies.
          isAvailable: priceKobo > 0,
          createdAt: now,
          updatedAt: now,
        };
      })
      .filter(Boolean);
    const res = await db.collection('price_lists').insertMany(docs, { ordered: false });
    console.log(`\nCreated ${res.insertedCount} price rows.`);
  }

  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
