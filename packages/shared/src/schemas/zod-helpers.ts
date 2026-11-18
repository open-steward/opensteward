/**
 * Zod ergonomics shared across every vertical.
 *
 * `nullish(s)` means: the field is BOTH optional (can be missing) AND
 * nullable (can be explicitly `null`). Upstream platforms legitimately
 * distinguish "I don't have this value" (explicit null) from "I didn't
 * include this key" (absent). Most reference IDs, optional timestamps,
 * optional address sub-fields, and failure-reason fields fit this shape.
 *
 * Use plain `.optional()` when missing = unknown and `null` carries no
 * extra meaning (flags, internal state).
 *
 * COLLECTIONS follow the same rule, and this is the part that is easy to get
 * wrong. `[]` is a positive assertion — "this document has no line items" —
 * not a stand-in for "the source did not tell us". Wrap a collection in
 * `nullish` and have the mapper emit:
 *
 *   - `null` when the source omitted the key (not reported / not fetched)
 *   - `[]`   when the source returned an explicitly empty collection
 *   - rows   when the source returned rows
 *
 * The tempting `(raw.Rows ?? []).map(...)` collapses the first two into the
 * second. That shipped a real defect: Fortnox's `/3/invoices` LIST endpoint
 * omits `InvoiceRows` (they need a per-invoice fetch), so a 2 000,00 SEK
 * invoice was published with `lineItems: []`, and a consumer counting
 * documents with no line items got a wrong answer with no way to detect it.
 */

import { z } from 'zod'

export const nullish = <T extends z.ZodTypeAny>(schema: T) => schema.nullable().optional()

/**
 * Append `'unknown'` to an enum so adapters can map unmappable upstream
 * values without silently dropping them. Per the API validation policy:
 * "Never silently drop an unmappable value."
 *
 * Use the default branch in adapter mapping switches to map unknown upstream
 * statuses to `'unknown'`, so reconciliation can spot platforms that emit
 * values we don't yet normalise.
 */
export const withUnknown = <T extends [string, ...string[]]>(values: T) =>
  z.enum([...values, 'unknown'] as const)
