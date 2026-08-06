/**
 * Recursively turns every `Date` in `T` into a `string`.
 *
 * The backend's domain types carry real `Date` objects (from Prisma). Over the wire, JSON has no
 * `Date` type — `JSON.stringify` turns them into ISO strings, so the *actual* shape a client
 * receives already has `string` where the domain type says `Date`. `SerializeDates<T>` names that
 * transport shape explicitly instead of leaving it implicit and hoping every consumer remembers it:
 *
 * ```ts
 * export type PublicWidgetResponse = SerializeDates<PublicWidget>;
 * ```
 *
 * Evaluation order (why the conditional chain is in this order and not another): `T extends Date`
 * is checked *before* `T extends object`, because `Date` itself is an object — testing `object`
 * first would recurse into `Date`'s own properties instead of replacing it wholesale. Arrays are
 * checked next (`T extends (infer U)[]`) so `Date[]` maps to `string[]`, not `{ [K in keyof
 * Date[]]: ... }`. Anything left that isn't an object (primitives, `null`, `undefined`) falls
 * through unchanged in the final branch.
 */
export type SerializeDates<T> = T extends Date
  ? string
  : T extends (infer U)[]
    ? SerializeDates<U>[]
    : T extends object
      ? { [K in keyof T]: SerializeDates<T[K]> }
      : T;
