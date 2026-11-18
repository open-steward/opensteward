import type { FastifyInstance } from 'fastify'
import { requireRole } from '../auth/middleware'
import type { AdminApiClient, AuditFilter } from '../proxy/admin-api-client'
import { one, parseTableQuery, type ColumnSpec, type TableSpec } from '../views/table-controls'

/**
 * Pull the supported filter params out of a query object, dropping blanks so
 * empty form fields don't narrow the result set. Reads the LEGACY admin-api
 * names (`action`, `user_id`, `target_id`, `vertical`, `from`, `to`) — the
 * shape `/audit/export` is linked with; see `exportQs` below.
 *
 * Every value goes through `one()` because Fastify hands a REPEATED key
 * through as an array, and an array here is the same silent-whole-log-export
 * that `exportQs` exists to prevent, one hop later:
 * `?action=user.login&action=other` would reach `exportAudit` as
 * `{action: ['user.login','other']}`, axios serialises that as `action[]=…`,
 * admin-api declares no such key, and the operator downloads the entire audit
 * log believing they downloaded a filtered slice. Last value wins, matching
 * `parseTableQuery` on the list route beside it.
 */
function filtersFromQuery(q: Record<string, string | string[] | undefined>): AuditFilter {
  const f: AuditFilter = {}
  const action = one(q.action)
  if (action) f.action = action
  const userId = one(q.user_id)
  if (userId) f.user_id = userId
  const targetId = one(q.target_id)
  if (targetId) f.target_id = targetId
  const vertical = one(q.vertical)
  if (vertical) f.vertical = vertical
  const from = one(q.from)
  if (from) f.from = from
  const to = one(q.to)
  if (to) f.to = to
  return f
}

/**
 * Which columns of the audit table sort and filter, and on what.
 *
 * Built per-request (`auditTable(actions)`), never module-level: the Action
 * column's options come from a per-request `listAuditActions` call, exactly
 * as /connections builds its Tenant enum.
 *
 * This route NEVER calls `applyTableQuery`. `/audit` is the only table in the
 * admin with true SQL pagination — tens of thousands of rows, LIMIT/OFFSET at
 * the store, an honest `countAudit` — so sorting or filtering the fifty rows
 * already in hand would reorder a fraction of the log while the pagination
 * control kept claiming to speak for all of it. `sort`, `dir` and every filter
 * are FORWARDED to `GET /api/audit` (via `FILTER_PARAM` below), which orders
 * and narrows in SQL before the slice. That is also why no column here carries
 * a `get` accessor: only `applyTableQuery` ever calls one.
 *
 * Match semantics per column, because a text box implies substring and two of
 * these deliberately do not behave that way — the difference is stated in the
 * empty-state copy in audit.ejs as well as here:
 *
 *   User      EXACT. admin-api resolves a username to its `user_id` and
 *             matches that id exactly. The CELL renders `username || userId`,
 *             which is what an operator types; the id it resolves to is the
 *             stored key.
 *   Action    an ENUM over the live action list, matched exactly server-side —
 *             an enum can only submit one of its own option values, so the
 *             control cannot promise something the server does not do. The
 *             option values are the raw dotted actions the cell renders.
 *   Vertical  case-insensitive SUBSTRING, which is what a text box implies.
 *             The cell renders `e.vertical || '—'`; a row with no vertical
 *             matches no needle (`lower(NULL) LIKE …` is NULL), so the em
 *             dash is not searchable text.
 *   Target    EXACT on the whole id. The cell renders `targetId || '—'`.
 *
 * `time` is sort-only: its filter is the from/to date range, which is a
 * two-value control the one-per-column filter row cannot express, so it lives
 * above the table. `from`/`to` are therefore `hidden` (no `<th>`) AND
 * `rendered` (audit.ejs draws the two date inputs itself) — without
 * `rendered`, `_table-filters-form.ejs` would ALSO emit a hidden mirror of
 * each, submitting `f_from` twice with the stale value last and winning.
 *
 * Every `legacy` alias here is a URL that exists in the wild: `?action=` and
 * `?user_id=` are both linked from views/users/detail.ejs today, and
 * `?target_id=`/`?from=`/`?to=` are the params the old above-table filter card
 * emitted, so bookmarks carry them.
 */
function auditTable(actions: string[]): TableSpec {
  const columns: ColumnSpec[] = [
    { key: 'time', header: 'Time', sortable: true },
    { key: 'user', header: 'User', sortable: true, filter: 'text', legacy: 'user_id' },
    {
      key: 'action',
      header: 'Action',
      sortable: true,
      filter: { type: 'enum', options: actions.map((a) => ({ value: a, label: a })) },
      legacy: 'action',
    },
    { key: 'vertical', header: 'Vertical', sortable: true, filter: 'text' },
    { key: 'target', header: 'Target', sortable: true, filter: 'text', legacy: 'target_id' },
    // The date range: parsed and serialised like any other filter (so it
    // survives a sort click and a page change through `tableQs`/`sortHref`),
    // but drawn by the view rather than by the filter row.
    { key: 'from', header: '', filter: 'text', legacy: 'from', hidden: true, rendered: true },
    { key: 'to', header: '', filter: 'text', legacy: 'to', hidden: true, rendered: true },
  ]
  return { id: 'audit-filters', baseUrl: '/audit', columns }
}

/**
 * Every `auditTable` filter key, mapped to the exact admin-api query param it
 * is forwarded as — apps/admin-api's `routes/audit.ts` (`ListQuery`) is the
 * only authority for the right-hand side. Four of the six differ from the
 * `f_<key>` shape because `/api/audit` has always taken these names and
 * `/audit/export` still reads exactly them.
 *
 * This is also what keeps a future filterable column from silently doing
 * nothing: without the map, a new `ColumnSpec` with `filter` set would be
 * forwarded under a name admin-api may not declare, and Fastify strips an
 * unrecognised query param rather than 400ing — so the operator would see a
 * value in the box and a param in the URL while the server ignored it.
 */
const FILTER_PARAM: Readonly<Record<string, string>> = {
  user: 'user_id',
  action: 'action',
  vertical: 'vertical',
  target: 'target_id',
  from: 'from',
  to: 'to',
}

export function createAuditRoutes(apiClient: AdminApiClient) {
  return async function auditRoutes(fastify: FastifyInstance): Promise<void> {
    fastify.addHook('preHandler', requireRole('admin'))

    fastify.get<{ Querystring: Record<string, string | string[] | undefined> }>(
      '/audit',
      async (request, reply) => {
        const token = request.sessionUser!.token
        // A skeleton spec — no real Action options yet — is enough to parse the
        // query into sort/filter state: `parseTableQuery` only checks whether a
        // column HAS a filter, never what its OPTIONS are. That lets the page
        // fetch and the action list run in parallel below.
        const tableState = parseTableQuery(request.query, auditTable([]))
        // `?page=abc`, `?page=0`, `?page=-3` and the repeated-key `?page=1&page=x`
        // all reach here from a hand-edited URL. `parseTableQuery` is what
        // clamps them now (`Math.max(1, parseInt(one(q.page) || '1', 10) || 1)`,
        // array-safe via `one()`) — the route no longer does its own `parseInt`,
        // which had neither guard. A page below 1 or unparseable falls back to
        // 1, same as an omitted `page`. It matters here and not only in
        // admin-api because axios forwards this value verbatim, so this route is
        // how a bogus page is actually reachable from a browser.
        const page = tableState.page
        // FILTER_PARAM is the only authority on the name each filter forwards
        // under; a key with no mapping (should never happen — every
        // `ColumnSpec.filter` above has one) is dropped rather than sent as a
        // guessed `f_<key>` admin-api does not declare.
        const forwarded = Object.entries(tableState.filters).flatMap(([k, v]) =>
          FILTER_PARAM[k] ? ([[FILTER_PARAM[k], v]] as Array<[string, string]>) : [],
        )
        const filters = Object.fromEntries(forwarded) as AuditFilter
        const [result, actions] = await Promise.all([
          apiClient.listAudit(
            token,
            page,
            50,
            filters,
            tableState.sort ?? undefined,
            tableState.sort ? tableState.dir : undefined,
          ),
          // Feeds the action filter's options; the page works without it.
          apiClient.listAuditActions(token).catch(() => [] as string[]),
        ])

        // The export link, built HERE rather than in the view, and from the
        // legacy names rather than from `tableQs`.
        //
        // `/audit/export` reads `action`/`user_id`/`target_id`/`vertical`/
        // `from`/`to` (see `filtersFromQuery` above). The table now emits
        // `f_action`/`f_user`/`f_target`. An export link built from `tableQs`
        // would carry names the export endpoint recognises none of, so it would
        // silently export the WHOLE audit log while the operator believed they
        // had exported what was on screen — no error, and a file that looks
        // plausible until someone counts the rows. No `page` (an export is not
        // paginated) and no `sort`/`dir` (the export keeps its fixed
        // newest-first order).
        const exportQs = forwarded
          .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
          .join('&')

        return reply.view('audit.ejs', {
          user: request.sessionUser,
          entries: result.data,
          meta: result.meta,
          total: result.meta.total,
          limit: result.meta.limit,
          tableSpec: auditTable(actions),
          tableState,
          exportQs,
        })
      },
    )

    // Stream the export through to the browser as a download. Filters mirror
    // whatever is active on the list page (passed as query params).
    fastify.get<{ Querystring: Record<string, string | string[] | undefined> }>(
      '/audit/export',
      async (request, reply) => {
        const token = request.sessionUser!.token
        const format = one(request.query.format) === 'json' ? 'json' : 'csv'
        const filters = filtersFromQuery(request.query)
        const { body, contentType } = await apiClient.exportAudit(token, format, filters)
        const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')
        return reply
          .header('content-type', contentType)
          .header('content-disposition', `attachment; filename="audit-log-${stamp}.${format}"`)
          .send(body)
      },
    )
  }
}
