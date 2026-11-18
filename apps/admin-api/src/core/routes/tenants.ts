/**
 * Tenant registry + custom-domain management.
 *
 * Tenants are the first-class entity behind the opaque `tenant_id` strings that
 * already scope developer keys, customers, connections and Connect Links. A
 * tenant can have one or more custom domains attached; integration-server reads
 * the public domain→tenant map (`GET /api/tenant-domains/public`) to resolve an
 * incoming Host header to a tenant.
 *
 * Branding stays deployment-global (see company-info) — this is
 * custom-domain-per-tenant only, not white-label. There is no per-tenant
 * login, but a console user can be restricted to some tenants
 * (`PUT /api/users/:id/scope`): such a user lists only its granted tenants and
 * domains, gets 404 for the rest, and cannot create new tenants.
 *
 * Routes:
 *   GET    /api/tenants                  — list (auth)
 *   POST   /api/tenants                  — create (operator; license limits.tenants)
 *   PUT    /api/tenants/:id              — rename (operator)
 *   DELETE /api/tenants/:id              — delete (operator; not 'default', no domains)
 *   GET    /api/tenant-domains           — list all domains (auth)
 *   POST   /api/tenant-domains           — attach a domain (operator)
 *   DELETE /api/tenant-domains/:domain   — detach a domain (operator)
 *   GET    /api/tenant-domains/public    — UNAUTH domain→tenant map for the resolver
 */
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import type { AdminStore } from '../db/admin-store'
import {
  Tenant,
  TenantDomain,
  TenantDomainMapEntry,
  dataEnvelope,
  errorBody,
  noContent,
} from './_openapi'
import { getAccess, isRestricted, tenantAllowed, SCOPE_RESTRICTED_ERROR } from '../auth/access'
import { tenantLimitRefusal } from '../license/tenant-limit'
import type { LicenseStatusProvider } from '../license/status-cache'

const TAG = 'tenants'

/** Normalise a free-text tenant id into a stable slug (lowercase, dashes). */
function slugify(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64)
}

/** RFC-1123 hostname (labels of letters/digits/hyphens, dot-separated). No
 *  scheme, port or path — just the host the request will arrive on. */
const HOSTNAME_RE = /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/

const IdParam = z.object({ id: z.string() })
const DomainParam = z.object({ domain: z.string() })

const CreateTenantBody = z.object({
  id: z.string().min(1).optional().meta({ description: 'Optional stable tenant id (slug); generated from the name if omitted.', example: 'acme' }),
  name: z.string().min(1).meta({ description: 'Human-friendly tenant name.', example: 'Acme Industries' }),
}).meta({ id: 'CreateTenantBody', description: 'Request body to register a new tenant.' })

const UpdateTenantBody = z.object({
  name: z.string().min(1).meta({ description: 'New human-friendly tenant name.', example: 'Acme Industries' }),
}).meta({ id: 'UpdateTenantBody', description: 'Request body to rename a tenant.' })

const AddDomainBody = z.object({
  domain: z.string().min(1).meta({ description: 'Custom domain to map (lower-cased, no scheme).', example: 'dept-a.acme.com' }),
  tenantId: z.string().min(1).meta({ description: 'Tenant the domain should resolve to.', example: 'acme' }),
}).meta({ id: 'AddTenantDomainBody', description: 'Request body to attach a custom domain to a tenant.' })

export function createTenantsRoutes(adminStore: AdminStore, licenseStatus: LicenseStatusProvider) {
  return async function tenantsRoutes(fastify: FastifyInstance): Promise<void> {
    // Unauthenticated domain→tenant map. Emits only (domain, tenantId) pairs —
    // no names, no secrets — so integration-server can resolve a Host header to
    // a tenant the same way it fetches public branding. Registered before the
    // auth hook so it stays open.
    fastify.get(
      '/api/tenant-domains/public',
      {
        schema: {
          tags: [TAG],
          summary: 'Public domain→tenant map (no auth)',
          operationId: 'tenant-domains.get-public',
          response: { 200: dataEnvelope(z.array(TenantDomainMapEntry)) },
          security: [],
        },
      },
      async () => {
        return { data: await adminStore.listDomainMap() }
      },
    )

    // Everything below requires an authenticated admin user.
    fastify.register(async (scoped) => {
      scoped.addHook('preHandler', scoped.authenticate)

      scoped.get(
        '/api/tenants',
        {
          schema: {
            tags: [TAG],
            summary: 'List tenants',
            operationId: 'tenants.list',
            response: { 200: dataEnvelope(z.array(Tenant)), 401: errorBody },
          },
        },
        async (request) => {
          const access = await getAccess(request)
          const tenants = await adminStore.listTenants()
          return { data: tenants.filter((t) => tenantAllowed(access, t.id)) }
        },
      )

      scoped.post<{ Body: { id?: string; name?: string } }>(
        '/api/tenants',
        {
          preHandler: [scoped.operatorOnly],
          schema: {
            tags: [TAG],
            summary: 'Create a tenant',
            description:
              "Register a tenant. Operator role. 403 `SCOPE_RESTRICTED` for a tenant-restricted caller; 403 `LICENSE_LIMIT_EXCEEDED` (with `limitKey: 'tenants'`, `limit` and `used`) when the license's tenant limit, which counts `default`, is reached; 409 when the id already exists. Existing tenants are never removed.",
            operationId: 'tenants.create',
            body: CreateTenantBody,
            response: {
              201: dataEnvelope(Tenant),
              400: errorBody,
              401: errorBody,
              403: errorBody,
              409: errorBody,
            },
          },
        },
        async (request, reply) => {
          // A new tenant is outside every existing grant by definition.
          if (isRestricted(await getAccess(request))) {
            return reply.status(403).send({ error: SCOPE_RESTRICTED_ERROR })
          }
          const name = (request.body?.name ?? '').trim()
          if (!name) return reply.status(400).send({ error: 'name is required' })
          const id = slugify(request.body?.id || name)
          if (!id) return reply.status(400).send({ error: 'Could not derive a tenant id from the name; provide an explicit id' })
          if (await adminStore.getTenant(id)) {
            return reply.status(409).send({ error: `Tenant '${id}' already exists` })
          }
          // License limit (limits.tenants, D-B): after the scope, body and duplicate
          // checks so those answer as themselves, before the insert.
          const refusal = await tenantLimitRefusal(licenseStatus, adminStore)
          if (refusal) return reply.status(403).send(refusal)
          const tenant = await adminStore.createTenant(id, name)
          await adminStore.writeAudit(request.jwtUser!.id, 'tenant.create', undefined, id, { name })
          return reply.status(201).send({ data: tenant })
        },
      )

      scoped.put<{ Params: { id: string }; Body: { name?: string } }>(
        '/api/tenants/:id',
        {
          preHandler: [scoped.operatorOnly],
          schema: {
            tags: [TAG],
            summary: 'Rename a tenant',
            operationId: 'tenants.update',
            params: IdParam,
            body: UpdateTenantBody,
            response: {
              200: dataEnvelope(Tenant),
              400: errorBody,
              401: errorBody,
              403: errorBody,
              404: errorBody,
            },
          },
        },
        async (request, reply) => {
          const name = (request.body?.name ?? '').trim()
          if (!name) return reply.status(400).send({ error: 'name is required' })
          if (!tenantAllowed(await getAccess(request), request.params.id)) {
            return reply.status(404).send({ error: 'Tenant not found' })
          }
          const updated = await adminStore.updateTenant(request.params.id, name)
          if (!updated) return reply.status(404).send({ error: 'Tenant not found' })
          await adminStore.writeAudit(request.jwtUser!.id, 'tenant.update', undefined, updated.id, { name })
          return { data: updated }
        },
      )

      scoped.delete<{ Params: { id: string } }>(
        '/api/tenants/:id',
        {
          preHandler: [scoped.operatorOnly],
          schema: {
            tags: [TAG],
            summary: 'Delete a tenant (not the default; must have no domains)',
            operationId: 'tenants.delete',
            params: IdParam,
            response: {
              204: noContent,
              401: errorBody,
              403: errorBody,
              404: errorBody,
              409: errorBody,
            },
          },
        },
        async (request, reply) => {
          if (!tenantAllowed(await getAccess(request), request.params.id)) {
            return reply.status(404).send({ error: 'Tenant not found' })
          }
          const result = await adminStore.deleteTenant(request.params.id)
          if (result.ok) {
            await adminStore.writeAudit(request.jwtUser!.id, 'tenant.delete', undefined, request.params.id, null)
            return reply.status(204).send()
          }
          if (result.reason === 'not_found') return reply.status(404).send({ error: 'Tenant not found' })
          if (result.reason === 'default') {
            return reply.status(409).send({ error: "The 'default' tenant cannot be deleted" })
          }
          return reply.status(409).send({ error: 'Detach this tenant’s domains before deleting it' })
        },
      )

      scoped.get(
        '/api/tenant-domains',
        {
          schema: {
            tags: [TAG],
            summary: 'List all custom domains',
            operationId: 'tenant-domains.list',
            response: { 200: dataEnvelope(z.array(TenantDomain)), 401: errorBody },
          },
        },
        async (request) => {
          const access = await getAccess(request)
          const domains = await adminStore.listDomains()
          return { data: domains.filter((d) => tenantAllowed(access, d.tenantId)) }
        },
      )

      scoped.post<{ Body: { domain?: string; tenantId?: string } }>(
        '/api/tenant-domains',
        {
          preHandler: [scoped.operatorOnly],
          schema: {
            tags: [TAG],
            summary: 'Attach a custom domain to a tenant',
            operationId: 'tenant-domains.create',
            body: AddDomainBody,
            response: {
              201: dataEnvelope(TenantDomain),
              400: errorBody,
              401: errorBody,
              403: errorBody,
              404: errorBody,
              409: errorBody,
            },
          },
        },
        async (request, reply) => {
          const domain = (request.body?.domain ?? '').trim().toLowerCase()
          const tenantId = (request.body?.tenantId ?? '').trim()
          if (!domain || !tenantId) {
            return reply.status(400).send({ error: 'domain and tenantId are required' })
          }
          if (!HOSTNAME_RE.test(domain)) {
            return reply.status(400).send({ error: 'domain must be a bare hostname like connect.acme.com (no scheme, port or path)' })
          }
          if (
            !(await adminStore.getTenant(tenantId)) ||
            !tenantAllowed(await getAccess(request), tenantId)
          ) {
            return reply.status(404).send({ error: `Unknown tenant: ${tenantId}` })
          }
          try {
            const row = await adminStore.addDomain(domain, tenantId)
            await adminStore.writeAudit(request.jwtUser!.id, 'tenant_domain.add', undefined, tenantId, { domain })
            return reply.status(201).send({ data: row })
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err)
            if (message.includes('UNIQUE') || message.includes('PRIMARY')) {
              return reply.status(409).send({ error: `Domain '${domain}' is already mapped to a tenant` })
            }
            return reply.status(400).send({ error: message })
          }
        },
      )

      scoped.delete<{ Params: { domain: string } }>(
        '/api/tenant-domains/:domain',
        {
          preHandler: [scoped.operatorOnly],
          schema: {
            tags: [TAG],
            summary: 'Detach a custom domain',
            operationId: 'tenant-domains.delete',
            params: DomainParam,
            response: { 204: noContent, 401: errorBody, 403: errorBody, 404: errorBody },
          },
        },
        async (request, reply) => {
          const domain = request.params.domain.trim().toLowerCase()
          const access = await getAccess(request)
          if (isRestricted(access)) {
            const mapped = (await adminStore.listDomains()).find((d) => d.domain === domain)
            if (!mapped || !tenantAllowed(access, mapped.tenantId)) {
              return reply.status(404).send({ error: 'Domain not found' })
            }
          }
          if (!(await adminStore.removeDomain(domain))) {
            return reply.status(404).send({ error: 'Domain not found' })
          }
          await adminStore.writeAudit(request.jwtUser!.id, 'tenant_domain.remove', undefined, undefined, { domain })
          return reply.status(204).send()
        },
      )
    })
  }
}
