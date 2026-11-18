/**
 * Query-param helpers, for this package's X-Admin-Secret routers and for
 * admin-api's own routes.
 *
 * This is the single definition. It started as a private three-liner in
 * `data-store/admin-sync-router.ts`, moved here when a second router in this
 * package needed it, and is now re-exported from `../index.ts` — so
 * admin-api's `routes/_query.ts`, which held a character-for-character copy,
 * re-exports THIS one. The copy survived on the argument that a package cannot
 * depend on an app; true, and beside the point, since admin-api already
 * depends on this package and the only thing blocking the import was the
 * missing export line.
 *
 * Three routers here use it — `/admin/sync-jobs`,
 * `/admin/webhook-subscriptions/:id/deliveries` and `/admin/end-users` — and
 * five of admin-api's thirteen querystring-bearing route files use it through
 * the re-export: `audit.ts`, `connections.ts`, `end-users.ts`, `sync-jobs.ts`
 * and `webhook-subs.ts`.
 *
 * The other eight have NOT been converted and still declare their query params
 * as bare `z.string()`, so a repeated key answers 400 there: `api-keys.ts`,
 * `connect-link-templates.ts`, `connect-sessions.ts`, `end-user-tokens.ts`,
 * `platforms.ts`, `scim.ts`, `scope-groups.ts` and `sso.ts`. (Users, tenants
 * and notifications are not in either list — those routes declare no
 * querystring schema at all.)
 *
 * That boundary is where this work stopped, not a judgement that the eight are
 * fine: the five converted are the tables that gained sorting and per-column
 * filtering, where a repeated key arrives from a real bookmark or a
 * back/forward resubmission. Converting the rest is a decision about a surface
 * that work never touched.
 *
 * The admin APP keeps a third, genuinely different implementation (`one()` in
 * `views/table-controls.ts`): it takes `unknown` rather than
 * `string | string[]`, recurses, and lives in a module that is
 * dependency-free on purpose so EJS renders carry no import cost.
 */

/**
 * One value from a query field, last-wins.
 *
 * Fastify's default parser (`fast-querystring`) yields an ARRAY for a repeated
 * key, so `?eventType=a&eventType=b` arrives as `['a','b']`. That is not a
 * curiosity: an array reaching a store's `filter.eventType.toLowerCase()` is a
 * TypeError, i.e. an unhandled **500** reachable by hand-editing a URL, and it
 * shipped that way on the deliveries route until this helper reached it. The
 * quieter half is just as bad — a repeated `?status=` that no longer matches
 * any known value silently drops the filter and WIDENS the result set, with
 * the control on screen still claiming to be narrowed.
 *
 * Last-wins because that is what a browser sends when a form has two controls
 * of one name, and it is the rule admin-api's `routes/_query.ts` and the admin
 * app's `table-controls.ts` already apply, so a value resolves the same way at
 * every hop.
 */
export function one(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[v.length - 1] : v
}
