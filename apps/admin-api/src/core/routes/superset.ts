/**
 * Embedded Apache Superset dashboards (optional; Postgres deployments).
 *
 * Routes:
 *   GET  /api/analytics/superset/status       dashboards:view — enabled + browser URL
 *   GET  /api/analytics/superset/dashboards   dashboards:view — registered dashboards you may open
 *   POST /api/analytics/superset/guest-token  dashboards:view — a 5-minute guest token for one
 *   PATCH /api/analytics/superset/dashboards/:id  dashboards:share_all — who sees it, and pinned tenants
 *   PUT  /api/internal/superset/dashboards    service secret  — the bootstrap job's registry sync
 *
 * Superset runs beside OpenSteward and reads only the masked `os_analytics`
 * views through a read-only SQL principal. Operators never log in to it: the
 * admin UI embeds a dashboard with a guest token minted here, for the
 * signed-in operator, carrying an RLS clause built from their tenant scope
 * (`analytics/superset-rls.ts`). A restricted operator with no tenants gets
 * no token (403). Guest tokens are audited as `superset.guest_token`, at most
 * once per user and dashboard every 10 minutes — the embedded SDK refreshes
 * a token before it expires, and one audit row per refresh would drown the
 * log.
 *
 * The feature is off unless admin-api has `SUPERSET_URL`: status reports
 * `enabled: false` and the other operator routes answer 409
 * `SUPERSET_DISABLED`.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { z } from 'zod'
import { PERMISSIONS, type Permission } from '@opensteward/shared'
import type { AdminStore } from '../db/admin-store'
import type {
  SupersetDashboardRecord,
  SupersetDashboardStore,
} from '../db/superset-dashboard-store'
import { callerContext, denyRestrictedScope, getAccess, requirePermission } from '../auth/access'
import {
  canSeeDashboard,
  checkAudienceChange,
  effectiveShareAll,
  narrowAccessScope,
  normalisePins,
  redactFor,
  sameAudience,
  samePins,
  type Viewer,
} from '../dashboards/audience'
import {
  AudienceSchema,
  AudienceView,
  PinnedTenantsSchema,
  PinnedTenantsView,
  toAudience,
} from './_audience'
import { serviceGuard } from '../auth/service-auth'
import { buildRlsDecision, scopeCoversVerticals } from '../analytics/superset-rls'
import { SupersetHttpError, type SupersetClient } from '../analytics/superset-client'
import { dataEnvelope, errorBody } from './_openapi'

const TAG = 'superset'

/** Audit a user's guest tokens for one dashboard at most this often. */
export const GUEST_TOKEN_AUDIT_INTERVAL_MS = 10 * 60_000
const AUDIT_MEMO_MAX = 5_000

const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/

// ── Schemas ───────────────────────────────────────────────────────────────

const Status = z
  .object({
    enabled: z.boolean().meta({
      description: 'True when admin-api is configured with a Superset URL.',
      example: true,
    }),
    publicUrl: z.string().nullable().meta({
      description: 'Browser-facing Superset URL the admin UI embeds from; null when disabled.',
      example: 'https://superset.example.com',
    }),
  })
  .meta({
    id: 'SupersetStatus',
    description: 'Whether embedded Superset dashboards are available.',
  })

const SupersetDashboard = z
  .object({
    id: z.string().meta({ description: 'Registry id.', example: 'ssd_0123456789abcdef0123' }),
    title: z.string().meta({ description: 'Title.', example: 'Connection data overview' }),
    description: z.string().nullable().meta({
      description: 'What the dashboard shows.',
      example: 'Records per vertical and the connections behind them.',
    }),
    embeddedUuid: z.string().meta({
      description: 'Id of the dashboard’s embedded configuration in Superset.',
      example: '6c0a4bd6-3f7c-4c5e-9d52-7b1f0e0f2a11',
    }),
    verticals: z
      .array(z.string())
      .nullable()
      .meta({ description: 'Verticals it is about; null when not tied to one.', example: null }),
    requiredPermission: z.string().nullable().meta({
      description: 'Permission needed on top of `dashboards:view`; null when none.',
      example: null,
    }),
    audience: AudienceView,
    pinnedTenants: PinnedTenantsView,
    updatedAt: z.string().meta({
      description: 'When the registry entry last changed (ISO 8601).',
      example: '2026-09-01T10:00:00.000Z',
    }),
  })
  .meta({ id: 'SupersetDashboard', description: 'An embeddable Superset dashboard.' })

const SharingBody = z
  .object({ audience: AudienceSchema.optional(), pinnedTenants: PinnedTenantsSchema.optional() })
  .meta({ id: 'SupersetSharingBody', description: 'Who sees an embedded Superset dashboard.' })

const GuestTokenBody = z
  .object({
    dashboardId: z.string().min(1).max(100).meta({
      description: 'Registry id of the dashboard (`ssd_…`).',
      example: 'ssd_0123456789abcdef0123',
    }),
  })
  .meta({ id: 'SupersetGuestTokenBody', description: 'Request body to mint a guest token.' })

const GuestToken = z
  .object({
    token: z
      .string()
      .meta({ description: 'The guest token (a JWT signed by Superset).', example: 'eyJ…' }),
    expiresAt: z.string().nullable().meta({
      description: 'When the token expires (ISO 8601), when Superset says.',
      example: '2026-09-01T10:05:00.000Z',
    }),
    embeddedUuid: z.string().meta({
      description: 'Embedded configuration id to pass to the embedded SDK.',
      example: '6c0a4bd6-3f7c-4c5e-9d52-7b1f0e0f2a11',
    }),
    supersetDomain: z.string().meta({
      description: 'Browser-facing Superset URL.',
      example: 'https://superset.example.com',
    }),
    restricted: z.boolean().meta({
      description: 'True when the token carries a tenant row-level-security clause.',
      example: false,
    }),
  })
  .meta({ id: 'SupersetGuestToken', description: 'A short-lived Superset guest token.' })

const RegistryItem = z.object({
  supersetUuid: z.string().regex(UUID_RE),
  embeddedUuid: z.string().regex(UUID_RE),
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(1000).nullable().optional(),
  verticals: z
    .array(z.string().regex(/^[a-z][a-z0-9_-]*$/))
    .max(20)
    .nullable()
    .optional(),
  requiredPermission: z.enum(PERMISSIONS).nullable().optional(),
})

export const RegistryBody = z.object({
  dashboards: z.array(RegistryItem).max(200),
  prune: z.boolean().optional(),
})
export type RegistryBody = z.infer<typeof RegistryBody>

// ── Helpers ───────────────────────────────────────────────────────────────

function presentBase(d: SupersetDashboardRecord) {
  return {
    id: d.id,
    title: d.title,
    description: d.description,
    embeddedUuid: d.embeddedUuid,
    verticals: d.verticals,
    requiredPermission: d.requiredPermission,
    updatedAt: new Date(d.updatedAt).toISOString(),
  }
}

/** A registry entry as this viewer may see it: foreign tenant ids removed unless `fullView`. */
function present(d: SupersetDashboardRecord, viewer: Viewer, fullView: boolean) {
  return {
    ...presentBase(d),
    ...redactFor(
      viewer,
      { ownerUserId: null, audience: d.audience, pinnedTenants: d.pinnedTenants },
      fullView,
    ),
  }
}

/** An entry with its audience and pins as stored: the bootstrap job and a deployment-wide sharer. */
function presentFull(d: SupersetDashboardRecord) {
  return { ...presentBase(d), audience: d.audience, pinnedTenants: d.pinnedTenants }
}

const DISABLED = {
  error: {
    code: 'SUPERSET_DISABLED',
    message: 'Embedded Superset is not configured on this deployment (SUPERSET_URL is unset).',
  },
} as const

export interface SupersetRoutesOptions {
  store: SupersetDashboardStore
  adminStore: AdminStore
  /** Null when the feature is off. */
  client: SupersetClient | null
  publicUrl: string | null
  now?: () => number
}

export function createSupersetRoutes(opts: SupersetRoutesOptions) {
  const { store, adminStore, client, publicUrl } = opts
  const now = opts.now ?? Date.now
  const enabled = client !== null && publicUrl !== null
  /** user:dashboard → when a guest token was last audited. */
  const audited = new Map<string, number>()

  /** Dashboards the caller may open: extra permission, vertical reach, and audience. */
  async function visible(request: FastifyRequest) {
    const ctx = await callerContext(request)
    const viewer: Viewer = {
      userId: request.jwtUser!.id,
      access: ctx.access,
      admin: ctx.baseRole === 'admin',
    }
    const dashboards = (await store.list()).filter(
      (d) =>
        (d.requiredPermission === null ||
          ctx.permissions.has(d.requiredPermission as Permission)) &&
        scopeCoversVerticals(ctx.access?.scope, d.verticals) &&
        canSeeDashboard(viewer, {
          ownerUserId: null,
          audience: d.audience,
          pinnedTenants: d.pinnedTenants,
        }),
    )
    return { dashboards, viewer, fullView: effectiveShareAll(ctx.permissions, ctx.access) }
  }

  function shouldAudit(userId: string, dashboardId: string): boolean {
    const key = `${userId}:${dashboardId}`
    const t = now()
    const last = audited.get(key)
    if (last !== undefined && t - last < GUEST_TOKEN_AUDIT_INTERVAL_MS) return false
    if (audited.size >= AUDIT_MEMO_MAX) {
      const oldest = audited.keys().next().value
      if (oldest !== undefined) audited.delete(oldest)
    }
    audited.delete(key)
    audited.set(key, t)
    return true
  }

  return async function supersetRoutes(fastify: FastifyInstance): Promise<void> {
    fastify.get(
      '/api/analytics/superset/status',
      {
        preHandler: [fastify.authenticate, requirePermission('dashboards:view')],
        schema: {
          tags: [TAG],
          summary: 'Embedded Superset status',
          description:
            'Whether embedded Apache Superset dashboards are configured, and the browser-facing Superset URL the admin UI embeds from. Requires `dashboards:view`.',
          operationId: 'superset.status',
          response: { 200: dataEnvelope(Status), 401: errorBody, 403: errorBody },
        },
      },
      async () => ({ data: { enabled, publicUrl: enabled ? publicUrl : null } }),
    )

    fastify.get(
      '/api/analytics/superset/dashboards',
      {
        preHandler: [fastify.authenticate, requirePermission('dashboards:view')],
        schema: {
          tags: [TAG],
          summary: 'List embedded Superset dashboards',
          description:
            'The registered Superset dashboards you may open: those whose extra permission you hold and whose verticals your tenant scope reaches. What each shows is still filtered to your tenants by the guest token. Requires `dashboards:view`. `409 SUPERSET_DISABLED` when Superset is not configured.',
          operationId: 'superset.dashboards.list',
          response: {
            200: z.object({ data: z.array(SupersetDashboard) }),
            401: errorBody,
            403: errorBody,
            409: errorBody,
          },
        },
      },
      async (request, reply) => {
        if (!enabled) return reply.status(409).send(DISABLED)
        const v = await visible(request)
        return { data: v.dashboards.map((d) => present(d, v.viewer, v.fullView)) }
      },
    )

    fastify.patch<{ Params: { id: string }; Body: z.infer<typeof SharingBody> }>(
      '/api/analytics/superset/dashboards/:id',
      {
        preHandler: [
          fastify.authenticate,
          requirePermission('dashboards:share_all'),
          denyRestrictedScope,
        ],
        schema: {
          tags: [TAG],
          summary: 'Choose who sees a Superset dashboard',
          description:
            'Set a registered dashboard’s audience (`tenants` or `everyone`; not `private`) and optional pinned tenants, which narrow its guest-token row-level security to viewer scope ∩ pins. The bootstrap job never changes these. Requires `dashboards:share_all` and access to every tenant (`403 SCOPE_RESTRICTED` for a tenant-restricted caller, since registry entries are deployment-wide). `404` for a dashboard you cannot open, `409 SUPERSET_DISABLED` when Superset is not configured. Writes a `superset.share` audit entry.',
          operationId: 'superset.dashboards.update-sharing',
          params: z.object({ id: z.string() }),
          body: SharingBody,
          response: {
            200: dataEnvelope(SupersetDashboard),
            400: errorBody,
            401: errorBody,
            403: errorBody,
            404: errorBody,
            409: errorBody,
          },
        },
      },
      async (request, reply) => {
        if (!enabled) return reply.status(409).send(DISABLED)
        const v = await visible(request)
        const existing = v.dashboards.find((d) => d.id === request.params.id)
        if (!existing) {
          return reply
            .status(404)
            .send({ error: { code: 'DASHBOARD_NOT_FOUND', message: 'No such dashboard.' } })
        }
        const audience = request.body.audience
          ? toAudience(request.body.audience)
          : existing.audience
        if (audience.kind === 'private') {
          return reply.status(400).send({
            error: {
              code: 'INVALID_AUDIENCE',
              message: 'Share a Superset dashboard with tenants or with everyone.',
            },
          })
        }
        const pins =
          request.body.pinnedTenants !== undefined
            ? normalisePins(request.body.pinnedTenants)
            : existing.pinnedTenants
        const changed = {
          ...(sameAudience(audience, existing.audience) ? {} : { audience }),
          ...(samePins(pins, existing.pinnedTenants) ? {} : { pinnedTenants: pins }),
        }
        const ctx = await callerContext(request)
        const check = checkAudienceChange({
          changed,
          result: { audience, pinnedTenants: pins },
          stored: { audience: existing.audience, pinnedTenants: existing.pinnedTenants },
          access: ctx.access,
          canShareAll: effectiveShareAll(ctx.permissions, ctx.access),
          knownTenants: new Set((await adminStore.listTenants()).map((t) => t.id)),
        })
        if (!check.ok) {
          return reply
            .status(check.status)
            .send({ error: { code: 'INVALID_AUDIENCE', message: check.error } })
        }
        if (Object.keys(changed).length === 0) return { data: presentFull(existing) }
        const updated = (await store.setSharing(existing.id, audience, pins))!
        await adminStore.writeAudit({
          userId: request.jwtUser!.id,
          action: 'superset.share',
          targetId: existing.id,
          detail: {
            title: existing.title,
            from: existing.audience,
            to: audience,
            pinnedFrom: existing.pinnedTenants,
            pinnedTo: pins,
          },
        })
        return { data: presentFull(updated) }
      },
    )

    fastify.post<{ Body: z.infer<typeof GuestTokenBody> }>(
      '/api/analytics/superset/guest-token',
      {
        preHandler: [fastify.authenticate, requirePermission('dashboards:view')],
        schema: {
          tags: [TAG],
          summary: 'Mint a Superset guest token',
          description:
            'A guest token for one registered dashboard, valid for 5 minutes, carrying a row-level-security clause that limits every query to your tenant scope, narrowed to the dashboard’s pinned tenants when it has any (no clause only when you see every tenant and it is unpinned). Requires `dashboards:view` (and the dashboard’s extra permission, if any). `404` for a dashboard you may not open, `403 SCOPE_EMPTY` when your access is restricted to no tenants, `409 SUPERSET_DISABLED` when Superset is not configured, `502 SUPERSET_UNAVAILABLE` when Superset refuses or cannot be reached. Writes a `superset.guest_token` audit entry at most once per user and dashboard every 10 minutes.',
          operationId: 'superset.guest-token.create',
          body: GuestTokenBody,
          response: {
            200: dataEnvelope(GuestToken),
            400: errorBody,
            401: errorBody,
            403: errorBody,
            404: errorBody,
            409: errorBody,
            502: errorBody,
          },
        },
      },
      async (request, reply: FastifyReply) => {
        if (!enabled || !client || !publicUrl) return reply.status(409).send(DISABLED)
        // Scope first: a caller who may see no tenant gets 403 whatever the id.
        const access = await getAccess(request)
        const rls = buildRlsDecision(access?.scope)
        if (rls.kind === 'deny') {
          return reply.status(403).send({ error: { code: 'SCOPE_EMPTY', message: rls.reason } })
        }
        const dashboard = (await visible(request)).dashboards.find(
          (d) => d.id === request.body.dashboardId,
        )
        if (!dashboard) {
          return reply
            .status(404)
            .send({ error: { code: 'DASHBOARD_NOT_FOUND', message: 'No such dashboard.' } })
        }
        const narrowed = buildRlsDecision(narrowAccessScope(access?.scope, dashboard.pinnedTenants))
        if (narrowed.kind === 'deny') {
          return reply
            .status(403)
            .send({ error: { code: 'SCOPE_EMPTY', message: narrowed.reason } })
        }
        const user = request.jwtUser!
        let minted: { token: string; expiresAt: number | null }
        try {
          minted = await client.createGuestToken({
            user: {
              // Shown in Superset's logs; never used to authorise anything.
              username: `opensteward:${user.username}`.slice(0, 64),
              first_name: user.username.slice(0, 64),
              last_name: '(OpenSteward)',
            },
            resources: [{ type: 'dashboard', id: dashboard.embeddedUuid }],
            rls: narrowed.kind === 'clause' ? [{ clause: narrowed.clause }] : [],
          })
        } catch (err) {
          request.log.warn(
            {
              err:
                err instanceof SupersetHttpError
                  ? { status: err.status, message: err.message }
                  : err,
            },
            'superset guest token failed',
          )
          return reply.status(502).send({
            error: {
              code: 'SUPERSET_UNAVAILABLE',
              message:
                'Superset could not issue a guest token. Check that it is running and that the service account is valid.',
            },
          })
        }
        if (shouldAudit(user.id, dashboard.id)) {
          await adminStore.writeAudit({
            userId: user.id,
            action: 'superset.guest_token',
            targetId: dashboard.id,
            detail: { title: dashboard.title, restricted: narrowed.kind === 'clause' },
          })
        }
        reply.header('cache-control', 'no-store')
        return {
          data: {
            token: minted.token,
            expiresAt: minted.expiresAt === null ? null : new Date(minted.expiresAt).toISOString(),
            embeddedUuid: dashboard.embeddedUuid,
            supersetDomain: publicUrl,
            restricted: narrowed.kind === 'clause',
          },
        }
      },
    )

    // Service-to-service: the superset-bootstrap job registers the dashboards
    // it created. Hidden from the operator spec, like `/api/internal/audit`.
    fastify.put(
      '/api/internal/superset/dashboards',
      { preHandler: [serviceGuard], schema: { hide: true } },
      async (request, reply) => {
        const parsed = RegistryBody.safeParse(request.body ?? {})
        if (!parsed.success) {
          return reply
            .status(400)
            .send({ error: { code: 'VALIDATION', issues: parsed.error.issues } })
        }
        const result = await store.upsertMany(
          parsed.data.dashboards.map((d) => ({
            title: d.title,
            description: d.description ?? null,
            supersetUuid: d.supersetUuid.toLowerCase(),
            embeddedUuid: d.embeddedUuid.toLowerCase(),
            verticals: d.verticals && d.verticals.length > 0 ? d.verticals : null,
            requiredPermission: d.requiredPermission ?? null,
          })),
          { prune: parsed.data.prune === true },
        )
        await adminStore.writeAudit({
          userId: 'system',
          action: 'superset.registry_sync',
          targetId: 'superset_dashboards',
          detail: result,
        })
        return reply.send({
          data: { ...result, dashboards: (await store.list()).map(presentFull) },
        })
      },
    )
  }
}
