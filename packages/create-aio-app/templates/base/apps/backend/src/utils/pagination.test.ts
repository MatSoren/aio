import assert from "node:assert";
import { buildPaginationMeta } from "./pagination";
// Run: npx tsx src/utils/pagination.test.ts

assert.deepStrictEqual(buildPaginationMeta(0, 10, 25, 10), {
  skip: 0,
  take: 10,
  total: 25,
  hasMore: true,
});
assert.deepStrictEqual(buildPaginationMeta(20, 10, 25, 5), {
  skip: 20,
  take: 10,
  total: 25,
  hasMore: false,
});
assert.deepStrictEqual(buildPaginationMeta(0, 10, 0, 0), {
  skip: 0,
  take: 10,
  total: 0,
  hasMore: false,
});

console.log("pagination self-check passed");
