import { z } from 'zod';

/** Cursor pagination envelope for list endpoints (docs/architecture/06 §1). */
export interface Paginated<T> {
  data: T[];
  meta: { nextCursor: string | null };
}

/** Standard cursor-pagination query params, reused by list endpoints. */
export const PaginationQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().optional(),
});
export type PaginationQuery = z.infer<typeof PaginationQuerySchema>;
