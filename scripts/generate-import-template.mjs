/**
 * Generates the client-facing medicine import template.
 *
 *   node scripts/generate-import-template.mjs
 *   node scripts/generate-import-template.mjs --categories "Pain Relief,Antibiotics,Vitamins"
 *
 * Writes docs/medicine-import-template.xlsx (dropdowns + validation) and keeps
 * docs/medicine-import-template.csv in step so both formats describe the same columns.
 *
 * Why exceljs and not the `xlsx` package the API already uses: SheetJS Community Edition
 * cannot WRITE data validation (dropdowns are a Pro feature). exceljs is a devDependency
 * used only by this script — it is never imported by the API.
 *
 * Enum values are read from the built @lanyard/contracts bundle rather than retyped, so the
 * dropdowns cannot drift from what the importer actually accepts. Run
 * `pnpm --filter @lanyard/contracts build` first if dist/ is stale.
 */
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs/promises';

import ExcelJS from 'exceljs';

const require = createRequire(import.meta.url);
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { ProductForm, RegulatoryClass, ProductStatus } = require(
  path.join(repoRoot, 'packages/contracts/dist/index.js'),
);

const FORMS = Object.values(ProductForm);
const CLASSES = Object.values(RegulatoryClass);
const STATUSES = Object.values(ProductStatus);
const BOOLEANS = ['TRUE', 'FALSE'];

const categoriesArg = process.argv.indexOf('--categories');
const CATEGORIES =
  categoriesArg > -1 && process.argv[categoriesArg + 1]
    ? process.argv[categoriesArg + 1]
        .split(',')
        .map((c) => c.trim())
        .filter(Boolean)
    : ['Pain Relief', 'Antibiotics'];

/** Rows of the entry sheet that carry validation. Generous so the client can paste a big list. */
const LAST_ROW = 2000;

/**
 * Column order is the client's reading order (what the medicine IS, then how it's classified,
 * then money, then stock, then optional extras). Header text matches the importer's aliases.
 */
const COLUMNS = [
  {
    key: 'name',
    header: 'name',
    width: 34,
    required: true,
    note: 'Full product name as it should appear to customers',
  },
  {
    key: 'genericName',
    header: 'genericName',
    width: 22,
    note: 'Active ingredient, e.g. Paracetamol',
  },
  { key: 'brand', header: 'brand', width: 18, note: 'Brand name, if any' },
  {
    key: 'form',
    header: 'form',
    width: 16,
    required: true,
    list: 'forms',
    note: 'Dosage form — pick from the dropdown',
  },
  { key: 'strength', header: 'strength', width: 14, note: 'e.g. 500mg, 250mg/5ml' },
  { key: 'packSize', header: 'packSize', width: 16, note: 'e.g. 10 tablets, 100ml bottle' },
  {
    key: 'category',
    header: 'category',
    width: 20,
    list: 'categories',
    note: 'Optional. See the Lists sheet. Separate several with a comma',
  },
  {
    key: 'regulatoryClass',
    header: 'regulatoryClass',
    width: 18,
    required: true,
    list: 'classes',
    note: 'REQUIRED — decides whether a prescription is needed',
  },
  { key: 'nafdacRegNo', header: 'nafdacRegNo', width: 16, note: 'NAFDAC registration number' },
  { key: 'manufacturer', header: 'manufacturer', width: 22, note: 'Manufacturer name' },
  {
    key: 'price',
    header: 'price',
    width: 12,
    required: true,
    numeric: 'decimal',
    note: 'Selling price in NAIRA (not kobo)',
  },
  {
    key: 'cost',
    header: 'cost',
    width: 12,
    numeric: 'decimal',
    note: 'What you paid, in naira. Optional',
  },
  {
    key: 'openingQuantity',
    header: 'openingQuantity',
    width: 16,
    numeric: 'whole',
    note: 'Units currently in stock at this branch',
  },
  {
    key: 'reorderLevel',
    header: 'reorderLevel',
    width: 14,
    numeric: 'whole',
    note: 'Alert threshold for low stock',
  },
  {
    key: 'batchNo',
    header: 'batchNo',
    width: 16,
    note: 'Fill BOTH batchNo and expiry, or neither',
  },
  { key: 'expiry', header: 'expiry', width: 14, note: 'YYYY-MM-DD, e.g. 2027-12-31' },
  { key: 'sku', header: 'sku', width: 16, note: 'Your internal code. Must be unique' },
  { key: 'barcode', header: 'barcode', width: 16, note: 'EAN/UPC. Must be unique' },
  {
    key: 'description',
    header: 'description',
    width: 40,
    note: 'Short customer-facing description',
  },
  {
    key: 'status',
    header: 'status',
    width: 12,
    list: 'statuses',
    note: 'Leave blank — imports land as draft for review',
  },
  {
    key: 'isAvailable',
    header: 'isAvailable',
    width: 12,
    list: 'booleans',
    note: 'TRUE unless you want it hidden from sale',
  },
];

const EXAMPLES = [
  {
    name: 'Paracetamol 500mg Tablets',
    genericName: 'Paracetamol',
    brand: 'Emzor',
    form: 'tablet',
    strength: '500mg',
    packSize: '10 tablets',
    category: 'Pain Relief',
    regulatoryClass: 'OTC',
    nafdacRegNo: 'A4-5678',
    manufacturer: 'Emzor Pharmaceutical',
    price: '800',
    cost: '500',
    openingQuantity: '100',
    reorderLevel: '20',
    batchNo: 'BATCH-PARA-001',
    expiry: '2027-06-30',
    sku: 'PARA-500-TAB',
    barcode: '6151100012345',
    description: 'Pain and fever relief',
    status: 'draft',
    isAvailable: 'TRUE',
  },
  {
    name: 'Amoxicillin 250mg Suspension',
    genericName: 'Amoxicillin',
    brand: 'Fidson',
    form: 'suspension',
    strength: '250mg/5ml',
    packSize: '100ml bottle',
    category: 'Antibiotics',
    regulatoryClass: 'POM',
    nafdacRegNo: 'A4-9012',
    manufacturer: 'Fidson Healthcare',
    price: '3500',
    cost: '2600',
    openingQuantity: '25',
    reorderLevel: '5',
    batchNo: 'BATCH-AMOX-001',
    expiry: '2026-12-31',
    sku: 'AMOX-250-SUSP',
    barcode: '6151100067890',
    description: 'Antibiotic suspension — pharmacist verifies the prescription',
    status: 'draft',
    isAvailable: 'TRUE',
  },
];

const BRAND = 'FF0F766E'; // teal-700, matches the admin console chrome
const HEADER_REQUIRED = 'FF115E59';
const MUTED = 'FF64748B';

const colLetter = (index) => {
  let n = index + 1;
  let s = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
};

const book = new ExcelJS.Workbook();
book.creator = 'Lanyard Pharmacy';
book.created = new Date();

/* ── Sheet 1: Medicines ──────────────────────────────────────────────────────
   MUST be the first sheet: the importer reads workbook.SheetNames[0] and treats
   row 1 as the header row. It deliberately ships EMPTY — sample rows here would be
   imported as real products by anyone who forgot to delete them. Examples live on
   the Instructions sheet instead. */
const sheet = book.addWorksheet('Medicines', {
  views: [{ state: 'frozen', ySplit: 1 }],
});

sheet.columns = COLUMNS.map((c) => ({ key: c.key, width: c.width }));

const headerRow = sheet.getRow(1);
COLUMNS.forEach((col, i) => {
  const cell = headerRow.getCell(i + 1);
  cell.value = col.header;
  cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
  cell.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: col.required ? HEADER_REQUIRED : BRAND },
  };
  cell.alignment = { vertical: 'middle', horizontal: 'left' };
  cell.border = { bottom: { style: 'thin', color: { argb: 'FF0B4F4A' } } };
  cell.note = `${col.required ? 'REQUIRED. ' : 'Optional. '}${col.note}`;
});
headerRow.height = 22;
headerRow.commit();

const listRanges = {
  forms: `Lists!$A$2:$A$${FORMS.length + 1}`,
  classes: `Lists!$B$2:$B$${CLASSES.length + 1}`,
  statuses: `Lists!$C$2:$C$${STATUSES.length + 1}`,
  booleans: `Lists!$D$2:$D$${BOOLEANS.length + 1}`,
  categories: `Lists!$E$2:$E$${CATEGORIES.length + 1}`,
};

COLUMNS.forEach((col, i) => {
  const range = `${colLetter(i)}2:${colLetter(i)}${LAST_ROW}`;

  if (col.list) {
    // Range-referenced lists, not inline: inline list validation is capped at 255 chars
    // and the 23 dosage forms run close to that ceiling.
    sheet.dataValidations.add(range, {
      type: 'list',
      allowBlank: true,
      formulae: [listRanges[col.list]],
      showErrorMessage: true,
      errorStyle: 'stop',
      errorTitle: `Pick a valid ${col.header}`,
      error:
        col.list === 'categories'
          ? 'Choose one of the listed categories, or clear the cell to leave it uncategorised.'
          : `Choose one of the values from the dropdown. See the Lists sheet for all options.`,
    });
  } else if (col.numeric) {
    sheet.dataValidations.add(range, {
      type: col.numeric === 'whole' ? 'whole' : 'decimal',
      operator: 'greaterThanOrEqual',
      allowBlank: true,
      formulae: [0],
      showErrorMessage: true,
      errorStyle: 'stop',
      errorTitle: `${col.header} must be a number`,
      error:
        col.key === 'price' || col.key === 'cost'
          ? 'Enter the amount in naira using digits only — no ₦ sign, no commas. Example: 3500'
          : 'Enter a whole number of units, for example 100.',
    });
  } else if (col.key === 'name') {
    sheet.dataValidations.add(range, {
      type: 'textLength',
      operator: 'lessThanOrEqual',
      allowBlank: false,
      formulae: [200],
      showErrorMessage: true,
      errorStyle: 'stop',
      errorTitle: 'Name too long',
      error: 'Product name must be 200 characters or fewer.',
    });
  }

  // Expiry is stored as TEXT on purpose: Excel's date cells serialise differently per locale,
  // and the importer reads formatted strings. Forcing text makes YYYY-MM-DD survive intact.
  if (col.key === 'expiry') {
    sheet.getColumn(i + 1).numFmt = '@';
  }
});

/* ── Sheet 2: Instructions ── */
const info = book.addWorksheet('Instructions', {
  views: [{ state: 'frozen', ySplit: 1 }],
});
info.columns = [{ width: 26 }, { width: 96 }];

const line = (label, text, opts = {}) => {
  const row = info.addRow([label, text]);
  row.getCell(1).font = { bold: true, color: { argb: opts.warn ? 'FFB91C1C' : 'FF0F172A' } };
  row.getCell(2).alignment = { wrapText: true, vertical: 'top' };
  if (opts.warn) row.getCell(2).font = { color: { argb: 'FFB91C1C' }, bold: true };
  row.commit();
  return row;
};

const heading = (text) => {
  const row = info.addRow([text, '']);
  row.getCell(1).font = { bold: true, size: 13, color: { argb: BRAND } };
  row.height = 24;
  row.commit();
};

const title = info.addRow(['Lanyard Pharmacy — medicine import template', '']);
title.getCell(1).font = { bold: true, size: 16, color: { argb: BRAND } };
title.height = 28;
info.addRow([]);

line(
  'What to do',
  'Fill in one row per medicine on the "Medicines" sheet, then send the file back. Do not rename the sheet, reorder the columns, or change the header row.',
);
line(
  'Required columns',
  'name, form, regulatoryClass and price. Every other column is optional but helpful.',
);
info.addRow([]);

heading('The three rules that matter most');
line(
  '1. regulatoryClass',
  'REQUIRED on every row. OTC = sells over the counter. POM = prescription-only, a pharmacist must verify a prescription before it is dispensed. CONTROLLED = controlled substance. Getting this wrong is a patient-safety and licensing issue, so a blank or mistyped value will REJECT the row rather than guess.',
  { warn: true },
);
line('2. price is in NAIRA', 'Type 3500 for ₦3,500.00. Do not type the ₦ sign, commas, or kobo.');
line(
  '3. batchNo + expiry go together',
  'Fill in both, or leave both empty. Dates must be written YYYY-MM-DD (for example 2027-12-31).',
);
info.addRow([]);

heading('Good to know');
line(
  'One file per branch',
  'The branch that receives this stock is chosen during upload, so it is not a column here. Send a separate file for each branch.',
);
line(
  'Nothing goes live automatically',
  'Everything imports as "draft". Our team reviews the prices and classifications, then publishes. That is why you can leave the status column blank.',
);
line(
  'Upload once',
  'Do not send the same file twice — duplicate names, SKUs and barcodes are rejected on the second upload.',
);
line(
  'File size',
  'Keep each file to about 500 rows. Split a longer catalogue across several files.',
);
line(
  'Dropdowns',
  'form, regulatoryClass, status, isAvailable and category use dropdowns. If a value you need is missing, tell us rather than typing your own.',
);
info.addRow([]);

heading('Worked examples');
const exHeader = info.addRow([
  'Column',
  `Example 1 (over the counter)   |   Example 2 (prescription-only)`,
]);
exHeader.getCell(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
exHeader.getCell(2).font = { bold: true, color: { argb: 'FFFFFFFF' } };
exHeader.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND } };
exHeader.getCell(2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND } };
exHeader.commit();

for (const col of COLUMNS) {
  const row = info.addRow([
    col.header,
    `${EXAMPLES[0][col.key] ?? ''}   |   ${EXAMPLES[1][col.key] ?? ''}`,
  ]);
  row.getCell(1).font = {
    bold: col.required,
    color: { argb: col.required ? HEADER_REQUIRED : MUTED },
  };
  row.commit();
}

/* ── Sheet 3: Lists (backs the dropdowns) ── */
const lists = book.addWorksheet('Lists');
lists.columns = [
  { header: 'form', width: 18 },
  { header: 'regulatoryClass', width: 20 },
  { header: 'status', width: 14 },
  { header: 'isAvailable', width: 14 },
  { header: 'category', width: 26 },
  { header: 'what regulatoryClass means', width: 62 },
];
lists.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
lists.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND } };

const MEANINGS = {
  OTC: 'Over the counter — any customer can buy it without a prescription.',
  POM: 'Prescription-only medicine — a pharmacist must verify a prescription first.',
  CONTROLLED: 'Controlled substance — prescription required and dispensing is restricted.',
};

const maxLen = Math.max(
  FORMS.length,
  CLASSES.length,
  STATUSES.length,
  BOOLEANS.length,
  CATEGORIES.length,
);
for (let i = 0; i < maxLen; i += 1) {
  lists.addRow([
    FORMS[i] ?? null,
    CLASSES[i] ?? null,
    STATUSES[i] ?? null,
    BOOLEANS[i] ?? null,
    CATEGORIES[i] ?? null,
    CLASSES[i] ? MEANINGS[CLASSES[i]] : null,
  ]);
}

/* ── Write both formats ── */
const xlsxPath = path.join(repoRoot, 'docs/medicine-import-template.xlsx');
await book.xlsx.writeFile(xlsxPath);

const csvPath = path.join(repoRoot, 'docs/medicine-import-template.csv');
const csvCell = (v) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
const csv = [
  COLUMNS.map((c) => c.header).join(','),
  ...EXAMPLES.map((ex) => COLUMNS.map((c) => csvCell(ex[c.key] ?? '')).join(',')),
].join('\n');
await fs.writeFile(csvPath, `${csv}\n`, 'utf8');

console.log(
  `✔ ${path.relative(repoRoot, xlsxPath)} — ${COLUMNS.length} columns, dropdowns on form/class/status/isAvailable/category`,
);
console.log(
  `✔ ${path.relative(repoRoot, csvPath)} — same columns, ${EXAMPLES.length} example rows`,
);
console.log(`  categories in dropdown: ${CATEGORIES.join(', ')}`);
