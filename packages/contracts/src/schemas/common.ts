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

/** Cursor pagination plus an optional explicit branch context for staff operations. */
export const BranchPaginationQuerySchema = PaginationQuerySchema.extend({
  branchId: z.string().regex(/^[a-f\d]{24}$/i, 'must be a 24-char ObjectId').optional(),
});
export type BranchPaginationQuery = z.infer<typeof BranchPaginationQuerySchema>;
