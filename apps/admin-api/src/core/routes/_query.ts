import { z } from 'zod'

/**
 * Query-param shapes shared by every list endpoint that a browser can reach
 * twice with the same key.
 *
 * This lived as a verbatim copy in `connections.ts` and again in
 * `end-users.ts`; `audit.ts` would have been the third. Three copies with no
 * shared home is how the two of them already drifted apart in their comments,
 * so it moves here the moment a third caller appears rather than after.
 */

/**
 * A query value that may arrive as a single string or, when the key repeats
 * (`?f_label=a&f_label=b`), an array.
 *
 * Fastify's default parser (`fast-querystring`) produces an ARRAY for a
 * repeated key, and a bare `z.string()` schema answers 400 for it (verified
 * empirically: that is exactly what an unconverted `page`/`limit` does). A
 * stale bookmark, a browser back/forward resubmission, or any client other
 * than the admin app must not 400 a whole page over it.
 *
 * The admin app's own query parser (`one()` in `table-controls.ts`) takes the
 * LAST value when a key repeats — which is also what a browser sends when a
 * form has two controls of one name — so these params accept the same shape
 * and resolve the same way.
 */
export const RepeatableString = z.union([z.string(), z.array(z.string())])

/**
 * Collapse a `RepeatableString` to one value, last-wins.
 *
 * Re-exported from `@opensteward/shared` rather than defined here. It lived in
 * both places, character for character, on the argument that a package cannot
 * depend on an app — true, and beside the point: this app already depends on
 * that package, so the copy only survived because `util/query-params` was not
 * re-exported from its index. It is now.
 *
 * **Calling this is not optional.** Widening a param to `RepeatableString`
 * without collapsing it downgrades a 400 into a 500: an allow-list test like
 * `isAuditSortKey(['a','b'])` is safely `false`, but a filter value reaching
 * `.toLowerCase()` as an array throws. Every `RepeatableString` param must
 * pass through here before it reaches a filter, a clamp, or a store call.
 *
 * The admin APP keeps its own third implementation (`one()` in
 * `views/table-controls.ts`) on purpose: it is a different function
 * (`unknown → string`, recursive) and that module is dependency-free so EJS
 * renders carry no import cost.
 */
export { one } from '@opensteward/shared'
