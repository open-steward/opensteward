/**
 * Admin UI routes for end-user (customer) management.
 *
 *   GET   /customers                list (paginated, search by email/external)
 *   GET   /customers/search.json    JSON autocomplete used by the link-create form
 *   GET   /customers/new            blank create form
 *   POST  /customers                create
 *   GET   /customers/:id            detail (Identity + collapsed PII + activity)
 *   POST  /customers/:id            update — handles PII edits and the
 *                                   "Reveal" action (writes audit) via include_pii
 *   POST  /customers/:id/delete     hard delete + detach sessions
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { requireAuth, requireRole } from '../auth/middleware'
import { flashError } from '../flash'
import type { AdminApiClient, TenantRecord } from '../proxy/admin-api-client'
import { parseTableQuery, type ColumnSpec, type TableSpec } from '../views/table-controls'

interface UpsertBody {
  email?: string
  displayName?: string
  externalReference?: string
  firstName?: string
  lastName?: string
  personalIdNumber?: string
  phone?: string
  addressLine1?: string
  addressLine2?: string
  city?: string
  region?: string
  postalCode?: string
  country?: string
  tenantId?: string
}

const DEFAULT_TENANT = 'default'

/**
 * Which columns of the customers table sort and filter, and on what.
 *
 * Built per-request (`customersTable(tenants)`), never module-level: the
 * Tenant column's filter is an enum whose OPTIONS come from the live tenant
 * list. Unlike /connections' `connectionsTable(canAct, tenants)`, this
 * manifest does not also vary by role — the trailing Actions column always
 * exists here (every role gets at least the "Open" link; only the buttons
 * INSIDE the cell vary by role — see customers/index.ejs), so there is no
 * `canAct`-shaped column-count hazard to guard against.
 *
 * Six of the eight `end_users` columns are SQL-addressable and four appear
 * here: `email`, `displayName`, `externalReference`, `tenantId` (`created` is
 * the fifth, sort-only). `id` is never shown as its own column on this page
 * (unlike /connections' "Connection id") and `updatedAt` is not rendered at
 * all — neither is missing by oversight, they simply have no cell on this
 * page to filter or sort FROM. Nothing in `pii_data` — firstName, lastName,
 * phone, address, personalIdNumber — can appear here at all: it is
 * AES-256-GCM with a per-ciphertext random IV (packages/shared's
 * `auth/crypto.ts`), so there is no SQL operator that can order or match it.
 *
 * Tenant is hidden below two tenants (`showTenantFilter`), preserving the
 * pre-existing behaviour this replaces: most deployments never have a second
 * tenant and should not gain a control that can only ever say "All". The
 * COLUMN itself (header + sort link) still always renders — only the filter
 * <select> is conditional — because the Tenant name/id cell has always been
 * shown regardless of tenant count.
 *
 * `opts.tenantsUnavailable` (the caller's `listTenants` call FAILED, not
 * merely returned <=1 tenant) forces the filter on too, with an empty option
 * list. Conflating "fetch failed" with "there is only one tenant" — i.e.
 * computing `showTenantFilter` from `tenants.length` alone when a failed
 * fetch also leaves `tenants` at `[]` — would build the Tenant column with NO
 * `filter` at all, and `parseTableQuery` (table-controls.ts) skips a
 * `legacy` alias on any column without one. A bookmarked
 * `?tenantId=dept-a` on a genuinely multi-tenant deployment would then be
 * silently dropped: admin-api receives no tenant filter, returns every
 * tenant's customers, and — because the filter control itself is missing —
 * there is nothing on screen to show the scope widened. Keeping the column
 * filterable (rather than making it a hidden legacy-only column, the other
 * option) means the enum still renders as a `<select>` when this happens;
 * it just can't offer real options, since the fetch that would supply them
 * is the same one that failed. That is an honest degraded state — a
 * bookmarked filter keeps working with a `<select>` that can't show what
 * it's set to — not a silent scope change.
 *
 * `legacy: 'tenantId'` keeps a bookmarked `?tenantId=dept-a` link working:
 * that was this page's ONLY filter param before this feature, forwarded to
 * admin-api under the same bare name it has always used (`FILTER_PARAM`
 * below), so nothing downstream needs to change to keep reading it.
 *
 * `q` is a HIDDEN synthetic column, not a `legacy` alias folded onto Email —
 * see `EndUserFilter` in packages/shared's `auth/end-users.ts` for why: `q`
 * matches email, display name AND external reference at once (admin-api's
 * own `q` param, unchanged), so folding it onto Email would silently narrow
 * a documented parameter (`GET /v1/customers?q=`) to one field — the same
 * shape /connections' hidden `search` column preserves for id-or-label.
 * There is no visible free-text search box any more (the old page had one);
 * Email/Display name/External ref's own precise boxes now cover what it did
 * for a sighted operator, and a bookmarked `?q=` still narrows exactly as it
 * always did — same replacement /connections made for its old `?search=` box.
 */
function customersTable(
  tenants: TenantRecord[],
  opts?: { tenantsUnavailable?: boolean },
): TableSpec {
  const showTenantFilter = tenants.length > 1 || opts?.tenantsUnavailable === true
  const columns: ColumnSpec[] = [
    { key: 'email', header: 'Email', sortable: true, filter: 'text' },
    { key: 'displayName', header: 'Display name', sortable: true, filter: 'text' },
    { key: 'externalReference', header: 'External ref', sortable: true, filter: 'text' },
    {
      key: 'tenantId',
      header: 'Tenant',
      sortable: true,
      legacy: 'tenantId',
      ...(showTenantFilter
        ? {
            filter: {
              type: 'enum' as const,
              options: tenants.map((t) => ({ value: t.id, label: `${t.name} (${t.id})` })),
            },
          }
        : {}),
    },
    { key: 'created', header: 'Created', sortable: true },
    // Hidden: no `<th>` of its own — see the doc comment above for why this
    // is a synthetic column rather than a `legacy` alias on Email.
    { key: 'q', header: '', filter: 'text', legacy: 'q', hidden: true },
    // Unlike /connections' Actions column (empty header — see its own
    // doc comment), this page's Actions header has always shown the word
    // "Actions", right-aligned — kept verbatim rather than following
    // /connections' choice, since nothing about `_table-head.ejs` requires
    // an empty header and a pre-existing test pins the visible text.
    { key: 'actions', header: 'Actions', thAttrs: 'style="text-align: right"' },
  ]
  return { id: 'customers-filters', baseUrl: '/customers', columns }
}

/**
 * Every `customersTable` filter key, mapped to the exact admin-api query
 * param it is forwarded as — apps/admin-api's `routes/end-users.ts`
 * (`ListQuery`) is the only authority for the right-hand side. Every value
 * here happens to equal its key: admin-api's new per-column params
 * (`email`/`displayName`/`externalReference`) were named to match this
 * app's column keys exactly, and `tenantId`/`q` are the two params this page
 * already sent before this feature, kept bare rather than renamed to
 * `f_tenantId`/`f_q` (unlike /connections, which renamed `vertical` etc. to
 * `f_vertical` — there, the OLD names collided with admin-api params that
 * still needed to exist unprefixed for other callers; here, admin-api's
 * `tenantId`/`q` have no such other caller to preserve compatibility with).
 *
 * Kept as an explicit map anyway, not an identity passthrough: it is the
 * allow-list that keeps a future filterable column from silently doing
 * nothing — without it, a new `ColumnSpec` with `filter` set would forward
 * as its own key regardless of whether admin-api's `ListQuery` actually
 * declares that key, and Fastify strips an unrecognised query param rather
 * than 400ing on it. Same reasoning as /connections' `FILTER_PARAM`.
 */
const FILTER_PARAM: Readonly<Record<string, string>> = {
  email: 'email',
  displayName: 'displayName',
  externalReference: 'externalReference',
  tenantId: 'tenantId',
  q: 'q',
}

function piiFromBody(body: UpsertBody) {
  const address: Record<string, string> = {}
  if (body.addressLine1) address['line1'] = body.addressLine1
  if (body.addressLine2) address['line2'] = body.addressLine2
  if (body.city) address['city'] = body.city
  if (body.region) address['region'] = body.region
  if (body.postalCode) address['postalCode'] = body.postalCode
  if (body.country) address['country'] = body.country.toUpperCase()

  const pii: Record<string, unknown> = {}
  if (body.firstName) pii['firstName'] = body.firstName
  if (body.lastName) pii['lastName'] = body.lastName
  if (body.personalIdNumber) pii['personalIdNumber'] = body.personalIdNumber
  if (body.phone) pii['phone'] = body.phone
  if (Object.keys(address).length > 0) pii['address'] = address
  return Object.keys(pii).length > 0 ? pii : null
}

export function createCustomersRoutes(apiClient: AdminApiClient) {
  return async function customersRoutes(fastify: FastifyInstance): Promise<void> {
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
      '/customers',
      async (request, reply) => {
        const token = request.sessionUser!.token
        // UNLIKE /connections, this page cannot parse against a skeleton spec
        // built from an empty tenant list run in parallel with the page
        // fetch: connections' Tenant column is ALWAYS filterable regardless
        // of how many tenants exist, so a skeleton with no real options yet
        // still has a `filter` for parseTableQuery to find. This page hides
        // the Tenant filter entirely below two tenants (`showTenantFilter` in
        // customersTable), so a skeleton built from `[]` has NO filter on
        // that column at all — parseTableQuery skips a `legacy` alias on any
        // column without one, which silently dropped a bookmarked
        // `?tenantId=` on a genuinely multi-tenant deployment. Tenants are
        // fetched first, sequentially, to avoid that.
        //
        // The fetch's OWN failure is tracked separately from an empty/short
        // result (`tenantsUnavailable`, not just `tenants.length`): a
        // rejected `listTenants` still leaves `tenants` at `[]`, which is
        // indistinguishable from "this deployment genuinely has only one
        // tenant" unless the two are kept apart — see the doc comment on
        // `customersTable` for why collapsing them widens a bookmarked
        // `?tenantId=` filter's scope with nothing on screen to show it.
        let tenants: TenantRecord[] = []
        let tenantsUnavailable = false
        try {
          tenants = await apiClient.listTenants(token)
        } catch {
          tenantsUnavailable = true
        }
        const tableSpec = customersTable(tenants, { tenantsUnavailable })
        const tableState = parseTableQuery(request.query, tableSpec)
        const { data: customers, meta } = await apiClient.listEndUsersPaged(token, {
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
        })
        return reply.view('customers/index.ejs', {
          user: request.sessionUser,
          customers,
          tenants,
          tableSpec,
          tableState,
          meta,
        })
      },
    )

    // JSON autocomplete used by the connect-link form.
    fastify.get<{ Querystring: { q?: string } }>(
      '/customers/search.json',
      async (request, reply) => {
        const token = request.sessionUser!.token
        const customers = await apiClient.listEndUsers(token, { q: request.query.q, limit: 10 })
        return reply.send({ data: customers })
      },
    )

    fastify.get(
      '/customers/new',
      { preHandler: [requireRole('operator')] },
      async (request, reply) => {
        // A customer's tenant is chosen once, at creation: it decides which
        // Connect Links can name them and which tenant owns the connections
        // they authorize. Never fatal — an unreachable admin-api must not stop
        // an operator creating a customer.
        const tenants = await apiClient.listTenants(request.sessionUser!.token).catch(() => [])
        return reply.view('customers/edit.ejs', {
          user: request.sessionUser,
          customer: null,
          tenants,
          pii: null,
          revealed: false,
          error: null,
        })
      },
    )

    fastify.post<{ Body: UpsertBody }>(
      '/customers',
      { preHandler: [requireRole('operator')] },
      async (request, reply) => {
        const token = request.sessionUser!.token
        const body = request.body ?? ({} as UpsertBody)
        // Needed by both re-render paths below, not just the happy one — a
        // picker that vanishes on a validation error is the bug this shipped
        // with twice on the API-key step.
        const tenants = await apiClient.listTenants(token).catch(() => [])
        if (!body.email?.trim()) {
          return reply.view('customers/edit.ejs', {
            user: request.sessionUser,
            customer: null,
            tenants,
            pii: null,
            revealed: false,
            error: 'Email is required.',
          })
        }
        try {
          const created = await apiClient.createEndUser(token, {
            tenantId: body.tenantId?.trim() || DEFAULT_TENANT,
            email: body.email.trim().toLowerCase(),
            displayName: body.displayName?.trim() || undefined,
            externalReference: body.externalReference?.trim() || undefined,
            pii: piiFromBody(body),
          })
          return reply.redirect(`/customers/${created.id}`)
        } catch (err) {
          const error = extractError(err) ?? 'Failed to create customer.'
          return reply.view('customers/edit.ejs', {
            user: request.sessionUser,
            customer: null,
            tenants,
            pii: null,
            revealed: false,
            error,
          })
        }
      },
    )

    /**
     * Render the customer detail page.
     *
     * Shared by the GET and by the mint POST, which renders it directly rather
     * than redirecting: the minted value is a live credential, and a redirect
     * put it in `req.url` — which is not redacted from the request log, so it
     * reached stdout, browser history and the address bar. Same pattern as
     * api-keys.ts and webhooks.ts.
     */
    async function renderCustomerDetail(
      request: FastifyRequest<{ Params: { id: string }; Querystring?: { reveal?: string } }>,
      reply: FastifyReply,
      opts: { mintedPlaintext?: string | null } = {},
    ) {
      const token = request.sessionUser!.token
      const reveal = request.query?.reveal === 'true'
      const customer = await apiClient.getEndUser(token, request.params.id, { includePii: reveal })
      if (!customer) {
        // Reuses the LIST page's own template for this 404, so it needs the
        // same locals that page's table now requires (tableSpec/tableState/
        // meta) even though there is nothing to page or filter here — an
        // EJS reference to an undefined local throws (unlike a property read
        // on an object that IS passed as `undefined`), which would turn this
        // 404 into a 500 instead.
        const tableSpec = customersTable([])
        return reply.status(404).view('customers/index.ejs', {
          user: request.sessionUser,
          customers: [],
          tenants: [],
          tableSpec,
          tableState: parseTableQuery({}, tableSpec),
          meta: { page: 1, limit: 50, total: 0 },
          error: 'Customer not found.',
        })
      }
      // Always load the masked detail (sessions/connections come with it) when
      // not revealing — same response shape, just no decrypted PII.
      const masked = reveal
        ? null
        : await apiClient.getEndUser(token, request.params.id, { includePii: false })
      // Load this customer's MCP tokens for the agent-config section.
      //
      // Uncaught for an operator: `[]` renders as "this customer has no MCP
      // tokens", which is both the wrong fact and an unrevokable one — a live
      // token the page does not list is a token nobody can take away.
      //
      // Not asked for at all as a viewer. admin-api gates GET
      // /api/end-user-tokens behind `operatorOnly`, so a viewer's JWT gets a
      // 403 every time — and with the swallow gone that 403 would take the
      // whole customer page down for every viewer, on every load, outage or
      // not. `null` is the third state: not "none", not a broken page, but
      // "we did not look, and here is why".
      const mcpTokens =
        request.sessionUser!.role === 'viewer'
          ? null
          : await apiClient.listEndUserTokens(token, request.params.id)
      // The agent config snippet is meant to be pasted verbatim, so it needs
      // this deployment's real public URL rather than a placeholder host that
      // silently fails for the customer. `companyInfo.baseUrl` is the same
      // value integration-server's resolvePublicBaseUrl falls back to after
      // PUBLIC_BASE_URL, so it is the closest the admin can get to the URL the
      // MCP server will actually be pointed at.
      //
      // Only fetched when a token was just minted — that is the only time the
      // snippet renders, so the normal detail load keeps its request count.
      //
      // `null` when unset or unreachable, and the view renders that as a
      // visible "set this first" rather than inventing a plausible URL: a
      // snippet that looks right and points nowhere is worse than one that
      // says it is incomplete.
      //
      // Precedence mirrors integration-server's `resolvePublicBaseUrl`
      // (PUBLIC_BASE_URL env, then companyInfo.baseUrl) so the snippet names
      // the same host the MCP server will be pointed at. That function's last
      // resort — the inbound request host — is deliberately NOT used here: it
      // resolves to the admin's own origin (:3000), and the MCP server needs
      // integration-server (:3010). A confident wrong port is the worst of the
      // three outcomes.
      // Tenant names for the header line. Non-fatal on purpose, exactly as on
      // the list route: an unreachable admin-api must not take a customer's
      // page down, and the view falls back to the raw tenant id, which still
      // identifies the tenant.
      const tenants = await apiClient.listTenants(token).catch(() => [])

      const mcpBaseUrl = opts.mintedPlaintext
        ? process.env['PUBLIC_BASE_URL']?.trim() ||
          (await apiClient.getCompanyInfo(token).catch(() => null))?.baseUrl ||
          null
        : null
      return reply.view('customers/detail.ejs', {
        user: request.sessionUser,
        customer,
        pii: reveal ? (customer.pii ?? null) : null,
        revealedPiiAvailable: reveal,
        masked,
        mcpTokens,
        mintedPlaintext: opts.mintedPlaintext ?? null,
        mcpBaseUrl,
        tenants,
      })
    }

    fastify.get<{ Params: { id: string }; Querystring: { reveal?: string } }>(
      '/customers/:id',
      async (request, reply) => renderCustomerDetail(request, reply),
    )

    // Mint a new per-customer MCP token. Operator+ only (already gated by the
    // global auth on this router). Renders the detail page directly so the
    // plaintext is shown once as document content and never enters a URL.
    fastify.post<{ Params: { id: string }; Body: { label?: string } }>(
      '/customers/:id/mcp-tokens',
      { preHandler: [requireRole('operator')] },
      async (request, reply) => {
        const token = request.sessionUser!.token
        const customer = await apiClient.getEndUser(token, request.params.id)
        if (!customer) return reply.status(404).redirect('/customers')
        try {
          const minted = await apiClient.mintEndUserToken(token, {
            endUserId: customer.id,
            tenantId: customer.tenantId,
            label: request.body?.label?.trim() || null,
          })
          return renderCustomerDetail(request, reply, { mintedPlaintext: minted.plaintext })
        } catch (err) {
          const msg = extractError(err) ?? 'Failed to mint MCP token.'
          // Whole-page event, not a field-level validation problem — report
          // via flash.
          flashError(reply, msg)
          return reply.redirect(`/customers/${request.params.id}`)
        }
      },
    )

    fastify.post<{ Params: { id: string; tokenId: string } }>(
      '/customers/:id/mcp-tokens/:tokenId/revoke',
      { preHandler: [requireRole('operator')] },
      async (request, reply) => {
        const token = request.sessionUser!.token
        await apiClient.revokeEndUserToken(token, request.params.tokenId)
        return reply.redirect(`/customers/${request.params.id}`)
      },
    )

    fastify.post<{ Params: { id: string }; Body: UpsertBody }>(
      '/customers/:id',
      { preHandler: [requireRole('operator')] },
      async (request, reply) => {
        const token = request.sessionUser!.token
        const body = request.body ?? ({} as UpsertBody)
        try {
          await apiClient.updateEndUser(token, request.params.id, {
            displayName: body.displayName?.trim() || null,
            externalReference: body.externalReference?.trim() || null,
            pii: piiFromBody(body),
          })
        } catch (err) {
          const error = extractError(err) ?? 'Failed to save customer.'
          const customer = await apiClient.getEndUser(token, request.params.id)
          return reply.view('customers/detail.ejs', {
            user: request.sessionUser,
            customer,
            pii: null,
            revealedPiiAvailable: false,
            masked: customer,
            error,
          })
        }
        return reply.redirect(`/customers/${request.params.id}`)
      },
    )

    fastify.post<{ Params: { id: string } }>(
      '/customers/:id/delete',
      { preHandler: [requireRole('operator')] },
      async (request, reply) => {
        const token = request.sessionUser!.token
        await apiClient.deleteEndUser(token, request.params.id)
        return reply.redirect('/customers')
      },
    )
  }
}

function extractError(err: unknown): string | null {
  const data = (err as { response?: { data?: unknown } }).response?.data
  if (typeof data === 'string') return data
  if (data && typeof data === 'object') {
    const e = (data as { error?: { message?: string } | string }).error
    if (typeof e === 'string') return e
    if (e && typeof e === 'object' && typeof e.message === 'string') return e.message
  }
  return null
}
