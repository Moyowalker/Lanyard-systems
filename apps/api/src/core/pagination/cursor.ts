import { Paginated } from '@lanyard/contracts';

/**
 * Opaque, stable cursor pagination keyed on Mongo `_id` (ascending). The cursor is the
 * base64url of the last returned `_id`; callers pass it back as `?cursor=`.
 */

export function decodeCursor(cursor?: string): string | undefined {
  if (!cursor) return undefined;
  try {
    return Buffer.from(cursor, 'base64url').toString('utf8');
  } catch {
    return undefined;
  }
}

export function encodeCursor(id: string): string {
  return Buffer.from(id, 'utf8').toString('base64url');
}

/** Build the `{ _id: { $gt } }` filter fragment for a decoded cursor (ascending order). */
export function cursorFilter(cursor?: string): Record<string, unknown> {
  const id = decodeCursor(cursor);
  return id ? { _id: { $gt: id } } : {};
}

/**
 * Build the `{ _id: { $lt } }` filter fragment for a decoded cursor (descending
 * order). Pair with `.sort({ _id: -1 })` for newest-first feeds like the audit log.
 */
export function cursorFilterDesc(cursor?: string): Record<string, unknown> {
  const id = decodeCursor(cursor);
  return id ? { _id: { $lt: id } } : {};
}

/**
 * Given `limit+1` docs (each with an `id` string) fetched from the DB, split off the
 * extra row to compute `nextCursor` and return the canonical paginated envelope.
 */
export function paginate<T extends { id: string }>(rows: T[], limit: number): Paginated<T> {
  const hasMore = rows.length > limit;
  const data = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore ? encodeCursor(data[data.length - 1].id) : null;
  return { data, meta: { nextCursor } };
}
