/**
 * Admin UI for outbound webhook subscriptions.
 *
 *   GET   /webhooks              list, filterable by tenant and searchable by
 *                                label or URL (operator+)
 *   GET   /webhooks/new          create form (admin-only)
 *   POST  /webhooks              create — secret returned once (admin-only)
 *   GET   /webhooks/:id/settings delivery settings for one sub (admin-only)
 *   POST  /webhooks/:id/settings change label / format / custom headers
 *                                (admin-only)
 *   POST  /webhooks/:id/test     send one synthetic event (admin-only)
 *   POST  /webhooks/:id/delete   delete (admin-only)
 *
 * Mirrors /api-keys: secret is rendered into the list page exactly once
 * after a successful create. Refreshing the page re-renders the list
 * without it.
 */
import type { FastifyInstance } from 'fastify'
import { requireRole } from '../auth/middleware'
import type { AdminApiClient, TenantRecord } from '../proxy/admin-api-client'
import { parseHeaderLines } from '../views/parse-header-lines'
import {
  applyTableQuery,
  parseTableQuery,
  type ColumnSpec,
  type TableSpec,
} from '../views/table-controls'
import {
  readWebhookFormat,
  validateWebhookLabel,
  validateWebhookUrl,
} from '../views/webhook-subscription-input'

const DEFAULT_TENANT = 'default'

/**
 * The Delivery column's display text, keyed by `format`.
 *
 * Owned here, matching webhooks/index.ejs's own copy (kept there for its
 * other use — the New/Settings pages' format `<select>` also enumerates
 * these) — but the LIST row hoists `FORMAT_LABELS[format]` onto itself as
 * `formatLabel` below, and both the cell and the Delivery column's sort
 * accessor read that one hoisted field, never this map directly. Same
 * technique as /oauth-clients' `MODE_LABEL`/`authorityLabel` (commit
 * 5632ac3bb): a route that sorted on the raw `format` slug while the cell
 * displayed the mapped label put a table containing `teams` rows visibly out
 * of the alphabetical order its own header claimed — slug order is
 * flat/opensteward/slack/teams, label order is Flat JSON/Microsoft
 * Teams/OpenSteward envelope/Slack. Sort-only columns are exempt from THE
 * RULE for a SIMPLIFIED key, not one that produces a wrong-looking order for
 * what is actually on screen.
 */
const FORMAT_LABELS: Record<string, string> = {
  opensteward: 'OpenSteward envelope',
  slack: 'Slack',
  teams: 'Microsoft Teams',
  flat: 'Flat JSON',
}

/** Hoists `formatLabel` onto each row — see FORMAT_LABELS' doc comment. */
function withFormatLabel<T extends { format?: string }>(
  subs: T[],
): (T & { formatLabel: string })[] {
  return subs.map((s) => {
    const fmt = s.format || 'opensteward'
    return { ...s, formatLabel: FORMAT_LABELS[fmt] || fmt }
  })
}

/**
 * Which columns of the webhooks table sort and filter, and on what.
 *
 * Built per-request (`webhooksTable(tenants)`), not module-level: the Tenant
 * column's enum options come from the same tenant list the deleted
 * above-table form's `<select>` used — fix-round-1 finding, Important 3/4
 * below.
 *
 * The list iterates `subs` as `s`, not `w` — matched here so the accessors
 * read the same field names the view does.
 *
 * Label falls back to 'Unnamed' — the cell renders `s.label || 'Unnamed'`
 * (webhooks/index.ejs) — so the accessor reproduces that fallback per THE
 * RULE THAT MATTERS MOST: an accessor reading the bare field would exclude an
 * unlabelled row from a filter matching the word actually on screen.
 *
 * Tenant is an ENUM select, not text (fix-round-1, Important 3): the control
 * it replaces was a `<select>` of tenant id/name pairs, and the deployment
 * rule stated in the corrections file — "enum columns render a <select>
 * wherever an above-table select existed" — was applied to /scope-groups but
 * missed here. This also fixes Important 4: the store filters
 * `listWebhookSubs`'s upstream `tenantId` with an EXACT match, so a text box
 * accepting a substring (e.g. "northwind" for id "t-northwind") returned zero
 * rows upstream before the client-side filter ever ran. A select submits the
 * exact id, closing that gap the same motion.
 *
 * Delivery is sort-only, and sorts on `s.formatLabel` (fix-round-1 Important
 * 5, corrected fix-round-2): the cell in this column position renders the
 * delivery FORMAT badge (`FORMAT_LABELS[s.format]`), not a delivery status —
 * `s.lastStatus` was the wrong field entirely, not merely a simplified one,
 * which sort-only columns may not be per THE RULE. The fix-round-1 pass to
 * `s.format` was still wrong: the raw slug's order (flat, opensteward, slack,
 * teams) does not match the LABEL's alphabetical order the cell actually
 * shows (Flat JSON, Microsoft Teams, OpenSteward envelope, Slack), so sorting
 * on the slug put `teams` rows visibly out of order for the text on screen.
 * `s.formatLabel` is hoisted onto every row by `withFormatLabel()` below,
 * from the same `FORMAT_LABELS` map the cell reads — see that function's doc
 * comment.
 *
 * `search` is a HIDDEN column (fix-round-1, Important 6): the deleted form's
 * one search box matched label OR url, but Label's own accessor must stay
 * label-only per THE RULE (an operator typing what the Label cell shows must
 * not also pull in URL-only matches). Rather than reuse Label's `get` for the
 * legacy alias — which would make the explicit `f_label` box ALSO match on
 * URL content — the `search` legacy hangs off a synthetic column with its own
 * combined accessor. `hidden: true` keeps it out of the rendered table
 * (`_table-head.ejs`) while `parseTableQuery`/`applyTableQuery` still process
 * it like any other filterable column.
 */
function webhooksTable(tenants: TenantRecord[]): TableSpec {
  const columns: ColumnSpec[] = [
    {
      key: 'label',
      header: 'Label',
      sortable: true,
      filter: 'text',
      get: (s: any) => s.label || 'Unnamed',
    },
    {
      key: 'tenant',
      header: 'Tenant',
      sortable: true,
      filter: {
        type: 'enum',
        options: tenants.map((t) => ({ value: t.id, label: `${t.name} (${t.id})` })),
      },
      legacy: 'tenantId',
      get: (s: any) => s.tenantId,
    },
    // A bare `url` query param is on one-feedback-mechanism.test.ts's banned
    // list (a redirect or a read of that literal reads as an accidental
    // secret-in-the-URL leak); the `f_` prefix this table's filters use
    // sidesteps it, which is what makes this column expressible at all.
    { key: 'url', header: 'URL', sortable: true, filter: 'text', get: (s: any) => s.url },
    { key: 'events', header: 'Events', sortable: false },
    { key: 'delivery', header: 'Delivery', sortable: true, get: (s: any) => s.formatLabel },
    {
      key: 'lastDelivery',
      header: 'Last delivery',
      sortable: true,
      get: (s: any) => s.lastFiredAt,
    },
    { key: 'created', header: 'Created', sortable: true, get: (s: any) => s.createdAt },
    {
      key: 'search',
      header: '',
      sortable: false,
      filter: 'text',
      legacy: 'search',
      hidden: true,
      get: (s: any) => [s.label, s.url].filter(Boolean).join(' '),
    },
    { key: 'actions', header: '' },
  ]
  return { id: 'webhooks-filters', baseUrl: '/webhooks', columns }
}

/**
 * Which columns of the deliveries table sort and filter, and on what.
 *
 * Built per-request (`deliveriesTable(subscriptionId, isAdmin)`), never
 * module-level: the trailing Replay column is admin-only
 * (views/webhooks/deliveries.ejs), and a fixed column list would put a
 * filter cell under a column a non-admin does not have and misalign every
 * cell in the row — exactly the hazard `connectionsTable(canAct, tenants)`
 * and `customersTable(tenants)` already guard against. `baseUrl` also varies
 * per request: unlike every other table in this app, this page's URL is
 * scoped to one subscription (`/webhooks/:id/deliveries`).
 *
 * This route never calls `applyTableQuery`: admin-api paginates deliveries
 * at the SQL layer (`WebhookDeliveryStore.listForSubscription`), so sorting
 * or filtering the one page already in hand would silently reorder or
 * narrow that page while the pagination control kept claiming to speak for
 * the whole set. `sort`, `dir` and every filter are FORWARDED to
 * `GET /api/webhook-subscriptions/:id/deliveries` instead (via
 * `FILTER_PARAM` below) — same shape as /connections and /customers.
 *
 * Column-by-column, per THE RULE THAT MATTERS MOST (a filter/sort must match
 * what the cell renders, not merely the field behind it):
 *
 * - Event / Event id: the cell renders `d.eventType`/`d.eventId` verbatim
 *   (plain mono text), so both are ordinary text filters mapped straight to
 *   `event_type`/`event_id`.
 * - Status: the cell is a composite — `statusPill(d.status)` plus an
 *   optional "HTTP nnn" and `d.lastError` in a `title=` attribute
 *   (deliveries.ejs) — but the badge IS the enum value, so filtering/sorting
 *   on the raw `status` column matches the primary thing on screen; the
 *   HTTP code and the tooltip are decorations with no column or filter of
 *   their own. The enum's option VALUES are the raw `pending`/`delivered`/
 *   `dead` the store matches — `statusPill`'s LABELS (Pending/Delivered/
 *   Dead) are reused for the option text so the box reads the same word the
 *   badge does, without the mismatch a differently-worded label would
 *   introduce.
 * - Attempts: sort-only. `FilterKind` (table-controls.ts) only has `text`
 *   (substring) and `enum` (exact) — neither models "at least N attempts",
 *   and `attempts` only ever ranges 0–`MAX_ATTEMPTS` (8), too narrow a
 *   domain to invent a numeric filter kind for one column.
 * - Last attempt: NEITHER. The cell mixes a formatted `deliveredAt` date
 *   with an unrelated, truncated `lastError` string on a second line — one
 *   text box could not honestly match both without silently ignoring
 *   whichever half it didn't match on, which is exactly the divergence THE
 *   RULE forbids. Unlike the plain `created`-style columns elsewhere (sort
 *   -only, no filter), `deliveredAt` is also NULL for every row except a
 *   `delivered` one, and SQLite/Postgres disagree on where a NULL sorts —
 *   see `WebhookDeliveryStore`'s `WEBHOOK_DELIVERY_SORT_COLUMNS` doc comment for
 *   why that isn't
 *   worth solving for a column this composite.
 * - Next attempt: NEITHER. `nextAttemptAt` is a real, NOT NULL timestamp on
 *   every row, but the cell only renders it when `status === 'pending'`
 *   (a dash otherwise) — sorting or filtering the underlying value would
 *   produce an order/match that disagrees with what two-thirds of rows show
 *   on screen.
 */
function deliveriesTable(subscriptionId: string, isAdmin: boolean): TableSpec {
  const columns: ColumnSpec[] = [
    { key: 'eventType', header: 'Event', sortable: true, filter: 'text' },
    { key: 'eventId', header: 'Event id', sortable: true, filter: 'text' },
    {
      key: 'status',
      header: 'Status',
      sortable: true,
      // Preserves the pre-existing bookmarked `?status=dead` — this page's
      // only filter before this feature — under its old bare name.
      legacy: 'status',
      filter: {
        type: 'enum',
        options: [
          { value: 'pending', label: 'Pending' },
          { value: 'delivered', label: 'Delivered' },
          { value: 'dead', label: 'Dead' },
        ],
      },
    },
    { key: 'attempts', header: 'Attempts', sortable: true },
    { key: 'lastAttempt', header: 'Last attempt' },
    { key: 'nextAttempt', header: 'Next attempt' },
  ]
  if (isAdmin) columns.push({ key: 'actions', header: '' })
  return { id: 'deliveries-filters', baseUrl: `/webhooks/${subscriptionId}/deliveries`, columns }
}

/**
 * Every `deliveriesTable` filter key, mapped to the exact admin-api query
 * param it is forwarded as — admin-api's `routes/webhook-subs.ts`
 * (`DeliveriesQuery`) is the only authority for the right-hand side. Every
 * value here happens to equal its key, same as /customers' `FILTER_PARAM`.
 * Kept as an explicit map anyway, not an identity passthrough: it is the
 * allow-list that keeps a future filterable column from silently doing
 * nothing — without it, a new `ColumnSpec` with `filter` set would forward
 * as its own key regardless of whether admin-api's `DeliveriesQuery`
 * actually declares that key, and Fastify strips an unrecognised query
 * param rather than 400ing on it. Same reasoning as /connections' and
 * /customers' own `FILTER_PARAM`.
 */
const FILTER_PARAM: Readonly<Record<string, string>> = {
  status: 'status',
  eventType: 'eventType',
  eventId: 'eventId',
}

export function createWebhooksRoutes(apiClient: AdminApiClient) {
  return async function webhooksRoutes(fastify: FastifyInstance): Promise<void> {
    fastify.addHook('preHandler', requireRole('operator'))

    /**
     * The tenant list, for the filter control.
     *
     * Every render of the list view needs it, not just the first: a filter
     * that disappears after creating, rotating or saving silently degrades
     * the page. Never fatal — an unreachable admin-api must not take the page
     * with it.
     */
    const tenantsFor = (token: string) => apiClient.listTenants(token).catch(() => [])

    fastify.get('/webhooks', async (request, reply) => {
      const token = request.sessionUser!.token
      // Fetched first: the Tenant column's enum options are built from this
      // same list, so the table spec cannot exist before it does.
      const tenants = await tenantsFor(token)
      const table = webhooksTable(tenants)
      const tableState = parseTableQuery(request.query, table)
      // The one upstream filter this route already had — kept, so a
      // deployment with many subscriptions across many tenants does not
      // start fetching every tenant's rows on every request. Everything
      // else (label, url, search, sort) now runs client-side over what comes
      // back, same as every other absorbed table.
      const tenantId = tableState.filters.tenant || undefined
      const subs = await apiClient.listWebhookSubs(token, { tenantId })
      return reply.view('webhooks/index.ejs', {
        user: request.sessionUser,
        subs: applyTableQuery(withFormatLabel(subs), tableState, table),
        tenants,
        tableSpec: table,
        tableState,
        created: null,
        rotated: null,
        error: null,
      })
    })

    fastify.get('/webhooks/new', { preHandler: requireRole('admin') }, async (request, reply) => {
      return reply.view('webhooks/new.ejs', {
        user: request.sessionUser,
        // For the tenant picker. Non-fatal (see tenantsFor): the view falls
        // back to a typeable id when the list cannot be loaded.
        tenants: await tenantsFor(request.sessionUser!.token),
        defaults: {
          tenantId: DEFAULT_TENANT,
          label: '',
          url: '',
          eventMode: 'all',
          events: [],
          format: 'opensteward',
          headers: '',
        },
        error: null,
      })
    })

    fastify.post<{
      Body: {
        tenantId?: string
        label?: string
        url?: string
        eventMode?: string
        events?: string | string[]
        format?: string
        headers?: string
      }
    }>('/webhooks', { preHandler: requireRole('admin') }, async (request, reply) => {
      const token = request.sessionUser!.token
      const tenantId = (request.body?.tenantId ?? '').trim()
      const label = (request.body?.label ?? '').trim()
      const url = (request.body?.url ?? '').trim()
      const eventMode = request.body?.eventMode ?? 'all'
      const raw = request.body?.events
      const selected = Array.isArray(raw) ? raw : raw ? [raw] : []
      const events = eventMode === 'custom' && selected.length > 0 ? selected : undefined
      const rawFormat = request.body?.format
      const rawHeaders = request.body?.headers ?? ''

      // `tenants` on the error path too: a picker that vanishes on a
      // validation error costs the operator the choice the moment they
      // mistype the URL.
      const renderError = async (msg: string) =>
        reply.view('webhooks/new.ejs', {
          user: request.sessionUser,
          tenants: await tenantsFor(token),
          defaults: {
            tenantId,
            label,
            url,
            eventMode,
            events: selected,
            format: rawFormat ?? 'opensteward',
            headers: rawHeaders,
          },
          error: msg,
        })

      const format = readWebhookFormat(rawFormat)
      if (!format) return renderError('Pick a payload format.')
      const headers = parseHeaderLines(rawHeaders)
      if (!headers.ok) return renderError(headers.error)
      const labelError = validateWebhookLabel(label)
      if (labelError) return renderError(labelError)

      if (!tenantId) return renderError('Tenant id is required.')
      if (!url) return renderError('URL is required.')
      const urlError = validateWebhookUrl(url)
      if (urlError) return renderError(urlError)
      if (eventMode === 'custom' && selected.length === 0) {
        return renderError('Pick at least one event, or choose "All events".')
      }

      try {
        const created = await apiClient.createWebhookSub(token, {
          tenantId,
          label: label || null,
          url,
          events,
          format,
          headers: Object.keys(headers.value).length > 0 ? headers.value : undefined,
        })
        const subs = await apiClient.listWebhookSubs(token, { tenantId })
        const tenants = await tenantsFor(token)
        const table = webhooksTable(tenants)
        // No filters or sort applied after a mutation — the operator just
        // acted and the default order is the answer, same as the other
        // absorbed tables (see connect-links.ts's create handler).
        const tableState = parseTableQuery({}, table)
        return reply.view('webhooks/index.ejs', {
          user: request.sessionUser,
          subs: applyTableQuery(withFormatLabel(subs), tableState, table),
          tenants,
          tableSpec: table,
          tableState,
          created,
          rotated: null,
          error: null,
        })
      } catch (err) {
        const message =
          err instanceof Error && err.message
            ? err.message
            : 'Failed to create webhook subscription.'
        return renderError(message)
      }
    })

    fastify.post<{ Params: { id: string } }>(
      '/webhooks/:id/delete',
      { preHandler: requireRole('admin') },
      async (request, reply) => {
        const token = request.sessionUser!.token
        // Uncaught: the redirect back to the list is the same response a
        // successful delete produces, so a refusal was indistinguishable from
        // a page the operator had not reloaded yet.
        await apiClient.deleteWebhookSub(token, request.params.id)
        return reply.redirect('/webhooks')
      },
    )

    fastify.post<{ Params: { id: string }; Body: { paused?: string } }>(
      '/webhooks/:id/pause',
      { preHandler: requireRole('admin') },
      async (request, reply) => {
        const token = request.sessionUser!.token
        // Form posts "true"/"false"; default to pausing.
        const paused = request.body?.paused !== 'false'
        // Uncaught: a subscription the operator believes is paused and is not
        // keeps delivering to the endpoint they were trying to take pressure
        // off. Silence here is the worst possible answer.
        await apiClient.pauseWebhookSub(token, request.params.id, paused)
        return reply.redirect('/webhooks')
      },
    )

    /**
     * Delivery settings for one subscription, as a page of its own.
     *
     * `requireRole('admin')` matches the POST below rather than the plugin's
     * operator floor: an operator who can read /webhooks still cannot change
     * how it delivers, and a form that only fails on submit is worse than one
     * that was never offered.
     *
     * The row comes out of the list because there is no
     * GET /api/webhook-subscriptions/:id upstream. A subscription deleted
     * since the list was rendered is a 404 page, not an exception.
     */
    fastify.get<{ Params: { id: string } }>(
      '/webhooks/:id/settings',
      { preHandler: requireRole('admin') },
      async (request, reply) => {
        const token = request.sessionUser!.token
        const subs = await apiClient.listWebhookSubs(token)
        const sub = subs.find((s) => s.id === request.params.id)
        if (!sub) {
          return reply.status(404).view('webhooks/settings.ejs', {
            user: request.sessionUser,
            sub: null,
          })
        }
        return reply.view('webhooks/settings.ejs', { user: request.sessionUser, sub })
      },
    )

    // Change label and delivery settings. Unlike pause/delete above, this does
    // NOT swallow the upstream error: a rejected header carries the reason the
    // operator needs to fix what they just typed.
    fastify.post<{
      Params: { id: string }
      Body: { format?: string; headers?: string; label?: string }
    }>('/webhooks/:id/settings', { preHandler: requireRole('admin') }, async (request, reply) => {
      const token = request.sessionUser!.token
      const rawHeaders = request.body?.headers ?? ''
      const label = (request.body?.label ?? '').trim()

      // Success goes back to the list, where the saved state is visible.
      const renderList = async () => {
        const [subs, tenants] = await Promise.all([
          apiClient.listWebhookSubs(token),
          tenantsFor(token),
        ])
        const table = webhooksTable(tenants)
        const tableState = parseTableQuery({}, table)
        return reply.view('webhooks/index.ejs', {
          user: request.sessionUser,
          subs: applyTableQuery(withFormatLabel(subs), tableState, table),
          tenants,
          tableSpec: table,
          tableState,
          created: null,
          rotated: null,
          error: null,
          saved: true,
        })
      }

      // Failure stays on the settings page with the operator's own input
      // still in the form. Bouncing to the list would discard what they
      // typed and land them on a different page than the one they were
      // editing — the correction they need to make is right here.
      const renderError = async (error: string) => {
        const subs = await apiClient.listWebhookSubs(token)
        const sub = subs.find((s) => s.id === request.params.id) ?? null
        return reply.view('webhooks/settings.ejs', {
          user: request.sessionUser,
          sub,
          error,
          submitted: {
            format: request.body?.format ?? sub?.format ?? 'opensteward',
            headers: rawHeaders,
            label,
          },
        })
      }

      const format = readWebhookFormat(request.body?.format)
      if (!format) return renderError('Pick a payload format.')
      const headers = parseHeaderLines(rawHeaders)
      if (!headers.ok) return renderError(headers.error)
      const labelError = validateWebhookLabel(label)
      if (labelError) return renderError(labelError)

      try {
        await apiClient.updateWebhookSub(token, request.params.id, {
          format,
          // Wholesale replacement: an empty textarea clears the headers,
          // which is the only way to remove one.
          headers: headers.value,
          // Same rule for the label — an empty box clears it. The form
          // always posts the field, so `null` here means "the operator
          // emptied it", never "this request did not mention it".
          label: label || null,
        })
      } catch (err) {
        const message =
          err instanceof Error && err.message ? err.message : 'Failed to save delivery settings.'
        return renderError(message)
      }
      return renderList()
    })

    // Prove a destination works without creating real data to trigger a real
    // event. A rejection is a result, not an error, so it renders as a
    // message rather than an exception.
    fastify.post<{ Params: { id: string } }>(
      '/webhooks/:id/test',
      { preHandler: requireRole('admin') },
      async (request, reply) => {
        const token = request.sessionUser!.token
        let tested: string | null = null
        let failed: string | null = null
        try {
          const result = await apiClient.testWebhookSub(token, request.params.id)
          if (result.ok) {
            tested = `Test event delivered — the endpoint answered HTTP ${result.status}.`
          } else if (result.status !== null) {
            failed = `The endpoint rejected the test event with HTTP ${result.status}. Check that the payload format matches what it expects.`
          } else {
            failed = `The endpoint could not be reached: ${result.error ?? 'no response'}.`
          }
        } catch (err) {
          failed =
            err instanceof Error && err.message ? err.message : 'Failed to send the test event.'
        }
        const subs = await apiClient.listWebhookSubs(token)
        const tenants = await tenantsFor(token)
        const table = webhooksTable(tenants)
        const tableState = parseTableQuery({}, table)
        return reply.view('webhooks/index.ejs', {
          user: request.sessionUser,
          subs: applyTableQuery(withFormatLabel(subs), tableState, table),
          tenants,
          tableSpec: table,
          tableState,
          created: null,
          rotated: null,
          error: failed,
          tested,
        })
      },
    )

    fastify.post<{ Params: { id: string } }>(
      '/webhooks/:id/rotate-secret',
      { preHandler: requireRole('admin') },
      async (request, reply) => {
        const token = request.sessionUser!.token
        // Uncaught. This is the original: upstream answered 415 for weeks and
        // the page said "Failed to rotate secret." — a sentence that names no
        // cause, so nobody could tell a broken content-type from a bad id from
        // a dead admin-api. The error handler in server.ts renders the upstream
        // status, its message and the requestId, which is the whole difference
        // between "this is broken" and "this is broken *because*".
        const rotated = await apiClient.rotateWebhookSubSecret(token, request.params.id)
        const subs = await apiClient.listWebhookSubs(token)
        // The row, not just the id. Upstream only echoes `{ id, secret }`, and
        // a bare UUID beside a live signing secret told an operator with a
        // dozen subscriptions nothing about which endpoint they had just cut
        // off. The list is already loaded for the render below, so naming it
        // costs nothing. A row missing here means it was deleted between the
        // rotate and the list — the secret is still the answer to what they
        // asked, so it is still shown, identified by id alone.
        const row = subs.find((s) => s.id === request.params.id)
        const tenants = await tenantsFor(token)
        const table = webhooksTable(tenants)
        const tableState = parseTableQuery({}, table)
        return reply.view('webhooks/index.ejs', {
          user: request.sessionUser,
          subs: applyTableQuery(withFormatLabel(subs), tableState, table),
          tenants,
          tableSpec: table,
          tableState,
          created: null,
          rotated: {
            id: request.params.id,
            secret: rotated,
            label: row?.label ?? null,
            url: row?.url ?? null,
            tenantId: row?.tenantId ?? null,
          },
          error: null,
        })
      },
    )

    fastify.get<{
      Params: { id: string }
      Querystring: Record<string, string | string[] | undefined>
    }>('/webhooks/:id/deliveries', async (request, reply) => {
      const token = request.sessionUser!.token
      const isAdmin = request.sessionUser!.role === 'admin'
      const table = deliveriesTable(request.params.id, isAdmin)
      const tableState = parseTableQuery(request.query, table)
      const { data: deliveries, meta } = await apiClient.listWebhookDeliveriesPaged(
        token,
        request.params.id,
        {
          page: tableState.page,
          sort: tableState.sort ?? undefined,
          dir: tableState.sort ? tableState.dir : undefined,
          // FILTER_PARAM is the only authority on the key each filter
          // forwards as; an entry with no mapping (should never happen —
          // every ColumnSpec.filter above has one) is dropped rather than
          // sent as a guessed param admin-api might not declare.
          ...Object.fromEntries(
            Object.entries(tableState.filters).flatMap(([k, v]) =>
              FILTER_PARAM[k] ? [[FILTER_PARAM[k], v]] : [],
            ),
          ),
        },
      )
      return reply.view('webhooks/deliveries.ejs', {
        user: request.sessionUser,
        subscriptionId: request.params.id,
        deliveries,
        tableSpec: table,
        tableState,
        meta,
      })
    })

    fastify.post<{ Params: { id: string; deliveryId: string } }>(
      '/webhooks/:id/deliveries/:deliveryId/replay',
      { preHandler: requireRole('admin') },
      async (request, reply) => {
        const token = request.sessionUser!.token
        // Uncaught: the redirect reads as "replayed". A swallowed refusal left
        // the operator watching a dead delivery stay dead with no reason given.
        await apiClient.replayWebhookDelivery(token, request.params.id, request.params.deliveryId)
        return reply.redirect(`/webhooks/${request.params.id}/deliveries`)
      },
    )
  }
}
