import * as XLSX from 'xlsx';

export type SpreadsheetFormat = 'xlsx' | 'csv';

export interface SpreadsheetFile {
  buffer: Buffer;
  filename: string;
  contentType: string;
}

/**
 * Turn an array of flat records into a downloadable xlsx or CSV file. Shared by the
 * reporting endpoints so every export builds the same way (one row per record,
 * header row from the object keys).
 */
export function toSpreadsheet(
  records: Array<Record<string, string | number>>,
  opts: { sheetName: string; filenameBase: string; format: SpreadsheetFormat },
): SpreadsheetFile {
  const sheet = XLSX.utils.json_to_sheet(records);
  const stamp = new Date().toISOString().slice(0, 10);
  if (opts.format === 'csv') {
    return {
      buffer: Buffer.from(XLSX.utils.sheet_to_csv(sheet), 'utf8'),
      filename: `${opts.filenameBase}-${stamp}.csv`,
      contentType: 'text/csv',
    };
  }
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, opts.sheetName);
  return {
    buffer: XLSX.write(book, { bookType: 'xlsx', type: 'buffer' }) as Buffer,
    filename: `${opts.filenameBase}-${stamp}.xlsx`,
    contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  };
}
