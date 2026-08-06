import type { PaginationMeta } from "@{{scope}}/contracts";

/** Builds the `page` block of a `PaginatedApiResponse`. `pageCount` is the number of rows the
 * current query actually returned (not `take`) — on the last page that's smaller than `take`,
 * which is exactly what makes `hasMore` correct without a second `COUNT` query. */
export const buildPaginationMeta = (
  skip: number,
  take: number,
  total: number,
  pageCount: number,
): PaginationMeta => ({
  skip,
  take,
  total,
  hasMore: skip + pageCount < total,
});
