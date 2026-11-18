/**
 * Read-only SQL access — Postgres logins (SQL principals) for BI tools onto
 * masked, scoped views of the stored records.
 *
 * Routes:
 *   GET    /api/sql-access/status                    sql_access:manage
 *   POST   /api/sql-access/provision                 sql_access:manage (audited)
 *   GET    /api/sql-access/provision-script          sql_access:manage (text/plain)
 *   GET    /api/sql-access/catalog                   data:read
 *   GET    /api/sql-access/principals                sql_access:manage
 *   POST   /api/sql-access/principals                sql_access:manage (+ data:read_pii for pii; audited)
 *   POST   /api/sql-access/principals/:id/rotate     sql_access:manage (audited)
 *   DELETE /api/sql-access/principals/:id            sql_access:manage (audited)
 *
 * Every route proxies to integration-server's `/admin/analytics/*` with the
 * caller's data scope (`X-OpenSteward-Data-Scope`). integration-server keeps
 * a principal's tenants and verticals inside the caller's (`403`
 * `SCOPE_EXCEEDS_CALLER`), hides principals outside them (`404`), lets only
 * an all-tenant caller provision (`403` `SCOPE_TOO_NARROW`), and allows an
 * unmasked (PII) principal only when the scope carries `revealPii` — which
 * admin-api sets only for a `data:read_pii` holder.
 *
 * A principal's password is generated upstream and appears exactly once, in
 * the create or rotate response, sent `Cache-Control: no-store`. It is never
 * logged, stored or audited here.
 *
 * Postgres only: on SQLite every route but `status` answers `409`
 * `POSTGRES_REQUIRED`, passed through unchanged like every other upstream
 * refusal.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { z } from 'zod'
import type { AdminStore } from '../db/admin-store'
import type { UnifiedClient } from '../proxy/client'
import { callerPermissions, requirePermission } from '../auth/access'
import { buildDataScope, passUpstreamError } from './data'
import { dataEnvelope, errorBody } from './_openapi'

const TAG = 'sql-access'
const PERMISSION = 'sql_access:manage' as const

// ── Schemas ───────────────────────────────────────────────────────────────

const SqlAccessStatus = z
  .object({
    backend: z.enum(['postgres', 'sqlite']).meta({
      description: 'Database backend. SQL access needs `postgres`.',
      example: 'postgres',
    }),
    mode: z.enum(['managed', 'manual']).meta({
      description:
        '`managed` when `ANALYTICS_ADMIN_DATABASE_URL` is set (OpenSteward creates roles and views itself); `manual` when an operator runs the provisioning script.',
      example: 'managed',
    }),
    provisioned: z.boolean().meta({ description: 'Views are deployed.', example: true }),
    version: z.number().nullable().meta({
      description: 'Deployed catalog version; null when not provisioned.',
      example: 1,
    }),
    hash: z.string().nullable().meta({
      description: 'Hash of the deployed catalog.',
      example: '9d2f…',
    }),
    catalogHash: z
      .string()
      .meta({ description: "Hash of this build's catalog.", example: '9d2f…' }),
    upToDate: z.boolean().meta({
      description: "The deployed views match this build's catalog.",
      example: true,
    }),
    readHost: z.string().nullable().meta({
      description: 'Host BI tools should connect to (`ANALYTICS_READ_HOST`), often a replica.',
      example: 'replica.internal',
    }),
    database: z.string().nullable().meta({
      description: 'Postgres database name.',
      example: 'opensteward',
    }),
    schemas: z
      .object({
        masked: z.string().meta({ description: 'Masked schema.', example: 'os_analytics' }),
        pii: z.string().meta({ description: 'Unmasked schema.', example: 'os_analytics_pii' }),
      })
      .meta({
        description: 'Stable schema names.',
        example: { masked: 'os_analytics', pii: 'os_analytics_pii' },
      }),
    pgcrypto: z.boolean().nullable().meta({
      description: 'Whether pgcrypto is installed (hmac masks need it).',
      example: true,
    }),
    warnings: z.array(z.string()).meta({
      description: 'Deployment problems worth fixing.',
      example: [],
    }),
  })
  .meta({ id: 'SqlAccessStatus', description: 'State of read-only SQL access on this deployment.' })

const ProvisionResult = z
  .object({
    changed: z.boolean().meta({ description: 'Whether anything was (re)created.', example: true }),
    version: z.number().meta({ description: 'Catalog version now deployed.', example: 1 }),
    hash: z.string().meta({ description: 'Deployed catalog hash.', example: '9d2f…' }),
    breaking: z.boolean().meta({
      description: 'A new version was cut because a view or column was removed or retyped.',
      example: false,
    }),
    changes: z.array(z.string()).meta({ description: 'What changed, one line each.', example: [] }),
    warnings: z.array(z.string()).meta({ description: 'Deployment warnings.', example: [] }),
  })
  .meta({ id: 'SqlAccessProvisionResult', description: 'Outcome of provisioning the SQL views.' })

const CatalogColumn = z
  .object({
    name: z.string().meta({ description: 'Column name.', example: 'email' }),
    source: z.string().meta({
      description: '`store` (row metadata), `field` (a record field) or `data` (the whole record).',
      example: 'field',
    }),
    field: z.string().optional().meta({ description: 'Record field read.', example: 'email' }),
    type: z.string().meta({ description: 'Type in the unmasked views.', example: 'text' }),
    maskedType: z.string().meta({ description: 'Type in the masked views.', example: 'text' }),
    class: z.string().meta({
      description: 'Classification: `public`, `internal`, `pii`, `financial` or `secret`.',
      example: 'pii',
    }),
    mask: z
      .string()
      .optional()
      .meta({ description: 'Mask in the masked views.', example: 'email' }),
  })
  .meta({ id: 'SqlAccessCatalogColumn', description: 'One column of a SQL view.' })

const CatalogView = z
  .object({
    name: z.string().meta({ description: 'View name.', example: 'crm_contacts' }),
    kind: z.string().meta({ description: '`resource` or `system`.', example: 'resource' }),
    vertical: z.string().optional().meta({ description: 'Vertical.', example: 'crm' }),
    resourceType: z
      .string()
      .optional()
      .meta({ description: 'Resource type.', example: 'contacts' }),
    columns: z.array(CatalogColumn).meta({ description: 'Columns in order.', example: [] }),
  })
  .meta({ id: 'SqlAccessCatalogView', description: 'One SQL view.' })

const Catalog = z
  .object({
    format: z.number().meta({ description: 'Catalog format.', example: 1 }),
    hash: z.string().meta({ description: 'Catalog hash.', example: '9d2f…' }),
    schemas: z
      .object({
        masked: z.string().meta({ description: 'Masked schema.', example: 'os_analytics' }),
        pii: z.string().meta({ description: 'Unmasked schema.', example: 'os_analytics_pii' }),
      })
      .meta({
        description: 'Stable schema names.',
        example: { masked: 'os_analytics', pii: 'os_analytics_pii' },
      }),
    views: z.array(CatalogView).meta({ description: 'Views in your scope.', example: [] }),
  })
  .meta({ id: 'SqlAccessCatalog', description: 'The SQL views and their columns.' })

const VerticalScope = z.union([z.literal('*'), z.array(z.string())])

const PrincipalScope = z
  .object({
    tenants: z.union([z.literal('*'), z.array(z.string())]).meta({
      description: 'Owner tenants the login sees, or `*` for every tenant.',
      example: ['acme'],
    }),
    verticals: VerticalScope.optional().meta({
      description: 'Verticals the login sees; omitted or `*` for all.',
      example: ['crm'],
    }),
  })
  .meta({ id: 'SqlPrincipalScope', description: 'What a SQL principal may read.' })

const Principal = z
  .object({
    id: z.string().meta({
      description: 'Principal id.',
      example: '3f9a1c2b-4d5e-4f60-8a7b-1c2d3e4f5a6b',
    }),
    username: z.string().meta({
      description: 'Postgres login name.',
      example: 'os_sql_metabase_prod_3f9a1c',
    }),
    label: z.string().meta({ description: 'Label.', example: 'Metabase prod' }),
    pii: z.boolean().meta({ description: 'Reads the unmasked schema.', example: false }),
    scope: PrincipalScope,
    connectionLimit: z.number().meta({ description: 'Concurrent sessions allowed.', example: 5 }),
    createdBy: z.string().nullable().meta({
      description: 'User id that created it.',
      example: 'b3c4d5e6-0000-4000-8000-000000000001',
    }),
    createdAt: z.string().meta({
      description: 'Created (ISO 8601).',
      example: '2026-09-29T12:00:00.000Z',
    }),
    expiresAt: z.string().nullable().meta({
      description: 'Login expiry (ISO 8601); null for never.',
      example: null,
    }),
    revokedAt: z.string().nullable().meta({
      description: 'When it was revoked (ISO 8601).',
      example: null,
    }),
    lastRotatedAt: z.string().nullable().meta({
      description: 'Last password rotation (ISO 8601).',
      example: null,
    }),
    status: z.string().meta({
      description: '`active`, `expired` or `revoked`.',
      example: 'active',
    }),
    searchPath: z.string().meta({
      description: 'Schema the login reads by default.',
      example: 'os_analytics',
    }),
  })
  .meta({ id: 'SqlPrincipal', description: 'A read-only SQL login. Never carries its password.' })

const ConnectionInfo = z
  .object({
    host: z.string().nullable().meta({
      description:
        'Advertised host (`ANALYTICS_READ_HOST`); null when unset — use the database host.',
      example: 'replica.internal',
    }),
    username: z
      .string()
      .meta({ description: 'Login name.', example: 'os_sql_metabase_prod_3f9a1c' }),
    searchPath: z.string().meta({ description: 'Default schema.', example: 'os_analytics' }),
  })
  .meta({ id: 'SqlPrincipalConnection', description: 'How to connect as a principal.' })

const PrincipalSecret = z
  .object({
    principal: Principal,
    password: z.string().meta({
      description: 'The password. Shown once, never stored — rotate if lost.',
      example: 'k3JqT9…',
    }),
    connection: ConnectionInfo,
    mode: z
      .enum(['managed', 'manual'])
      .meta({ description: 'Provisioning mode.', example: 'managed' }),
    sessionsTerminated: z.number().nullable().optional().meta({
      description: 'Open sessions ended (rotate only); null when unknown.',
      example: 0,
    }),
    script: z.string().optional().meta({
      description:
        'Manual mode: SQL an operator must run to apply the change. Holds only the SCRAM verifier, not the password.',
      example: 'BEGIN; … COMMIT;',
    }),
  })
  .meta({
    id: 'SqlPrincipalWithPassword',
    description: 'A principal with its one-time password.',
  })

const RevokeResult = z
  .object({
    principal: Principal,
    mode: z
      .enum(['managed', 'manual'])
      .meta({ description: 'Provisioning mode.', example: 'managed' }),
    sessionsTerminated: z.number().nullable().meta({
      description: 'Open sessions ended; null when unknown.',
      example: 0,
    }),
    script: z.string().optional().meta({
      description: 'Manual mode: SQL an operator must run to apply the revoke.',
      example: 'BEGIN; … COMMIT;',
    }),
  })
  .meta({ id: 'SqlPrincipalRevokeResult', description: 'Outcome of revoking a principal.' })

const CreateBody = z
  .object({
    label: z.string().trim().min(1).max(100).meta({
      description: 'A name for the login; becomes part of the username.',
      example: 'Metabase prod',
    }),
    pii: z.boolean().optional().meta({
      description: 'Read the unmasked schema. Needs `data:read_pii`.',
      example: false,
    }),
    scope: z
      .object({
        tenants: z
          .union([z.literal('*'), z.array(z.string().min(1).max(200)).min(1).max(500)])
          .meta({
            description: 'Owner tenants, or `*` for every tenant. Must lie inside your scope.',
            example: ['acme'],
          }),
        verticals: z
          .union([
            z.literal('*'),
            z
              .array(z.string().regex(/^[a-z][a-z0-9-]*$/))
              .min(1)
              .max(20),
          ])
          .optional()
          .meta({ description: 'Verticals; omit for all.', example: ['crm'] }),
      })
      .meta({ id: 'CreateSqlPrincipalScope', description: 'What the new login may read.' }),
    expiresAt: z.iso.datetime({ offset: true }).nullable().optional().meta({
      description: 'When the login stops working (ISO 8601); omit for never.',
      example: '2027-01-01T00:00:00Z',
    }),
    connectionLimit: z.number().int().min(1).max(100).optional().meta({
      description: 'Concurrent sessions allowed (default 5).',
      example: 5,
    }),
  })
  .meta({ id: 'CreateSqlPrincipalBody', description: 'Request body to create a SQL principal.' })

const IdParams = z.object({ id: z.string() })

// ── Helpers ───────────────────────────────────────────────────────────────

type Row = Record<string, unknown>

const str = (v: unknown): string => (typeof v === 'string' ? v : '')

/** A one-time secret: never cached by a browser or proxy on the way back. */
function noStore(reply: FastifyReply) {
  reply.header('cache-control', 'no-store')
  reply.header('pragma', 'no-cache')
}

function principalOf(result: Row): Row {
  const p = result['principal']
  return p && typeof p === 'object' ? (p as Row) : {}
}

function sessionsOf(result: Row): number | null {
  const n = result['sessionsTerminated']
  return typeof n === 'number' ? n : null
}

export function createSqlAccessRoutes(unifiedClient: UnifiedClient, adminStore: AdminStore) {
  // SQL masking does not follow `data_access.mask_financial` (see
  // docs/integrate/sql-access.md), so the scope carries tenants and, for a
  // `data:read_pii` holder, `revealPii` — nothing else.
  const scopeFor = (request: FastifyRequest) =>
    buildDataScope(request, { revealPii: true, maskFinancial: false })

  return async function sqlAccessRoutes(fastify: FastifyInstance): Promise<void> {
    fastify.addHook('preHandler', fastify.authenticate)

    const guard = { preHandler: [requirePermission(PERMISSION)] }

    fastify.get(
      '/api/sql-access/status',
      {
        ...guard,
        schema: {
          tags: [TAG],
          summary: 'Read-only SQL access status',
          description:
            'Backend, provisioning mode, deployed catalog version, advertised read host and warnings. Answers on SQLite too (`backend: sqlite`), where SQL access is unavailable. Requires `sql_access:manage`.',
          operationId: 'sqlAccess.status',
          response: { 200: dataEnvelope(SqlAccessStatus), 401: errorBody, 403: errorBody },
        },
      },
      async (_request, reply) => {
        try {
          return { data: await unifiedClient.getAnalyticsStatus() }
        } catch (err) {
          return passUpstreamError(reply, err)
        }
      },
    )

    fastify.post(
      '/api/sql-access/provision',
      {
        ...guard,
        schema: {
          tags: [TAG],
          summary: 'Provision the SQL views',
          description:
            'Create or update the roles, schemas and views now (managed mode only; `409` `MANUAL_MODE` otherwise — use the provisioning script). Deployment-wide, so it needs an all-tenant scope (`403` `SCOPE_TOO_NARROW`). `409` `POSTGRES_REQUIRED` on SQLite. Requires `sql_access:manage`; audited as `sql_access.provision`.',
          operationId: 'sqlAccess.provision',
          response: {
            200: dataEnvelope(ProvisionResult),
            401: errorBody,
            403: errorBody,
            409: errorBody,
          },
        },
      },
      async (request, reply) => {
        let result: Row
        try {
          result = await unifiedClient.provisionAnalytics(await scopeFor(request))
        } catch (err) {
          return passUpstreamError(reply, err)
        }
        await adminStore.writeAudit({
          userId: request.jwtUser!.id,
          action: 'sql_access.provision',
          detail: {
            changed: result['changed'] === true,
            version: typeof result['version'] === 'number' ? result['version'] : null,
            breaking: result['breaking'] === true,
          },
        })
        return { data: result }
      },
    )

    fastify.get(
      '/api/sql-access/provision-script',
      {
        ...guard,
        schema: {
          tags: [TAG],
          summary: 'Download the provisioning script',
          description:
            'The provisioning SQL as `text/plain` (one `BEGIN … COMMIT` transaction), for manual mode: run it as a role with CREATEROLE. Needs an all-tenant scope. `409` `POSTGRES_REQUIRED` on SQLite. Requires `sql_access:manage`.',
          operationId: 'sqlAccess.provisionScript',
          response: { 401: errorBody, 403: errorBody, 409: errorBody },
        },
      },
      async (request, reply) => {
        let script: string
        try {
          script = await unifiedClient.getAnalyticsProvisionScript(await scopeFor(request))
        } catch (err) {
          return passUpstreamError(reply, err)
        }
        reply.header('cache-control', 'no-store')
        return reply.type('text/plain; charset=utf-8').send(script)
      },
    )

    fastify.get(
      '/api/sql-access/catalog',
      {
        preHandler: [requirePermission('data:read')],
        schema: {
          tags: [TAG],
          summary: 'List the SQL views and columns',
          description:
            'Every view a SQL login can read, with each column’s type in the masked and unmasked schemas and its classification. Requires `data:read`. `409` `POSTGRES_REQUIRED` on SQLite.',
          operationId: 'sqlAccess.catalog',
          response: { 200: dataEnvelope(Catalog), 401: errorBody, 403: errorBody, 409: errorBody },
        },
      },
      async (request, reply) => {
        try {
          return { data: await unifiedClient.getAnalyticsCatalog(await scopeFor(request)) }
        } catch (err) {
          return passUpstreamError(reply, err)
        }
      },
    )

    fastify.get(
      '/api/sql-access/principals',
      {
        ...guard,
        schema: {
          tags: [TAG],
          summary: 'List SQL principals',
          description:
            'SQL logins inside your scope (unmasked ones only for `data:read_pii` holders), including revoked and expired ones. Requires `sql_access:manage`. `409` `POSTGRES_REQUIRED` on SQLite.',
          operationId: 'sqlAccess.principals.list',
          response: {
            200: z.object({ data: z.array(Principal) }),
            401: errorBody,
            403: errorBody,
            409: errorBody,
          },
        },
      },
      async (request, reply) => {
        try {
          return { data: await unifiedClient.listAnalyticsPrincipals(await scopeFor(request)) }
        } catch (err) {
          return passUpstreamError(reply, err)
        }
      },
    )

    fastify.post<{ Body: z.infer<typeof CreateBody> }>(
      '/api/sql-access/principals',
      {
        ...guard,
        schema: {
          tags: [TAG],
          summary: 'Create a SQL principal',
          description:
            'Create a read-only Postgres login. The response carries its password ONCE (`Cache-Control: no-store`); it is never stored or logged — rotate it if lost. The scope must lie inside yours (`403` `SCOPE_EXCEEDS_CALLER`); `pii: true` needs `data:read_pii` (`403` `PII_NOT_ALLOWED`). `409` `NOT_PROVISIONED` before the views exist, `409` `POSTGRES_REQUIRED` on SQLite. Requires `sql_access:manage`; audited as `sql_access.principal_create` (without the password).',
          operationId: 'sqlAccess.principals.create',
          body: CreateBody,
          response: {
            201: dataEnvelope(PrincipalSecret),
            400: errorBody,
            401: errorBody,
            403: errorBody,
            409: errorBody,
          },
        },
      },
      async (request, reply) => {
        const body = request.body
        if (body.pii === true && !(await callerPermissions(request)).has('data:read_pii')) {
          return reply.status(403).send({
            error: {
              code: 'PII_NOT_ALLOWED',
              message: 'An unmasked (PII) principal needs data:read_pii.',
            },
          })
        }
        let result: Row
        try {
          result = await unifiedClient.createAnalyticsPrincipal(await scopeFor(request), {
            ...body,
            createdBy: request.jwtUser!.id,
          })
        } catch (err) {
          return passUpstreamError(reply, err)
        }
        const p = principalOf(result)
        const scope = (p['scope'] ?? body.scope) as {
          tenants: '*' | string[]
          verticals?: '*' | string[]
        }
        await adminStore.writeAudit({
          userId: request.jwtUser!.id,
          action: 'sql_access.principal_create',
          targetId: str(p['id']) || null,
          detail: {
            principalId: str(p['id']),
            username: str(p['username']),
            label: str(p['label']) || body.label,
            pii: p['pii'] === true,
            tenants: scope.tenants,
            verticals: scope.verticals ?? null,
            expiresAt: typeof p['expiresAt'] === 'string' ? p['expiresAt'] : null,
          },
        })
        noStore(reply)
        return reply.status(201).send({ data: result })
      },
    )

    fastify.post<{ Params: { id: string } }>(
      '/api/sql-access/principals/:id/rotate',
      {
        ...guard,
        schema: {
          tags: [TAG],
          summary: "Rotate a SQL principal's password",
          description:
            'Generate a new password, returned ONCE (`Cache-Control: no-store`). The old one stops working immediately and open sessions are ended. `404` for a principal unknown or outside your scope. Requires `sql_access:manage`; audited as `sql_access.principal_rotate` (without the password).',
          operationId: 'sqlAccess.principals.rotate',
          params: IdParams,
          response: {
            200: dataEnvelope(PrincipalSecret),
            401: errorBody,
            403: errorBody,
            404: errorBody,
            409: errorBody,
          },
        },
      },
      async (request, reply) => {
        let result: Row
        try {
          result = await unifiedClient.rotateAnalyticsPrincipal(
            await scopeFor(request),
            request.params.id,
          )
        } catch (err) {
          return passUpstreamError(reply, err)
        }
        const p = principalOf(result)
        await adminStore.writeAudit({
          userId: request.jwtUser!.id,
          action: 'sql_access.principal_rotate',
          targetId: request.params.id,
          detail: {
            principalId: str(p['id']) || request.params.id,
            username: str(p['username']),
            sessionsTerminated: sessionsOf(result),
          },
        })
        noStore(reply)
        return { data: result }
      },
    )

    fastify.delete<{ Params: { id: string } }>(
      '/api/sql-access/principals/:id',
      {
        ...guard,
        schema: {
          tags: [TAG],
          summary: 'Revoke a SQL principal',
          description:
            'Revoke a login: it can no longer sign in, loses its grants and scope, and its open sessions are ended. The record stays, marked `revoked`. Requires `sql_access:manage`; audited as `sql_access.principal_revoke`.',
          operationId: 'sqlAccess.principals.revoke',
          params: IdParams,
          response: {
            200: dataEnvelope(RevokeResult),
            401: errorBody,
            403: errorBody,
            404: errorBody,
            409: errorBody,
          },
        },
      },
      async (request, reply) => {
        let result: Row
        try {
          result = await unifiedClient.revokeAnalyticsPrincipal(
            await scopeFor(request),
            request.params.id,
          )
        } catch (err) {
          return passUpstreamError(reply, err)
        }
        const p = principalOf(result)
        await adminStore.writeAudit({
          userId: request.jwtUser!.id,
          action: 'sql_access.principal_revoke',
          targetId: request.params.id,
          detail: {
            principalId: str(p['id']) || request.params.id,
            username: str(p['username']),
            sessionsTerminated: sessionsOf(result),
          },
        })
        return { data: result }
      },
    )
  }
}
