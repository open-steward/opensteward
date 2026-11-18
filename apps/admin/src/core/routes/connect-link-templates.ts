/**
 * Admin UI for Connect Link templates.
 *
 *   GET   /connect-link-templates             list (operator+)
 *   GET   /connect-link-templates/new         create form
 *   POST  /connect-link-templates             create
 *   GET   /connect-link-templates/:id/edit    edit form
 *   POST  /connect-link-templates/:id         update
 *   POST  /connect-link-templates/:id/delete  delete
 *
 * Templates are tenant-scoped presets that prefill the new-Connect-Link
 * form. They reference a scope group by FK rather than embedding scopes,
 * so editing the underlying group keeps every link minted afterwards in
 * sync. They never bind to historical sessions — `connect_sessions` has
 * no `template_id` column.
 */
import type { FastifyInstance } from 'fastify'
import { requireAuth, requireRole } from '../auth/middleware'
import { flashSuccess } from '../flash'
import type {
  AdminApiClient,
  ConnectLinkTemplateAllowedPlatform,
  ConnectLinkTemplateMode,
} from '../proxy/admin-api-client'
import { loadEnabledCatalog } from '../proxy/enabled-catalog'
import { KNOWN_VERTICALS } from '../verticals'
import { applyTableQuery, parseTableQuery, type TableSpec } from '../views/table-controls'

/**
 * The Name column's display text — the template's name, plus whatever else
 * its cell renders alongside it (index.ejs:53-60): the description, when
 * set, and a vertical/platform sub-line for a pinned template. Must-fix 6,
 * THE RULE THAT MATTERS MOST: an accessor reading the bare `t.name` left the
 * description and the pinned-platform text — both visibly on screen, in this
 * cell — unfindable through the Name box. Owned as its own function (rather
 * than inlined in the column below) so the doc comment has somewhere to live.
 *
 * One deliberate divergence from the cell, and the only one: on the
 * single-VERTICAL branch the cell renders `vertical: payments` where this
 * returns `payments`. Matching the decorator word too would make one keyword
 * ("vertical") return every single-vertical template, which is not a filter
 * anybody wants; the vertical's own name, the part that identifies the row, is
 * matched either way. Recorded here rather than only in the test that opts
 * this column out of the cell-parity check
 * (`admin/tests/journeys/sort-key-cell-parity.test.ts`).
 */
function nameCellText(t: any): string {
  const platformText =
    t.allowedPlatforms.length === 1
      ? `${t.allowedPlatforms[0].vertical}/${t.allowedPlatforms[0].slug}`
      : t.allowedVerticals.length === 1
        ? t.allowedVerticals[0]
        : ''
  return [t.name, t.description, platformText].filter(Boolean).join(' ')
}

/**
 * Which columns of the Connect Link templates table sort and filter, and on
 * what. Every accessor here reads a raw field the cell renders unmodified —
 * verified against `views/connect-link-templates/index.ejs` — except Mode,
 * Scope, Expiry, Created and One-time, which are sort-only (no `filter`) and
 * so are exempt from the render-match rule; One-time's accessor still
 * reproduces the cell's own 'yes'/'no' expression rather than the raw
 * boolean, matching it exactly on principle. Name is the other exception — it
 * concatenates three parts of its cell and omits one decorator word; see
 * `nameCellText`'s own comment for which, and why.
 *
 * EXPORTED for `admin/tests/journeys/sort-key-cell-parity.test.ts`, which
 * declares what `nameCellText` must return for each fixture row and asserts
 * it. Name is the one accessor here that deliberately DIFFERS from its cell,
 * so the cell cannot serve as its own expected value; a declared one states
 * the divergence as an assertion rather than as prose in this file, and fails
 * if the divergence is ever "fixed".
 */
export const TEMPLATES_TABLE: TableSpec = {
  id: 'templates-filters',
  baseUrl: '/connect-link-templates',
  columns: [
    { key: 'tenant', header: 'Tenant', sortable: true, filter: 'text', get: (t: any) => t.tenantId },
    { key: 'name', header: 'Name', sortable: true, filter: 'text', get: nameCellText },
    { key: 'mode', header: 'Mode', sortable: true, filter: 'text', get: (t: any) => t.linkMode },
    { key: 'scope', header: 'Scope', sortable: true, get: (t: any) => t.scopeGroupId },
    { key: 'expiry', header: 'Expiry', sortable: true, get: (t: any) => t.expiryDays },
    { key: 'onetime', header: 'One-time', sortable: true, get: (t: any) => (t.oneTimeOnly ? 'yes' : 'no') },
    { key: 'created', header: 'Created', sortable: true, get: (t: any) => t.createdAt },
    { key: 'actions', header: '' },
  ],
}

const MODES: ReadonlyArray<ConnectLinkTemplateMode> = [
  'pinned',
  'customer-picks-adapter',
  'self-register',
]
const DEFAULT_TENANT = 'default'

interface FormBody {
  tenantId?: string
  name?: string
  description?: string
  linkMode?: string
  vertical?: string
  platform?: string
  scopeGroupId?: string
  expiryDays?: string
  oneTimeOnly?: string
  redirectUrl?: string
}

function isMode(v: unknown): v is ConnectLinkTemplateMode {
  return typeof v === 'string' && (MODES as readonly string[]).includes(v)
}

function buildPayload(body: FormBody):
  | {
      ok: true
      payload: {
        tenantId: string
        name: string
        description: string | null
        linkMode: ConnectLinkTemplateMode
        allowedVerticals: string[]
        allowedPlatforms: ConnectLinkTemplateAllowedPlatform[]
        scopeGroupId: number | null
        expiryDays: number
        oneTimeOnly: boolean
        redirectUrl: string | null
      }
    }
  | { ok: false; error: string } {
  const tenantId = (body.tenantId ?? '').trim() || DEFAULT_TENANT
  const name = (body.name ?? '').trim()
  if (!name) return { ok: false, error: 'Name is required.' }
  if (!isMode(body.linkMode)) return { ok: false, error: 'Pick a mode.' }
  const vertical = (body.vertical ?? '').trim()
  const platform = (body.platform ?? '').trim()
  const allowedVerticals = vertical ? [vertical] : []
  const allowedPlatforms = vertical && platform ? [{ vertical, slug: platform }] : []
  const expiryDays = Math.max(1, Math.min(90, Number(body.expiryDays ?? 7) || 7))
  const oneTimeOnly = body.oneTimeOnly === 'on' || body.oneTimeOnly === 'true'
  const scopeGroupId =
    body.scopeGroupId && body.scopeGroupId !== 'platform-default'
      ? Number.isFinite(parseInt(body.scopeGroupId, 10))
        ? parseInt(body.scopeGroupId, 10)
        : null
      : null
  return {
    ok: true,
    payload: {
      tenantId,
      name,
      description: (body.description ?? '').trim() || null,
      linkMode: body.linkMode,
      allowedVerticals,
      allowedPlatforms,
      scopeGroupId,
      expiryDays,
      oneTimeOnly,
      redirectUrl: (body.redirectUrl ?? '').trim() || null,
    },
  }
}

export function createConnectLinkTemplatesRoutes(apiClient: AdminApiClient) {
  return async function connectLinkTemplatesRoutes(fastify: FastifyInstance): Promise<void> {
    // Read is open to any signed-in user; every write below carries its own
    // `requireRole('operator')`. This was a plugin-wide operator gate, which
    // blocked the GETs too — so a viewer saw the Connect section in the nav and
    // got `{"error":"Forbidden — insufficient role"}` from every link in it.
    //
    // The per-route form is deliberate: a new write route is NOT gated by
    // default, so anything added here has to say what it needs. The pages
    // themselves hide actions a viewer cannot take.
    fastify.addHook('preHandler', requireAuth)

    fastify.get('/connect-link-templates', async (request, reply) => {
      const token = request.sessionUser!.token
      // Uncaught: `[]` is the page's "no templates yet" empty state, and an
      // operator who reads that during an outage creates a duplicate.
      const templates = await apiClient.listConnectLinkTemplates(token)
      const tableState = parseTableQuery(request.query, TEMPLATES_TABLE)
      return reply.view('connect-link-templates/index.ejs', {
        user: request.sessionUser,
        templates: applyTableQuery(templates, tableState, TEMPLATES_TABLE),
        tableSpec: TEMPLATES_TABLE,
        tableState,
      })
    })

    fastify.get(
      '/connect-link-templates/new',
      { preHandler: [requireRole('operator')] },
      async (request, reply) => {
        const token = request.sessionUser!.token
        const [{ providers, verticals }, scopeGroups, tenants] = await Promise.all([
          loadEnabledCatalog(apiClient, token),
          apiClient.listScopeGroups(token).catch(() => []),
          apiClient.listTenants(token).catch(() => []),
        ])
        return reply.view('connect-link-templates/edit.ejs', {
          user: request.sessionUser,
          mode: 'create',
          template: null,
          providers,
          scopeGroups,
          tenants,
          verticals,
          modes: MODES,
          knownVerticals: KNOWN_VERTICALS,
          noEnabledPlatforms: providers.length === 0,
          error: null,
        })
      },
    )

    fastify.post<{ Body: FormBody }>(
      '/connect-link-templates',
      { preHandler: [requireRole('operator')] },
      async (request, reply) => {
        const token = request.sessionUser!.token
        const built = buildPayload(request.body ?? {})
        if (!built.ok) {
          // `tenants` is fetched on the error paths too. Without it the view's
          // guard hid the tenant control entirely on exactly the renders an
          // operator is trying to correct something on.
          const [{ providers, verticals }, scopeGroups, tenants] = await Promise.all([
            loadEnabledCatalog(apiClient, token),
            apiClient.listScopeGroups(token).catch(() => []),
            apiClient.listTenants(token).catch(() => []),
          ])
          return reply.view('connect-link-templates/edit.ejs', {
            user: request.sessionUser,
            mode: 'create',
            // Echo the submitted tenant back. Re-rendering `template: null`
            // snapped the field to 'default', silently discarding the tenant
            // the operator had chosen — on the very screen telling them to fix
            // something else.
            template: { tenantId: (request.body as { tenantId?: string })?.tenantId?.trim() || 'default' },
            providers,
            scopeGroups,
            tenants,
            verticals,
            modes: MODES,
            knownVerticals: KNOWN_VERTICALS,
            noEnabledPlatforms: providers.length === 0,
            error: built.error,
          })
        }
        try {
          await apiClient.createConnectLinkTemplate(token, built.payload)
          flashSuccess(reply, 'Template created.')
          return reply.redirect('/connect-link-templates')
        } catch (err) {
          const message =
            err instanceof Error && err.message ? err.message : 'Failed to create template.'
          // `tenants` is fetched on the error paths too. Without it the view's
          // guard hid the tenant control entirely on exactly the renders an
          // operator is trying to correct something on.
          const [{ providers, verticals }, scopeGroups, tenants] = await Promise.all([
            loadEnabledCatalog(apiClient, token),
            apiClient.listScopeGroups(token).catch(() => []),
            apiClient.listTenants(token).catch(() => []),
          ])
          return reply.view('connect-link-templates/edit.ejs', {
            user: request.sessionUser,
            mode: 'create',
            // Echo the submitted tenant back. Re-rendering `template: null`
            // snapped the field to 'default', silently discarding the tenant
            // the operator had chosen — on the very screen telling them to fix
            // something else.
            template: { tenantId: (request.body as { tenantId?: string })?.tenantId?.trim() || 'default' },
            providers,
            scopeGroups,
            tenants,
            verticals,
            modes: MODES,
            knownVerticals: KNOWN_VERTICALS,
            noEnabledPlatforms: providers.length === 0,
            error: message,
          })
        }
      },
    )

    fastify.get<{ Params: { id: string } }>(
      '/connect-link-templates/:id/edit',
      async (request, reply) => {
        const token = request.sessionUser!.token
        const id = parseInt(request.params.id, 10)
        if (Number.isNaN(id)) return reply.status(400).send({ error: 'Invalid id' })
        const template = await apiClient.getConnectLinkTemplate(token, id)
        if (!template) return reply.status(404).send({ error: 'Template not found' })
        const [{ providers, verticals }, scopeGroups, tenants] = await Promise.all([
          loadEnabledCatalog(apiClient, token),
          apiClient.listScopeGroups(token).catch(() => []),
          apiClient.listTenants(token).catch(() => []),
        ])
        return reply.view('connect-link-templates/edit.ejs', {
          user: request.sessionUser,
          mode: 'edit',
          template,
          providers,
          scopeGroups,
          tenants,
          verticals,
          modes: MODES,
          knownVerticals: KNOWN_VERTICALS,
          noEnabledPlatforms: providers.length === 0,
          error: null,
        })
      },
    )

    fastify.post<{ Params: { id: string }; Body: FormBody }>(
      '/connect-link-templates/:id',
      { preHandler: [requireRole('operator')] },
      async (request, reply) => {
        const token = request.sessionUser!.token
        const id = parseInt(request.params.id, 10)
        if (Number.isNaN(id)) return reply.status(400).send({ error: 'Invalid id' })
        const built = buildPayload(request.body ?? {})
        if (!built.ok) {
          const template = await apiClient.getConnectLinkTemplate(token, id)
          // `tenants` is fetched on the error paths too. Without it the view's
          // guard hid the tenant control entirely on exactly the renders an
          // operator is trying to correct something on.
          const [{ providers, verticals }, scopeGroups, tenants] = await Promise.all([
            loadEnabledCatalog(apiClient, token),
            apiClient.listScopeGroups(token).catch(() => []),
            apiClient.listTenants(token).catch(() => []),
          ])
          return reply.view('connect-link-templates/edit.ejs', {
            user: request.sessionUser,
            mode: 'edit',
            // Same reason as the create path: keep what was submitted rather
            // than snapping back to the stored value.
            template: {
              ...template,
              tenantId:
                (request.body as { tenantId?: string })?.tenantId?.trim() ||
                template?.tenantId ||
                'default',
            },
            providers,
            scopeGroups,
            tenants,
            verticals,
            modes: MODES,
            knownVerticals: KNOWN_VERTICALS,
            noEnabledPlatforms: providers.length === 0,
            error: built.error,
          })
        }
        try {
          await apiClient.updateConnectLinkTemplate(token, id, built.payload)
          flashSuccess(reply, 'Template updated.')
          return reply.redirect('/connect-link-templates')
        } catch (err) {
          const message =
            err instanceof Error && err.message ? err.message : 'Failed to update template.'
          const template = await apiClient.getConnectLinkTemplate(token, id)
          // `tenants` is fetched on the error paths too. Without it the view's
          // guard hid the tenant control entirely on exactly the renders an
          // operator is trying to correct something on.
          const [{ providers, verticals }, scopeGroups, tenants] = await Promise.all([
            loadEnabledCatalog(apiClient, token),
            apiClient.listScopeGroups(token).catch(() => []),
            apiClient.listTenants(token).catch(() => []),
          ])
          return reply.view('connect-link-templates/edit.ejs', {
            user: request.sessionUser,
            mode: 'edit',
            // Same reason as the create path: keep what was submitted rather
            // than snapping back to the stored value.
            template: {
              ...template,
              tenantId:
                (request.body as { tenantId?: string })?.tenantId?.trim() ||
                template?.tenantId ||
                'default',
            },
            providers,
            scopeGroups,
            tenants,
            verticals,
            modes: MODES,
            knownVerticals: KNOWN_VERTICALS,
            noEnabledPlatforms: providers.length === 0,
            error: message,
          })
        }
      },
    )

    fastify.post<{ Params: { id: string } }>(
      '/connect-link-templates/:id/delete',
      { preHandler: [requireRole('operator')] },
      async (request, reply) => {
        const token = request.sessionUser!.token
        const id = parseInt(request.params.id, 10)
        if (Number.isNaN(id)) return reply.status(400).send({ error: 'Invalid id' })
        // Uncaught: a success flash reads "Template deleted." A swallow here
        // printed that sentence over a template that still exists.
        await apiClient.deleteConnectLinkTemplate(token, id)
        flashSuccess(reply, 'Template deleted.')
        return reply.redirect('/connect-link-templates')
      },
    )
  }
}
