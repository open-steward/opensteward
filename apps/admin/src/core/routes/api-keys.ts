/**
 * Admin UI for tenant-scoped developer API keys.
 *
 *   GET   /api-keys             list (operator+)
 *   GET   /api-keys/new         mint form (admin-only)
 *   GET   /api-keys/:id         detail — full scope list (operator+)
 *   POST  /api-keys             mint — show plaintext once (admin-only)
 *   POST  /api-keys/:id/rotate  rotate — show replacement plaintext once (admin-only)
 *   POST  /api-keys/:id/revoke  revoke (admin-only)
 *
 * The plaintext is rendered into the template exactly once after a
 * successful mint. Refreshing the page lands on the list view without it,
 * forcing the operator to copy it before navigating away. It is not
 * recoverable afterwards, so the detail page below cannot and does not
 * show it.
 *
 * The list route must never gain pagination: there is no
 * GET /api/api-keys/:id upstream, so `AdminApiClient.getApiKey` (the detail
 * page) serves one key by fetching this SAME full, per-tenant list and
 * filtering it in memory. Paginating the index would silently 404 every key
 * past whatever the first page held.
 */
import type { FastifyInstance } from 'fastify'
import { requireRole } from '../auth/middleware'
import type { AdminApiClient, TenantRecord } from '../proxy/admin-api-client'
import { applyTableQuery, parseTableQuery, type ColumnSpec, type TableSpec } from '../views/table-controls'
import { SAFE_DEFAULT_SCOPES, VERTICAL_SCOPE_ITEMS } from './api-keys-defaults'

const DEFAULT_TENANT = 'default'

/**
 * A key's status, derived exactly the way the row is: index.ejs has no
 * `k.status` field to read — it branches on `k.revokedAt` and `k.expiresAt`
 * (the `<tr>` itself carries `class="muted"` when `k.revokedAt` is set).
 * Sort-only (no `filter` on the Status column below), so this need not
 * reproduce the cell's fourth "Rotating out" state (from `k.revokeAt`) —
 * THE RULE THAT MATTERS MOST only binds a column that carries a filter box.
 */
const keyStatus = (k: any) =>
  k.revokedAt ? 'revoked' : k.expiresAt && new Date(k.expiresAt) <= new Date() ? 'expired' : 'active'

/**
 * Which columns of the API-keys table sort and filter, and on what.
 *
 * Built inside the handler, not at module scope: index.ejs:107 renders the
 * Actions `<th>` only `<% if (isAdmin) %>`, so a fixed column list would put
 * a filter cell under a column that does not exist for operator and viewer
 * roles, misaligning every cell in the row.
 *
 * Mode and Label each diverge from the corrected-manifests.md snippet after
 * checking the cell against THE RULE THAT MATTERS MOST:
 *   - Mode's cell renders `k.mode === 'test' ? 'Test' : 'Live'` — an older
 *     admin-api never sent `mode` at all, and that row still shows "Live".
 *     `get: (k) => k.mode` would read `undefined` for it and drop it out of
 *     every Mode filter, even one for "live".
 *   - Label's cell renders `k.label || k.prefix` (index.ejs:129) — an
 *     unlabelled key shows its prefix in the Label column, so the accessor
 *     reproduces that fallback the same way /connect-links' Customer column
 *     falls back to the literal word 'anonymous'.
 * Tenant was verified to render the bare `k.tenantId` — no change needed on
 * WHAT it reads, but must-fix 5 changes HOW it is matched: this is an ENUM
 * select over the deployment's real tenant ids now, not a text box. The
 * store's own filter (`listApiKeys` → api-keys.ts's `where('tenant_id','=',
 * tenantId)`) is an EXACT match upstream, so a substring typed into a text
 * box — "north" for tenant id "t-northwind" — returned zero rows before any
 * client-side filtering even ran, with the empty state confidently claiming
 * no keys exist for tenant "north". Same fix, same reasoning, as
 * routes/webhooks.ts's `webhooksTable(tenants)` — see that column's own doc
 * comment.
 */
function apiKeysTable(isAdmin: boolean, tenants: TenantRecord[]): TableSpec {
  const columns: ColumnSpec[] = [
    {
      key: 'tenant',
      header: 'Tenant',
      sortable: true,
      filter: {
        type: 'enum',
        options: tenants.map((t) => ({ value: t.id, label: `${t.name} (${t.id})` })),
      },
      legacy: 'tenantId',
      get: (k: any) => k.tenantId,
    },
    {
      key: 'mode',
      header: 'Mode',
      sortable: true,
      filter: 'text',
      get: (k: any) => (k.mode === 'test' ? 'test' : 'live'),
    },
    { key: 'prefix', header: 'Prefix', sortable: true, filter: 'text', get: (k: any) => k.prefix },
    {
      key: 'label',
      header: 'Label',
      sortable: true,
      filter: 'text',
      get: (k: any) => k.label || k.prefix,
    },
    { key: 'scopes', header: 'Scopes', sortable: false },
    { key: 'status', header: 'Status', sortable: true, get: keyStatus },
    { key: 'created', header: 'Created', sortable: true, get: (k: any) => k.createdAt },
    { key: 'lastUsed', header: 'Last used', sortable: true, get: (k: any) => k.lastUsedAt },
  ]
  // The header cell exists only for an admin; a fixed list would put a
  // filter box under a column that is not there.
  if (isAdmin) columns.push({ key: 'actions', header: '' })
  return { id: 'api-keys-filters', baseUrl: '/api-keys', columns }
}

export function createApiKeysRoutes(apiClient: AdminApiClient) {
  return async function apiKeysRoutes(fastify: FastifyInstance): Promise<void> {
    fastify.addHook('preHandler', requireRole('operator'))

    // The tenant list, for the Tenant filter's enum options. Every render of
    // the list view needs it — same as webhooks.ts's own `tenantsFor` — and
    // it must never be fatal: an unreachable admin-api must not take the
    // whole page down over a filter control.
    const tenantsFor = (token: string) => apiClient.listTenants(token).catch(() => [])

    fastify.get('/api-keys', async (request, reply) => {
      const token = request.sessionUser!.token
      const isAdmin = request.sessionUser?.role === 'admin'
      // Fetched first: the Tenant column's enum options are built from this
      // same list, so the table spec cannot exist before it does.
      const tenants = await tenantsFor(token)
      const table = apiKeysTable(isAdmin, tenants)
      const tableState = parseTableQuery(request.query, table)
      // The one upstream filter this route already had — kept, so a
      // deployment with many keys across many tenants does not fetch every
      // tenant's rows on every request. `getApiKey` (the detail page) filters
      // this SAME full-per-tenant list rather than a paginated one, which is
      // why this route must never gain pagination of its own — see the
      // module doc comment at the top of this file.
      const tenantId = tableState.filters.tenant || undefined
      const keys = await apiClient.listApiKeys(token, tenantId)
      return reply.view('api-keys/index.ejs', {
        user: request.sessionUser,
        keys: applyTableQuery(keys, tableState, table),
        tableSpec: table,
        tableState,
        minted: null,
        error: null,
      })
    })

    // Mint flow is admin-only.
    fastify.get('/api-keys/new', { preHandler: requireRole('admin') }, async (request, reply) => {
      const tenants = await apiClient.listTenants(request.sessionUser!.token).catch(() => [])
      return reply.view('api-keys/new.ejs', {
        user: request.sessionUser,
        knownVerticals: VERTICAL_SCOPE_ITEMS,
        safeDefaultScopes: [...SAFE_DEFAULT_SCOPES],
        tenants,
        defaults: {
          tenantId: DEFAULT_TENANT,
          label: '',
          // No preselection. A key minted in the wrong mode is not a typo the
          // operator notices — it authenticates a surface they did not intend
          // — so the choice is made explicitly rather than defaulted into.
          mode: '',
          scopeMode: 'safe-default',
          scopes: [...SAFE_DEFAULT_SCOPES],
        },
        error: null,
      })
    })

    /**
     * One key, in full. The list row summarises the scopes as a count — a
     * safe-default key carries one scope per vertical plus the shared set,
     * and one line each would make the row taller than the screen — so this
     * page is where the whole set, and the fields the row has no column for,
     * live.
     *
     * Left as an ordinary full page on purpose: the list links it with
     * `data-modal`, and public/js/resource-modal.js lifts this page's content
     * into a dialog client-side. Nothing here knows about the modal.
     */
    fastify.get<{ Params: { id: string } }>('/api-keys/:id', async (request, reply) => {
      const key = await apiClient.getApiKey(request.sessionUser!.token, request.params.id)
      // 404 rather than an empty page: a missing key is a dead link, and the
      // modal script treats any non-200 as "navigate instead", which lands the
      // operator on this same page saying so.
      if (!key) {
        return reply.status(404).view('api-keys/detail.ejs', {
          user: request.sessionUser,
          apiKey: null,
        })
      }
      return reply.view('api-keys/detail.ejs', {
        user: request.sessionUser,
        // Named fields, not the whole record: `ApiKey` is a loose schema and
        // the mint response of the same shape carries `plaintext`. Nothing
        // downstream can render a secret that was never handed to it.
        apiKey: {
          id: key.id,
          tenantId: key.tenantId,
          // Explicit, like every other field here — the whitelist is the point.
          mode: key.mode ?? 'live',
          prefix: key.prefix,
          label: key.label,
          scopes: key.scopes && key.scopes.length > 0 ? key.scopes : ['*'],
          createdAt: key.createdAt,
          lastUsedAt: key.lastUsedAt,
          revokedAt: key.revokedAt,
        },
      })
    })

    fastify.post<{
      Body: {
        tenantId?: string
        label?: string
        mode?: string
        scopeMode?: string
        scopes?: string | string[]
        expiryDays?: string
      }
    }>('/api-keys', { preHandler: requireRole('admin') }, async (request, reply) => {
      const token = request.sessionUser!.token
      const tenantId = (request.body?.tenantId ?? '').trim()
      const label = (request.body?.label ?? '').trim()
      const mode = (request.body?.mode ?? '').trim()
      const expiryDaysRaw = (request.body?.expiryDays ?? '').trim()
      const scopeMode = request.body?.scopeMode ?? 'safe-default'
      const rawScopes = request.body?.scopes
      const selected = Array.isArray(rawScopes)
        ? rawScopes
        : typeof rawScopes === 'string' && rawScopes.length > 0
          ? [rawScopes]
          : []
      // 'all' → undefined means backend stores ['*']. 'safe-default' sends
      // the recommended preset (no vertical:write). 'custom' uses operator
      // selections. Keep all three modes routable from the same handler.
      const scopes =
        scopeMode === 'safe-default'
          ? [...SAFE_DEFAULT_SCOPES]
          : scopeMode === 'custom' && selected.length > 0
            ? selected
            : undefined

      const tenants = await apiClient.listTenants(token).catch(() => [])
      const renderError = (msg: string) =>
        reply.view('api-keys/new.ejs', {
          user: request.sessionUser,
          // Also needed on this path: the form re-renders the scope grid and
          // its safe-default preset from these, and omitting them would throw
          // at render time — an error page in place of the error message.
          knownVerticals: VERTICAL_SCOPE_ITEMS,
          safeDefaultScopes: [...SAFE_DEFAULT_SCOPES],
          tenants,
          defaults: {
            tenantId,
            label,
            mode,
            scopeMode,
            scopes: selected,
          },
          error: msg,
        })

      if (!tenantId) return renderError('Tenant id is required.')
      // Checked here rather than upstream so the operator is told which field
      // is at fault and keeps what they typed. A key with no label cannot be
      // told apart from any other when the time comes to revoke one.
      if (!label)
        return renderError(
          'Give the key a label so you can tell it apart later — e.g. "Local dev" or "CI runner".',
        )
      if (scopeMode === 'custom' && selected.length === 0) {
        return renderError('Pick at least one scope, or choose "All access".')
      }
      // Validated rather than defaulted: HTML5 `required` on the radio group is
      // the first line, but a hand-rolled POST bypasses it, and defaulting to
      // 'live' would mean a request that forgot the field silently mints a key
      // against production data.
      if (mode !== 'live' && mode !== 'test') {
        return renderError('Choose whether this is a live key or a test key.')
      }

      // Blank = never expires. The select's values are fixed, but a
      // hand-rolled POST is not: anything non-numeric or non-positive reads
      // as "no expiry" rather than a mint failure.
      const expiryDays = Number(expiryDaysRaw)
      const expiresAt =
        expiryDaysRaw !== '' && Number.isFinite(expiryDays) && expiryDays > 0
          ? Date.now() + expiryDays * 86_400_000
          : null

      try {
        const minted = await apiClient.mintApiKey(token, {
          tenantId,
          label: label || null,
          scopes,
          mode,
          expiresAt,
        })
        const keys = await apiClient.listApiKeys(token, tenantId)
        // No filters or sort after a mutation — the operator just acted and
        // the default order is the answer, same as the other absorbed
        // tables. This route is admin-only, so the Actions column is always
        // present here. `tenants` was already fetched above for the
        // new.ejs error path — reused here for the Tenant filter's enum
        // options rather than fetched twice.
        const table = apiKeysTable(true, tenants)
        const tableState = parseTableQuery({}, table)
        return reply.view('api-keys/index.ejs', {
          user: request.sessionUser,
          keys: applyTableQuery(keys, tableState, table),
          tableSpec: table,
          tableState,
          minted,
          error: null,
        })
      } catch (err) {
        const message =
          err instanceof Error && err.message ? err.message : 'Failed to mint API key.'
        return renderError(message)
      }
    })

    fastify.post<{ Params: { id: string } }>(
      '/api-keys/:id/rotate',
      { preHandler: requireRole('admin') },
      async (request, reply) => {
        const token = request.sessionUser!.token
        // Needed by both branches below for the Tenant filter's enum
        // options — fetched once, up front.
        const tenants = await tenantsFor(token)
        try {
          const rotated = await apiClient.rotateApiKey(token, request.params.id)
          const keys = await apiClient.listApiKeys(token)
          const table = apiKeysTable(true, tenants)
          const tableState = parseTableQuery({}, table)
          // Rendered like a fresh mint — the replacement's plaintext shows
          // exactly once, plus when the old key stops working.
          return reply.view('api-keys/index.ejs', {
            user: request.sessionUser,
            keys: applyTableQuery(keys, tableState, table),
            tableSpec: table,
            tableState,
            minted: rotated,
            error: null,
          })
        } catch (err) {
          const keys = await apiClient.listApiKeys(token)
          const table = apiKeysTable(true, tenants)
          const tableState = parseTableQuery({}, table)
          const message =
            err instanceof Error && err.message ? err.message : 'Failed to rotate API key.'
          return reply.view('api-keys/index.ejs', {
            user: request.sessionUser,
            keys: applyTableQuery(keys, tableState, table),
            tableSpec: table,
            tableState,
            minted: null,
            error: message,
          })
        }
      },
    )

    fastify.post<{ Params: { id: string } }>(
      '/api-keys/:id/revoke',
      { preHandler: requireRole('admin') },
      async (request, reply) => {
        const token = request.sessionUser!.token
        // Uncaught on purpose: a swallowed revoke failure would render the
        // same list page as success, and a key the operator believes is
        // revoked but is not is a live credential.
        await apiClient.revokeApiKey(token, request.params.id)
        return reply.redirect('/api-keys')
      },
    )
  }
}
