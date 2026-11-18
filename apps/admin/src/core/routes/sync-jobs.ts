/**
 * Admin UI for the data-store sync-jobs index.
 *
 *   GET  /sync-jobs              cross-vertical job list + cache metrics tile
 *   GET  /sync-jobs/:id          one job in full
 *   POST /sync-jobs/:id/cancel   cancel a pending or running job (operator+)
 *
 * The actual `sync_jobs` table lives on integration-server. admin-api
 * proxies; the views here are render-only.
 */
import type { FastifyInstance } from 'fastify'
import { requireAuth, requireRole } from '../auth/middleware'
import type { AdminApiClient, TenantRecord } from '../proxy/admin-api-client'
import { KNOWN_VERTICALS } from '../verticals'
import { parseTableQuery, type ColumnSpec, type TableSpec } from '../views/table-controls'
import { originLabel } from '../views/sync-schedule'

/**
 * Which columns of the sync-jobs table sort and filter, and on what.
 *
 * Built per-request, never module-level: the trailing Actions column renders
 * only for an admin or operator, and a fixed column list would put a filter
 * cell under a column a viewer does not have, misaligning every cell in the
 * row. The view reads `tableSpec.columns.some(c => c.key === 'actions')`
 * rather than re-deriving `canAct` on its own — see index.ejs — so the two can
 * never independently drift.
 *
 * Like /connections and unlike the ten in-memory tables, this route never
 * calls `applyTableQuery`: admin-api pages this table at the STORE, so
 * sorting or filtering the one page in hand would silently reorder or narrow
 * it while the pagination control kept speaking for the whole set. `sort`,
 * `dir` and every filter are FORWARDED (via `FILTER_PARAM` below). That is
 * also why no column here carries a `get` accessor: only `applyTableQuery`
 * ever calls one.
 *
 * The text/enum split follows the SERVER's own match semantics, not merely
 * what a cell displays. `platform`, `id` and `connection_id_contains` are
 * case-insensitive SUBSTRINGS in `SyncStore.syncWhere`, so they are text
 * boxes — a `<select>` would promise exact selection while the server matched
 * a fragment, and the adapter tree has real prefix-overlapping slugs
 * (`clear`/`clearbooks`, `dhl`/`dhl-freight`). `vertical`, `status` and
 * `tenant_id` are EXACT server-side, so an enum — which can only submit one of
 * its own option values — cannot diverge from what the server does with it.
 *
 * Two columns are deliberately inert. `progress` is folded together in the
 * template from a JSON blob (`128 rows · 1/2 resources`), which cannot be
 * ordered or matched in SQL without dialect-specific JSON work. `created` is
 * sort-only: a one-control-per-column filter row cannot express a date range,
 * the same reasoning /audit's from/to controls staying above its table rests
 * on.
 *
 * `tenantsUnavailable` (the caller's `listTenants` call FAILED, as opposed to
 * returning <= 1 tenant) forces the Tenant filter on with an EMPTY option
 * list. Conflating the two — computing the flag from `tenants.length` alone,
 * when a rejected fetch also leaves `tenants` at `[]` — would build the Tenant
 * column with no `filter` at all, and `parseTableQuery` skips a column without
 * one. A bookmarked `?f_tenant=dept-a` on a genuinely multi-tenant deployment
 * would then be silently dropped: admin-api receives no tenant filter, returns
 * every tenant's jobs, and, because the control itself is missing, nothing on
 * screen shows that the scope widened. Same defect, same fix, as /customers.
 */
function syncJobsTable(
  canAct: boolean,
  tenants: TenantRecord[],
  tenantsUnavailable: boolean,
): TableSpec {
  const showTenantFilter = tenants.length > 1 || tenantsUnavailable
  const columns: ColumnSpec[] = [
    // Not sortable: the id is a `randomUUID`, so ordering by it tells an
    // operator nothing. Filterable because pasting an id (or its first block)
    // out of a support ticket is how this page is actually used.
    { key: 'id', header: 'Sync id', filter: 'text' },
    {
      key: 'vertical',
      header: 'Vertical',
      sortable: true,
      // Bare slugs as both value and label, because the Vertical CELL renders
      // the bare slug — per THE RULE, an operator filtering a column filters
      // on what that column shows them.
      filter: { type: 'enum', options: KNOWN_VERTICALS.map((v) => ({ value: v, label: v })) },
      legacy: 'vertical',
    },
    { key: 'platform', header: 'Platform', sortable: true, filter: 'text' },
    // The cell shows only the first eight characters of the connection id, so
    // an eight-character prefix is the shortest thing that can match what is
    // on screen. The empty state says so.
    { key: 'connection', header: 'Connection', sortable: true, filter: 'text' },
    {
      key: 'tenant',
      header: 'Tenant',
      sortable: true,
      // Filters on the tenant ID; the cell renders the tenant NAME (resolved
      // in this app — admin-api and the store only ever see the id). That is
      // the documented exception to THE RULE the /connections and /customers
      // Tenant columns already carry, and the enum's labels carry both halves
      // (`name (id)`) so the control still reads as what the cell shows.
      ...(showTenantFilter
        ? {
            filter: {
              type: 'enum' as const,
              options: tenants.map((t) => ({ value: t.id, label: `${t.name} (${t.id})` })),
            },
          }
        : {}),
    },
    {
      key: 'status',
      header: 'Status',
      sortable: true,
      filter: {
        type: 'enum',
        options: ['pending', 'running', 'completed', 'failed'].map((s) => ({
          value: s,
          label: s,
        })),
      },
      legacy: 'status',
    },
    { key: 'progress', header: 'Progress' },
    { key: 'created', header: 'Created', sortable: true },
  ]
  if (canAct) columns.push({ key: 'actions', header: '' })
  return { id: 'sync-jobs-filters', baseUrl: '/sync-jobs', columns }
}

/**
 * Every `syncJobsTable` filter key, mapped to the exact admin-api query param
 * it is forwarded as — apps/admin-api's `routes/sync-jobs.ts` `ListQuery` is
 * the only authority for the right-hand side.
 *
 * This is the allow-list that keeps a future filterable column from silently
 * doing nothing: without it, a new `ColumnSpec` with `filter` set would
 * forward as `f_<key>` regardless of whether admin-api declares that key — and
 * Fastify STRIPS an unrecognised query param rather than 400ing, so the
 * operator would see a value in the box and a param in the URL while the
 * server ignored it. Note `connection`, which maps to `connection_id_contains`
 * and NOT to `connection_id`: the latter is an exact match that the public
 * `/v1/{vertical}/sync` route uses for ownership scoping, and pointing a
 * substring filter at it would return nothing for the eight-character prefix
 * the cell shows.
 */
const FILTER_PARAM: Readonly<Record<string, string>> = {
  id: 'id',
  vertical: 'vertical',
  platform: 'platform',
  connection: 'connection_id_contains',
  tenant: 'tenant_id',
  status: 'status',
}

export function createSyncJobsRoutes(apiClient: AdminApiClient) {
  return async function syncJobsRoutes(fastify: FastifyInstance): Promise<void> {
    // Read is open to any signed-in user; every write below carries its own
    // `requireRole('operator')`. This was a plugin-wide operator gate, which
    // blocked the GETs too — so a viewer saw the Connect section in the nav and
    // got `{"error":"Forbidden — insufficient role"}` from every link in it.
    //
    // The per-route form is deliberate: a new write route is NOT gated by
    // default, so anything added here has to say what it needs. The pages
    // themselves hide actions a viewer cannot take.
    fastify.addHook('preHandler', requireAuth)

    fastify.get<{ Querystring: Record<string, string | string[] | undefined> }>(
      '/sync-jobs',
      async (request, reply) => {
        const token = request.sessionUser!.token
        const canAct =
          request.sessionUser!.role === 'admin' || request.sessionUser!.role === 'operator'
        // Tenant names for the Tenant column. Non-fatal, as on every page that
        // shows one: an unreachable admin-api must not take the list down, and
        // the view falls back to the bare tenant id, which still identifies it.
        //
        // Fetched FIRST and sequentially rather than alongside the list,
        // because the spec's Tenant column depends on the outcome and
        // `parseTableQuery` skips a column with no `filter` — see
        // `syncJobsTable` for what that silently drops. The fetch's own
        // FAILURE is tracked apart from an empty/short result, since a
        // rejected `listTenants` also leaves `tenants` at `[]`.
        let tenants: TenantRecord[] = []
        let tenantsUnavailable = false
        try {
          tenants = await apiClient.listTenants(token)
        } catch {
          tenantsUnavailable = true
        }
        const tableSpec = syncJobsTable(canAct, tenants, tenantsUnavailable)
        const tableState = parseTableQuery(request.query, tableSpec)
        const [paged, metrics] = await Promise.all([
          apiClient.listSyncJobsPaged(token, {
            // `tableState.page`, not a second `parseInt` of the same param:
            // two clamps of one value is how a page and its pagination
            // control end up disagreeing about which page is on screen.
            page: tableState.page,
            sort: tableState.sort ?? undefined,
            dir: tableState.sort ? tableState.dir : undefined,
            // FILTER_PARAM is the only authority on the key each filter
            // forwards as; an entry with no mapping (should never happen —
            // every filterable ColumnSpec above has one) is dropped rather
            // than sent as a guessed name admin-api might not declare.
            ...Object.fromEntries(
              Object.entries(tableState.filters).flatMap(([k, v]) =>
                FILTER_PARAM[k] ? [[FILTER_PARAM[k], v]] : [],
              ),
            ),
          }),
          apiClient.getDataStoreMetrics(token),
        ])
        return reply.view('sync-jobs/index.ejs', {
          user: request.sessionUser,
          jobs: paged.data,
          meta: paged.meta,
          metrics,
          tenants,
          tableSpec,
          tableState,
          // Words each job's `origin` under its Created time.
          originLabel,
        })
      },
    )

    /**
     * One job in full. Read-only, so it sits under the plugin's `requireAuth`
     * floor like the list does — a viewer who can see the row can open it.
     *
     * A real page on a real URL: the list links here with `data-modal` and
     * public/js/resource-modal.js lifts this page's content into a dialog, but
     * nothing here knows or cares whether that happened. Deep links, new tabs
     * and no-JS all land on the same render.
     */
    fastify.get<{ Params: { id: string } }>('/sync-jobs/:id', async (request, reply) => {
      const token = request.sessionUser!.token
      const job = await apiClient.getSyncJob(token, request.params.id)
      // 404 rather than a 200 shell with every field dashed out: jobs are
      // pruned, so a bookmark from last month is expected to miss and the
      // status is what tells the modal script to hand the URL to the browser.
      return reply.status(job ? 200 : 404).view('sync-jobs/detail.ejs', {
        user: request.sessionUser,
        job,
        jobId: request.params.id,
      })
    })

    fastify.post<{ Params: { id: string } }>(
      '/sync-jobs/:id/cancel',
      { preHandler: [requireRole('operator')] },
      async (request, reply) => {
        const token = request.sessionUser!.token
        await apiClient.cancelSyncJob(token, request.params.id)
        return reply.redirect('/sync-jobs')
      },
    )
  }
}
