/**
 * Internal read-only SQL access surface — `/admin/analytics/*`.
 *
 * Called by admin-api (deployment admin secret, `adminGuard`), which checks
 * `sql_access:manage` and passes the signed-in operator's data scope in the
 * `X-OpenSteward-Data-Scope` header, exactly as for `/admin/data/*`. This
 * router re-checks what the scope allows:
 *
 *   - a principal's tenant/vertical scope must lie within the caller's scope;
 *   - a PII principal (unmasked views) needs `revealPii` in the caller's scope;
 *   - provisioning is deployment-wide, so a scoped caller may not trigger it;
 *   - principals outside the caller's scope are invisible (404).
 *
 * Postgres only: on SQLite every route but `status` answers 409
 * POSTGRES_REQUIRED.
 */
import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify'
import { z } from 'zod'
import { adminGuard } from '@opensteward/shared'
import {
  DATA_SCOPE_HEADER,
  ScopeSchema as DataScopeSchema,
  type DataScope,
} from '../data-access/scope'
import { AnalyticsError, type AnalyticsService } from './provisioner'
import type { PrincipalRecord } from './principals-store'
import type { PrincipalScope } from './sql-generator'

const TENANT_ID = z.string().min(1).max(200)

const CreateSchema = z.object({
  label: z.string().trim().min(1).max(100),
  pii: z.boolean().optional().default(false),
  scope: z.object({
    tenants: z.union([z.literal('*'), z.array(TENANT_ID).min(1).max(500)]),
    verticals: z
      .union([
        z.literal('*'),
        z
          .array(z.string().regex(/^[a-z][a-z0-9-]*$/))
          .min(1)
          .max(20),
      ])
      .optional(),
  }),
  expiresAt: z.iso.datetime({ offset: true }).nullable().optional(),
  connectionLimit: z.number().int().min(1).max(100).optional().default(5),
  createdBy: z.string().max(200).nullable().optional(),
})

function scopeFrom(request: FastifyRequest, required: boolean): DataScope | null {
  const raw = request.headers[DATA_SCOPE_HEADER]
  if (typeof raw !== 'string') {
    if (required) {
      throw new AnalyticsError(
        400,
        'INVALID_SCOPE',
        `A data scope is required (${DATA_SCOPE_HEADER}).`,
      )
    }
    return null
  }
  let json: unknown
  try {
    json = JSON.parse(raw)
  } catch {
    throw new AnalyticsError(400, 'INVALID_SCOPE', 'The data scope is not valid JSON.')
  }
  const parsed = DataScopeSchema.safeParse(json)
  if (!parsed.success)
    throw new AnalyticsError(400, 'INVALID_SCOPE', 'The data scope is malformed.')
  return parsed.data
}

/** Why `principal` exceeds `caller`, or null when it lies within it. */
export function scopeExcess(caller: DataScope, principal: PrincipalScope): string | null {
  const pv =
    principal.verticals === undefined || principal.verticals === '*' ? null : principal.verticals
  if (caller.tenants !== '*') {
    if (principal.tenants === '*') return 'all tenants'
    const extra = principal.tenants.filter((t) => !(caller.tenants as string[]).includes(t))
    if (extra.length > 0) return `tenant(s) ${extra.join(', ')}`
    // Verticals granted within a tenant (IdP-group scoping) bound it too.
    for (const t of principal.tenants) {
      const granted = caller.tenantVerticals?.[t]
      if (granted === undefined || granted === '*') continue
      if (pv === null) return `all verticals of tenant ${t}`
      const over = pv.filter((v) => !granted.includes(v))
      if (over.length > 0) return `vertical(s) ${over.join(', ')} of tenant ${t}`
    }
  }
  if (caller.verticals) {
    if (pv === null) return 'all verticals'
    // SQL scope is per vertical; a caller limited to some resource types of a
    // vertical cannot grant the whole of it.
    const extra = pv.filter((v) => caller.verticals![v] !== '*')
    if (extra.length > 0) return `vertical(s) ${extra.join(', ')}`
  }
  return null
}

function canSee(caller: DataScope, p: PrincipalRecord): boolean {
  return scopeExcess(caller, p.scope) === null && (!p.pii || caller.revealPii === true)
}

function present(p: PrincipalRecord) {
  const now = Date.now()
  return {
    id: p.id,
    username: p.roleName,
    label: p.label,
    pii: p.pii,
    scope: p.scope,
    connectionLimit: p.connectionLimit,
    createdBy: p.createdBy,
    createdAt: new Date(p.createdAt).toISOString(),
    expiresAt: p.expiresAt === null ? null : new Date(p.expiresAt).toISOString(),
    revokedAt: p.revokedAt === null ? null : new Date(p.revokedAt).toISOString(),
    lastRotatedAt: p.lastRotatedAt === null ? null : new Date(p.lastRotatedAt).toISOString(),
    status:
      p.revokedAt !== null
        ? 'revoked'
        : p.expiresAt !== null && p.expiresAt <= now
          ? 'expired'
          : 'active',
    searchPath: p.pii ? 'os_analytics_pii' : 'os_analytics',
  }
}

export interface CreateAnalyticsRouterOptions {
  service: AnalyticsService
}

export function createAnalyticsRouter(opts: CreateAnalyticsRouterOptions): FastifyPluginAsync {
  const { service } = opts

  const postgresOnly = () => {
    if (service.backend !== 'postgres') {
      throw new AnalyticsError(
        409,
        'POSTGRES_REQUIRED',
        'Read-only SQL access needs the Postgres backend (set DATABASE_URL).',
      )
    }
  }

  const deploymentWide = (request: FastifyRequest) => {
    const scope = scopeFrom(request, false)
    if (scope && scope.tenants !== '*') {
      throw new AnalyticsError(403, 'SCOPE_TOO_NARROW', 'Provisioning needs an all-tenant scope.')
    }
  }

  async function scopedPrincipal(request: FastifyRequest<{ Params: { id: string } }>) {
    postgresOnly()
    const caller = scopeFrom(request, true)!
    const p = await service.getPrincipal(request.params.id)
    if (!p || !canSee(caller, p)) {
      throw new AnalyticsError(404, 'PRINCIPAL_NOT_FOUND', 'No such principal.')
    }
    return p
  }

  const connection = (username: string, pii: boolean) => ({
    host: service.readHost,
    username,
    searchPath: pii ? 'os_analytics_pii' : 'os_analytics',
  })

  return async (fastify) => {
    fastify.addHook('preHandler', async (request, reply) => {
      if (!adminGuard(request, reply)) return reply
    })

    fastify.setErrorHandler((err, _request, reply: FastifyReply) => {
      if (err instanceof AnalyticsError) {
        return reply.status(err.status).send({ error: { code: err.code, message: err.message } })
      }
      throw err
    })

    fastify.get('/admin/analytics/status', async (_request, reply) => {
      return reply.send({ data: await service.status() })
    })

    fastify.get('/admin/analytics/catalog', async (request, reply) => {
      postgresOnly()
      const scope = scopeFrom(request, false)
      const views = service.catalog.views.filter(
        (v) =>
          v.kind === 'system' || !scope?.verticals || Object.hasOwn(scope.verticals, v.vertical!),
      )
      return reply.send({
        data: {
          format: service.catalog.format,
          hash: service.catalog.hash,
          schemas: { masked: 'os_analytics', pii: 'os_analytics_pii' },
          views,
        },
      })
    })

    fastify.post('/admin/analytics/provision', async (request, reply) => {
      postgresOnly()
      deploymentWide(request)
      if (service.mode !== 'managed') {
        throw new AnalyticsError(
          409,
          'MANUAL_MODE',
          'ANALYTICS_ADMIN_DATABASE_URL is not set; run GET /admin/analytics/provision-script as an admin instead.',
        )
      }
      return reply.send({ data: await service.provision() })
    })

    fastify.get('/admin/analytics/provision-script', async (request, reply) => {
      postgresOnly()
      deploymentWide(request)
      const script = await service.provisionScript()
      return reply.type('text/plain; charset=utf-8').send(script)
    })

    fastify.get('/admin/analytics/principals', async (request, reply) => {
      postgresOnly()
      const caller = scopeFrom(request, true)!
      const all = await service.listPrincipals()
      return reply.send({ data: all.filter((p) => canSee(caller, p)).map(present) })
    })

    fastify.post('/admin/analytics/principals', async (request, reply) => {
      postgresOnly()
      const caller = scopeFrom(request, true)!
      const parsed = CreateSchema.safeParse(request.body ?? {})
      if (!parsed.success) {
        throw new AnalyticsError(
          400,
          'INVALID_BODY',
          parsed.error.issues.map((i) => `${i.path.join('.') || 'body'}: ${i.message}`).join('; '),
        )
      }
      const body = parsed.data
      const scope: PrincipalScope =
        body.scope.verticals === undefined
          ? { tenants: body.scope.tenants }
          : { tenants: body.scope.tenants, verticals: body.scope.verticals }
      if (body.pii && caller.revealPii !== true) {
        throw new AnalyticsError(
          403,
          'PII_NOT_ALLOWED',
          'An unmasked (PII) principal needs data:read_pii.',
        )
      }
      const excess = scopeExcess(caller, scope)
      if (excess) {
        throw new AnalyticsError(
          403,
          'SCOPE_EXCEEDS_CALLER',
          `The principal's scope exceeds yours: ${excess}.`,
        )
      }
      const expiresAt = body.expiresAt ? Date.parse(body.expiresAt) : null
      if (expiresAt !== null && expiresAt <= Date.now()) {
        throw new AnalyticsError(400, 'INVALID_BODY', 'expiresAt must be in the future.')
      }
      const r = await service.createPrincipal({
        label: body.label,
        pii: body.pii,
        scope,
        expiresAt,
        connectionLimit: body.connectionLimit,
        createdBy: body.createdBy ?? null,
      })
      return reply.status(201).send({
        data: {
          principal: present(r.principal),
          password: r.password,
          connection: connection(r.principal.roleName, r.principal.pii),
          mode: service.mode,
          ...(r.script ? { script: r.script } : {}),
        },
      })
    })

    fastify.post<{ Params: { id: string } }>(
      '/admin/analytics/principals/:id/rotate',
      async (request, reply) => {
        const p = await scopedPrincipal(request)
        const r = await service.rotatePrincipal(p)
        return reply.send({
          data: {
            principal: present(r.principal),
            password: r.password,
            connection: connection(r.principal.roleName, r.principal.pii),
            mode: service.mode,
            sessionsTerminated: r.sessionsTerminated ?? null,
            ...(r.script ? { script: r.script } : {}),
          },
        })
      },
    )

    fastify.delete<{ Params: { id: string } }>(
      '/admin/analytics/principals/:id',
      async (request, reply) => {
        const p = await scopedPrincipal(request)
        const r = await service.revokePrincipal(p)
        return reply.send({
          data: {
            principal: present(r.principal),
            mode: service.mode,
            sessionsTerminated: r.sessionsTerminated ?? null,
            ...(r.script ? { script: r.script } : {}),
          },
        })
      },
    )
  }
}
