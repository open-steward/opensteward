/**
 * Admin UI for tenants and their custom domains (operator-wide).
 *
 *   GET   /tenants                     list tenants + domains
 *   POST  /tenants                     create a tenant
 *   POST  /tenants/:id/delete          delete a tenant (not 'default', no domains)
 *   POST  /tenant-domains              attach a domain to a tenant
 *   POST  /tenant-domains/delete       detach a domain
 *
 * Tenants are the first-class registry behind the `tenant_id` strings on
 * developer keys / customers / Connect Links. Attaching a custom domain lets an
 * incoming request on that host resolve to the tenant (integration-server reads
 * the public domain map). Branding stays deployment-global — this is
 * custom-domain-per-tenant, not white-label.
 */
import type { FastifyInstance } from 'fastify'
import { requireAuth, requireRole } from '../auth/middleware'
import { flashError, flashSuccess } from '../flash'
import type { AdminApiClient } from '../proxy/admin-api-client'
import { formatBackendError } from '../proxy/format-backend-error'
import { applyTableQuery, parseTableQuery, type TableSpec } from '../views/table-controls'

/**
 * Pull a human-readable message out of an axios-style proxy error: a string
 * `error`, or a structured `{ error: { code, message } }` such as a license
 * refusal (LICENSE_LIMIT_EXCEEDED).
 */
function apiError(err: unknown, fallback: string): string {
  return formatBackendError(err, fallback)
}

/**
 * Which columns of the tenants table sort and filter, and on what.
 *
 * Not rendered inside the setup wizard: _manage.ejs gates the filter row and
 * form off there, since a GET filter form submitting to /tenants would eject
 * the operator mid-flow.
 */
const TENANTS_TABLE: TableSpec = {
  id: 'tenants-filters',
  baseUrl: '/tenants',
  columns: [
    { key: 'tenant', header: 'Tenant', sortable: true, filter: 'text', get: (t: any) => t.name },
    { key: 'id', header: 'Id', sortable: true, filter: 'text', get: (t: any) => t.id },
    { key: 'domains', header: 'Custom domains', sortable: false },
    { key: 'actions', header: '' },
  ],
}

export function createTenantsRoutes(apiClient: AdminApiClient) {
  return async function tenantsRoutes(fastify: FastifyInstance): Promise<void> {
    // Read is open to any signed-in user; every write below carries its own
    // `requireRole('operator')`. This was a plugin-wide operator gate, which
    // blocked the GETs too — so a viewer saw the Connect section in the nav and
    // got `{"error":"Forbidden — insufficient role"}` from every link in it.
    //
    // The per-route form is deliberate: a new write route is NOT gated by
    // default, so anything added here has to say what it needs. The pages
    // themselves hide actions a viewer cannot take.
    fastify.addHook('preHandler', requireAuth)

    /**
     * Where to send the operator after a create/attach/delete.
     *
     * A token, never a path. The wizard renders the same partial as /tenants
     * and needs to come back to itself, but a redirect target taken from a form
     * body is an open redirect — so the body may only pick between two of our
     * own pages. Same shape as the returnTo in routes/connections.ts.
     */
    const backTo = (body: { returnTo?: string } | undefined): string =>
      body?.returnTo === 'wizard' ? '/setup/wizard/tenants' : '/tenants'

    fastify.get('/tenants', async (request, reply) => {
      const token = request.sessionUser!.token
      // Uncaught: `[]` renders as "no tenants", and an operator who believes
      // their tenants are gone starts recreating them — which is how you get
      // duplicate tenant ids on top of an outage.
      const [tenants, domains] = await Promise.all([
        apiClient.listTenants(token),
        apiClient.listTenantDomains(token),
      ])
      // Group domains under their tenant for the table.
      const domainsByTenant = new Map<string, string[]>()
      for (const d of domains) {
        const list = domainsByTenant.get(d.tenantId) ?? []
        list.push(d.domain)
        domainsByTenant.set(d.tenantId, list)
      }
      const merged = tenants.map((t) => ({ ...t, domains: domainsByTenant.get(t.id) ?? [] }))
      const tableState = parseTableQuery(request.query, TENANTS_TABLE)
      return reply.view('tenants/index.ejs', {
        user: request.sessionUser,
        // UNFILTERED — _manage.ejs's forms (the domain-attach tenant picker)
        // and its true-empty check both read this. Must-fix 1: passing the
        // FILTERED array under this name narrowed the domain-attach dropdown
        // to whatever the table filter matched, and made "No tenants yet."
        // claim the deployment had none whenever a filter matched nothing —
        // exactly the outcome the comment above this handler warns against.
        tenants: merged,
        // Filtered/sorted — only the table body (`rows` in _manage.ejs)
        // iterates this.
        rows: applyTableQuery(merged, tableState, TENANTS_TABLE),
        tableSpec: TENANTS_TABLE,
        tableState,
      })
    })

    fastify.post<{ Body: { id?: string; name?: string; returnTo?: string } }>(
      '/tenants',
      { preHandler: [requireRole('operator')] },
      async (request, reply) => {
        const token = request.sessionUser!.token
        const name = (request.body?.name ?? '').trim()
        const id = (request.body?.id ?? '').trim()
        if (!name) {
          flashError(reply, 'Tenant name is required.')
          return reply.redirect(backTo(request.body))
        }
        try {
          await apiClient.createTenant(token, id ? { id, name } : { name })
          flashSuccess(reply, 'Tenant created.')
          return reply.redirect(backTo(request.body))
        } catch (err) {
          flashError(reply, apiError(err, 'Failed to create tenant.'))
          return reply.redirect(backTo(request.body))
        }
      },
    )

    fastify.post<{ Params: { id: string }; Body: { returnTo?: string } }>(
      '/tenants/:id/delete',
      { preHandler: [requireRole('operator')] },
      async (request, reply) => {
        const token = request.sessionUser!.token
        try {
          await apiClient.deleteTenant(token, request.params.id)
          flashSuccess(reply, 'Tenant deleted.')
          return reply.redirect(backTo(request.body))
        } catch (err) {
          flashError(reply, apiError(err, 'Failed to delete tenant.'))
          return reply.redirect(backTo(request.body))
        }
      },
    )

    fastify.post<{ Body: { domain?: string; tenantId?: string; returnTo?: string } }>(
      '/tenant-domains',
      { preHandler: [requireRole('operator')] },
      async (request, reply) => {
        const token = request.sessionUser!.token
        const domain = (request.body?.domain ?? '').trim()
        const tenantId = (request.body?.tenantId ?? '').trim()
        if (!domain || !tenantId) {
          flashError(reply, 'Domain and tenant are required.')
          return reply.redirect(backTo(request.body))
        }
        try {
          await apiClient.addTenantDomain(token, domain, tenantId)
          flashSuccess(reply, 'Domain added.')
          return reply.redirect(backTo(request.body))
        } catch (err) {
          flashError(reply, apiError(err, 'Failed to add domain.'))
          return reply.redirect(backTo(request.body))
        }
      },
    )

    fastify.post<{ Body: { domain?: string; returnTo?: string } }>(
      '/tenant-domains/delete',
      { preHandler: [requireRole('operator')] },
      async (request, reply) => {
        const token = request.sessionUser!.token
        const domain = (request.body?.domain ?? '').trim()
        try {
          if (domain) await apiClient.removeTenantDomain(token, domain)
          flashSuccess(reply, 'Domain removed.')
          return reply.redirect(backTo(request.body))
        } catch (err) {
          flashError(reply, apiError(err, 'Failed to remove domain.'))
          return reply.redirect(backTo(request.body))
        }
      },
    )
  }
}
