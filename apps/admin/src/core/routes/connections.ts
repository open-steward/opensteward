import type { FastifyInstance } from 'fastify'
import { requireAuth, requireRole } from '../auth/middleware'
import { flashError, flashSuccess } from '../flash'
import type { AdminApiClient, TenantRecord } from '../proxy/admin-api-client'
import { KNOWN_VERTICALS, VERTICAL_LABELS } from '../verticals'
import { formatBackendError } from '../proxy/format-backend-error'
import { platformIndex, type CatalogPlatformSummary } from './platform-catalog'
import { loadLogoSettings } from './logo-config'
import { renderPlatformLogo } from '../platform-logo'
import { parseTableQuery, type ColumnSpec, type TableSpec } from '../views/table-controls'
import {
  parseSyncScheduleForm,
  presentSync,
  type SyncScheduleFormBody,
} from '../views/sync-schedule'
import type { LogoConfig } from '@opensteward/shared'

/**
 * The platform's logo and display name for one connection — the same mark
 * the dashboard's adapter rows carry, from the same operator settings.
 *
 * `catalog` is the on-disk catalogue (name, brand colour, domain) and `logo`
 * the resolved logo settings; both are read once per request and passed in,
 * so a page of fifty rows costs one settings read, not fifty. A slug the
 * catalogue does not know gets a monogram in the vertical's palette with the
 * slug's own initials, upper-cased, and no display name: the slug is all
 * anyone knows. The renderer gets an empty name for that case on purpose —
 * handed the slug as a name it would take the initials as written, and a
 * lowercase pair in a 20px tile is a smudge.
 */
function platformPresentation(
  c: { vertical: string; platform: string },
  catalog: Map<string, CatalogPlatformSummary>,
  logo: LogoConfig,
  size: 'xs' | 'sm',
): { platformName: string; logoHtml: string } {
  const entry = catalog.get(`${c.vertical}/${c.platform}`)
  return {
    platformName: entry?.name ?? c.platform,
    logoHtml: renderPlatformLogo(
      {
        slug: c.platform,
        name: entry?.name ?? '',
        vertical: c.vertical,
        primaryColor: entry?.primaryColor,
        domain: entry?.domain,
      },
      { logoSource: logo.logoSource, brandfetchClientId: logo.brandfetchClientId, size },
    ),
  }
}

/** Logos are decoration: unreadable settings mean monograms, never an error page. */
async function logoConfigFor(apiClient: AdminApiClient, token: string): Promise<LogoConfig> {
  const settings = await loadLogoSettings(apiClient, token).catch(() => null)
  return settings?.config ?? { logoSource: 'none' }
}

/**
 * Which columns of the connections table sort and filter, and on what.
 *
 * Built per-request (`connectionsTable(canAct, tenants)`), never
 * module-level: the trailing Actions column renders only for an admin or
 * operator (views/connections/index.ejs), and a fixed column list would put a
 * filter cell under a column a viewer does not have, misaligning every cell
 * in the row — exactly what /api-keys hit before its own fix. The view reads
 * `tableSpec.columns.some(c => c.key === 'actions')` rather than
 * re-deriving `canAct` on its own — see index.ejs — so the two can never
 * independently drift on which roles get the column.
 *
 * UNLIKE every other absorbed table in this app, the route below never calls
 * `applyTableQuery`: admin-api paginates connections at 50/page, so sorting
 * or filtering the one page already in hand would silently reorder or narrow
 * that page while the pagination control kept claiming to speak for the
 * whole set. `sort`, `dir` and every filter are FORWARDED to
 * `GET /api/connections` instead (via `FILTER_PARAM` below). That is also
 * why no column here carries a `get` accessor: only `applyTableQuery` ever
 * calls one, and this table never does.
 *
 * Tenant, Status and Vertical are ENUM selects; Label, Connection id and
 * Platform are text boxes. The split follows admin-api's own match
 * semantics, not merely what the cell displays: `f_vertical`, `f_status` and
 * `f_tenant` are EXACT matches server-side (apps/admin-api's
 * connections.ts), so an enum — which can only ever submit one of its own
 * option values — cannot diverge from what the server does with it. Tenant
 * and Status also render a presentation the raw field does not carry (a
 * tenant NAME this app resolves that admin-api never sees; a status computed
 * upstream from expiry plus the last refresh outcome), reinforcing the same
 * choice.
 *
 * Platform is deliberately a TEXT box, not an enum, even though the Platform
 * cell's own visible text is the bare slug (unlike Tenant/Status, nothing is
 * resolved or computed for it). `f_platform` is a case-insensitive SUBSTRING
 * server-side (apps/admin-api's connections.ts) — an enum would promise
 * exact selection while the server matches a fragment, which is exactly the
 * divergence an enum exists to prevent, not the split it survives: the
 * adapter tree has real prefix-overlapping slugs in one vertical
 * (`clear`/`clearbooks`, `dhl`/`dhl-freight`, `aramex`/`aramex-au`), so an
 * operator picking "clear" from a `<select>` would silently also pull in
 * `clearbooks` rows. A page-scoped option list compounds this: the earlier
 * design built Platform's options from the CURRENT (already filtered) page
 * of rows, which self-narrows — selecting `fortnox` collapses the dropdown
 * to {All, fortnox}, and an operator cannot pick a different platform in one
 * step — and silently drops any arriving value that isn't byte-equal to an
 * option (reachable today via in-app links: views/platforms/index.ejs,
 * views/platforms/detail.ejs and routes/dashboard.ts all emit
 * `/connections?...&platform=<slug>`), rendering the select as "All" while
 * the filter is still applied, so the next submit posts `f_platform=""` and
 * drops it. A text box has none of these failure modes: the value always
 * round-trips, and its substring semantics match the server's exactly.
 *
 * `search` is a HIDDEN column, not a `legacy` alias on Label. The old
 * `?search=` matched connection id OR label — admin-api's `search` param
 * still implements exactly that (apps/admin-api's connections.ts), so the
 * capability is intact server-side and only needs a faithful forward, not a
 * narrowing onto one column. Giving it its own synthetic column (the same
 * technique /webhooks uses for its label-or-url `search` alias) keeps
 * Label's own `f_label` box label-only per THE RULE, while `search` still
 * round-trips through a hidden input on every form submit
 * (_table-filters-form.ejs) and serialises via `tableQs`/`sortHref` like any
 * other filter — it is simply never rendered as a `<th>` of its own, and its
 * key is forwarded to admin-api's plain `search` param rather than an
 * `f_search` admin-api does not declare (see `FILTER_PARAM` below).
 */
function connectionsTable(canAct: boolean, tenants: TenantRecord[]): TableSpec {
  const columns: ColumnSpec[] = [
    { key: 'label', header: 'Label', sortable: true, filter: 'text' },
    { key: 'platform', header: 'Platform', sortable: true, filter: 'text', legacy: 'platform' },
    { key: 'id', header: 'Connection id', sortable: true, filter: 'text' },
    {
      key: 'vertical',
      header: 'Vertical',
      sortable: true,
      filter: {
        type: 'enum',
        options: KNOWN_VERTICALS.map((name) => ({ value: name, label: VERTICAL_LABELS[name] })),
      },
      legacy: 'vertical',
    },
    {
      key: 'tenant',
      header: 'Tenant',
      sortable: true,
      filter: {
        type: 'enum',
        options: tenants.map((t) => ({ value: t.id, label: `${t.name} (${t.id})` })),
      },
    },
    {
      key: 'status',
      header: 'Status',
      sortable: true,
      filter: {
        type: 'enum',
        options: [
          { value: 'valid', label: 'Healthy' },
          { value: 'expiring_soon', label: 'Expiring soon' },
          { value: 'expired', label: 'Expired' },
          { value: 'platform_error', label: 'Platform creds invalid' },
        ],
      },
      legacy: 'status',
    },
    { key: 'created', header: 'Created', sortable: true },
    // Hidden: no `<th>` of its own — see the doc comment above for why this
    // is a synthetic column rather than a `legacy` alias on Label.
    { key: 'search', header: '', filter: 'text', legacy: 'search', hidden: true },
  ]
  if (canAct) columns.push({ key: 'actions', header: '' })
  return { id: 'connections-filters', baseUrl: '/connections', columns }
}

/**
 * Every `connectionsTable` filter key, mapped to the exact admin-api query
 * param it is forwarded as — apps/admin-api's connections.ts `ListQuery` is
 * the only authority for the right-hand side. `search` is the one exception
 * to the otherwise-uniform `f_<key>` shape: admin-api never declares
 * `f_search`, only the plain `search` this hidden column forwards to.
 *
 * This is the allow-list that keeps a future filterable column from
 * silently doing nothing: without it, a new `ColumnSpec` with `filter` set
 * would forward as `f_<key>` regardless of whether admin-api's `ListQuery`
 * actually declares that key — and Fastify strips an unrecognised query
 * param rather than 400ing on it, so the operator would see a value in the
 * box and a param in the URL while the server silently ignored it. Adding a
 * column here means adding it here too, or it is dropped before the
 * request goes out — a visibly incomplete forward beats an invisibly
 * ineffective one.
 */
const FILTER_PARAM: Readonly<Record<string, string>> = {
  label: 'f_label',
  platform: 'f_platform',
  id: 'f_id',
  vertical: 'f_vertical',
  tenant: 'f_tenant',
  status: 'f_status',
  search: 'search',
}

export function createConnectionsRoutes(apiClient: AdminApiClient) {
  return async function connectionsRoutes(fastify: FastifyInstance): Promise<void> {
    fastify.addHook('preHandler', requireAuth)

    fastify.get<{ Querystring: Record<string, string | string[] | undefined> }>(
      '/connections',
      async (request, reply) => {
        const token = request.sessionUser!.token
        const canAct =
          request.sessionUser!.role === 'admin' || request.sessionUser!.role === 'operator'
        // A skeleton spec — no real Tenant options yet — is enough to parse
        // the query into sort/filter state: parseTableQuery only checks
        // whether a column HAS a filter, never what its OPTIONS are, so the
        // Tenant enum list (fetched below) doesn't need to exist yet. This
        // also means `tenants` and `listConnectionsPaged` can run in
        // parallel below rather than one gating the other.
        const tableState = parseTableQuery(request.query, connectionsTable(canAct, []))
        // Tenant names for the Tenant column. Non-fatal, as on every page that
        // shows one: an unreachable admin-api must not take the list down, and
        // the view falls back to the bare tenant id, which still identifies it.
        const [{ data: rows, meta }, tenants, logo] = await Promise.all([
          apiClient.listConnectionsPaged(token, {
            page: tableState.page,
            sort: tableState.sort ?? undefined,
            dir: tableState.sort ? tableState.dir : undefined,
            // FILTER_PARAM is the only authority on the key each filter
            // forwards as; an entry with no mapping (should never happen —
            // every ColumnSpec.filter above has one) is dropped rather than
            // sent as a guessed `f_<key>` admin-api might not declare.
            ...Object.fromEntries(
              Object.entries(tableState.filters).flatMap(([k, v]) =>
                FILTER_PARAM[k] ? [[FILTER_PARAM[k], v]] : [],
              ),
            ),
          }),
          apiClient.listTenants(token).catch(() => []),
          logoConfigFor(apiClient, token),
        ])
        // Only pay for the catalogue when there is a row to picture: on an
        // empty page this skips parsing a megabyte of JSON.
        const catalog = rows.length ? platformIndex() : new Map<string, CatalogPlatformSummary>()
        const connections = rows.map((c) => ({
          ...c,
          ...platformPresentation(c, catalog, logo, 'xs'),
        }))
        // The FINAL spec, now with real Tenant options — the one the view
        // renders.
        const tableSpec = connectionsTable(canAct, tenants)

        return reply.view('connections/index.ejs', {
          user: request.sessionUser,
          connections,
          tenants,
          tableSpec,
          tableState,
          meta,
        })
      },
    )

    fastify.get<{ Params: { vertical: string; id: string } }>(
      '/connections/:vertical/:id',
      async (request, reply) => {
        const token = request.sessionUser!.token
        const [connection, tenants, logo] = await Promise.all([
          apiClient.getConnection(token, request.params.vertical, request.params.id),
          // Same non-fatal fetch as the list: the page must render without it.
          apiClient.listTenants(token).catch(() => []),
          logoConfigFor(apiClient, token),
        ])
        const presentation = connection
          ? platformPresentation(connection, platformIndex(), logo, 'sm')
          : null

        return reply.view('connections/detail.ejs', {
          user: request.sessionUser,
          connection,
          ...presentation,
          tenants,
          // The schedule in words: summary, last/next sync, and the form's
          // choices — computed here so the view stays declarative.
          syncView: connection ? presentSync(connection) : null,
          vertical: request.params.vertical,
          // The tab title is the connection's LABEL — the only field that
          // tells two connections on the same platform apart. Passed from
          // here rather than written in the view because the title extractor
          // in core/server.ts reads the view's `layout(...)` call as SOURCE
          // TEXT and only matches a quoted literal; an explicit `title` on
          // the data object is the documented override for a dynamic one.
          // Falls back to the platform when the label has been cleared.
          title: connection?.label || connection?.platform || 'Connection detail',
        })
      },
    )

    /**
     * Rename a connection — the admin equivalent of `PATCH /v1/connections/{id}`,
     * which developers have had all along while the UI could only display the
     * label the Connect Link happened to set.
     *
     * The label is the only mutable field on a connection, and it is what the
     * list links and the search matches, so an unlabelled or mis-labelled row
     * is the one an operator cannot find again.
     *
     * An empty box clears it — the same `label: null` the developer API takes,
     * rather than a connection named with a space.
     */
    fastify.post<{ Params: { vertical: string; id: string }; Body: { label?: string } }>(
      '/connections/:vertical/:id/rename',
      { preHandler: [requireRole('operator')] },
      async (request, reply) => {
        const token = request.sessionUser!.token
        const { vertical, id } = request.params
        const label = request.body?.label?.trim() || null
        try {
          await apiClient.updateConnectionLabel(token, vertical, id, label)
          // The new name is not echoed into the flash: the toast body is a
          // cookie, and a label is unbounded caller input. The page being
          // redirected to shows the result anyway.
          flashSuccess(reply, label ? 'Connection renamed.' : 'Label cleared.')
        } catch (err) {
          // A duplicate label is a 409 the operator can act on by choosing
          // another name — an error page would lose the connection they were
          // looking at, so it is reported in place.
          flashError(reply, formatBackendError(err, 'Could not rename this connection.'))
        }
        return reply.redirect(`/connections/${vertical}/${id}`)
      },
    )

    /**
     * Set the connection's sync schedule — admin-api
     * `PUT /api/connections/:vertical/:id/sync-schedule`. Like the rename, a
     * refusal is reported in place: the operator fixes the interval and stays
     * on the connection.
     */
    fastify.post<{ Params: { vertical: string; id: string }; Body: SyncScheduleFormBody }>(
      '/connections/:vertical/:id/sync-schedule',
      { preHandler: [requireRole('operator')] },
      async (request, reply) => {
        const token = request.sessionUser!.token
        const { vertical, id } = request.params
        const parsed = parseSyncScheduleForm(request.body ?? {})
        if ('error' in parsed || parsed.schedule === null) {
          flashError(reply, 'error' in parsed ? parsed.error : 'Choose a sync schedule.')
          return reply.redirect(`/connections/${vertical}/${id}`)
        }
        try {
          await apiClient.setConnectionSyncSchedule(token, vertical, id, parsed.schedule)
          flashSuccess(reply, 'Sync schedule saved.')
        } catch (err) {
          flashError(reply, formatBackendError(err, 'Could not save the sync schedule.'))
        }
        return reply.redirect(`/connections/${vertical}/${id}`)
      },
    )

    /**
     * Revoke a connection — the admin equivalent of `DELETE /v1/connections/{id}`.
     *
     * Deleting the row cascades: integration-server's `store.onDelete` drops
     * the cached resources and the sync-job history with it. The customer has
     * to complete a new Connect Link to come back, which is why the button
     * confirms first.
     *
     * No try/catch, unlike the rename above. A destructive action that failed
     * must not answer with a redirect and a banner: it goes to the error page
     * carrying the upstream reason, so nobody reads a tidy redirect as proof
     * the credentials are gone when they are not.
     */
    fastify.post<{ Params: { vertical: string; id: string }; Body: { returnTo?: string } }>(
      '/connections/:vertical/:id/delete',
      { preHandler: [requireRole('operator')] },
      async (request, reply) => {
        const token = request.sessionUser!.token
        await apiClient.deleteConnection(token, request.params.vertical, request.params.id)
        flashSuccess(reply, 'Connection deleted.')
        // The dashboard's "Needs attention" panel offers Delete on an expired
        // connection; pressed there, the operator lands back on the panel.
        // Never a caller-supplied URL.
        return reply.redirect(request.body?.returnTo === 'dashboard' ? '/' : '/connections')
      },
    )

    /**
     * Enqueue a sync for one connection.
     *
     * `requireRole('operator')` on this route alone: the plugin hook is
     * `requireAuth` so any signed-in user can read these pages, but admin-api's
     * POST /api/sync-jobs is operator-gated. Without this a viewer would get an
     * opaque 403 from one layer down instead of simply never seeing the button.
     *
     * Redirects back to wherever it was pressed, carrying the outcome. A
     * refusal is not necessarily a fault: "a sync is already running" is the
     * common case, and the operator needs to be told that rather than shown a
     * generic error.
     */
    fastify.post<{ Params: { vertical: string; id: string }; Body: { returnTo?: string } }>(
      '/connections/:vertical/:id/sync',
      { preHandler: [requireRole('operator')] },
      async (request, reply) => {
        const token = request.sessionUser!.token
        const { vertical, id } = request.params
        // One of our own three pages — never a caller-supplied URL.
        const returnTo = request.body?.returnTo
        const back =
          returnTo === 'list'
            ? '/connections'
            : returnTo === 'dashboard'
              ? '/'
              : `/connections/${vertical}/${id}`
        try {
          await apiClient.createSyncJob(token, id)
          // The job id was only ever tested for truthiness — the banner text
          // was fixed. Losing the inline link to /sync-jobs is deliberate: a
          // toast body is plain text, and an href arriving from a cookie
          // payload is not worth the injection surface for a link the sidebar
          // already carries.
          flashSuccess(reply, 'Sync queued — see Sync jobs.')
          return reply.redirect(back)
        } catch (err) {
          flashError(reply, formatBackendError(err, 'Could not queue a sync for this connection.'))
          return reply.redirect(back)
        }
      },
    )
  }
}
