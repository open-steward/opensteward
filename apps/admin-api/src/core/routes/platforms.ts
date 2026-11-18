/**
 * Admin API platform management — proxies to the unified backend's
 * /admin/platforms/:vertical/:slug/* routes. The actual enable/disable/
 * config logic lives in the OpenSteward service; this route
 * authenticates the admin user (JWT) and forwards. Audit events use the
 * "adapter.*" names; the operator-facing terminology is "platform".
 */
import type { FastifyInstance, FastifyReply } from 'fastify'
import { z } from 'zod'
import type { Aggregator } from '../proxy/aggregator'
import type { AdminStore } from '../db/admin-store'
import { denyRestrictedScope } from '../auth/access'
import {
  Platform,
  PlatformOperatorRow,
  PlatformConfig,
  PlatformConfigPatch,
  PlatformConfigRedacted,
  dataEnvelope,
  listEnvelope,
  errorBody,
  okEnvelope,
  PlatformSlugSchema,
  VerticalEnum,
  VerticalPathSchema,
} from './_openapi'

const TAG = 'platforms'

/**
 * Forward a proxied mutating call's failure to the admin UI/CLI.
 *
 * A deliberate upstream refusal — `PLATFORM_UNSUPPORTED` is the motivating
 * case, but this generalises to any 4xx integration-server sends on purpose
 * (409 duplicate, 400 bad config) — carries a status and a body the caller
 * needs verbatim: `{ error: { code, message, reason, issueUrl } }`. Flattening
 * every proxied failure to `502 { error: 'Failed to enable platform', detail:
 * 'Request failed with status code 400' }` (the axios message, which names
 * neither the cause nor the origin) discarded that on purpose and left the
 * admin UI unable to explain *why* — see the `PLATFORM_UNSUPPORTED` refusal
 * this exists to carry.
 *
 * Only a real gateway failure — no response at all (DNS, refused connection,
 * timeout) or an upstream 5xx (integration-server's own fault, not the
 * caller's) — collapses to a generic 502 with `fallbackError` + the axios
 * message as `detail`.
 */
function forwardUpstreamError(err: unknown, reply: FastifyReply, fallbackError: string) {
  const upstream = err as { response?: { status?: number; data?: unknown } } | undefined
  const status = upstream?.response?.status
  const body = upstream?.response?.data
  if (typeof status === 'number' && status >= 400 && status < 500 && body !== undefined) {
    return reply.status(status).send(body)
  }
  return reply.status(502).send({
    error: fallbackError,
    detail: err instanceof Error ? err.message : String(err),
  })
}

const PlatformsQuery = z.object({
  vertical: VerticalEnum.optional(),
  search: z.string().optional(),
})

const VerticalParams = z.object({ vertical: VerticalPathSchema })
const VerticalSlugParams = z.object({ vertical: VerticalPathSchema, slug: PlatformSlugSchema })

// `config` is the discriminated PlatformConfig — but `enable` allows
// callers to omit it on adapters that need no operator config (the
// upstream adapter registry tolerates `undefined`). Tagged with an
// explicit name so downstream codegen surfaces the body shape.
const EnableBody = z
  .object({
    config: PlatformConfig.optional().meta({
      description:
        'Operator credentials/config to apply when enabling the platform; omit to enable without configuring.',
    }),
  })
  .meta({
    id: 'PlatformEnableBody',
    description:
      'Request body to enable a platform for a vertical, optionally supplying its config.',
  })

// PATCH semantics, not replace: integration-server merges these keys into the
// stored config. `PlatformConfig` (the discriminated union) demands `authType`
// and a whole branch, which no merge caller — the admin UI included — sends.
const ConfigBody = z
  .object({
    config: PlatformConfigPatch.meta({
      description:
        "Operator credentials/config keys to merge into the platform's stored configuration.",
    }),
  })
  .meta({
    id: 'PlatformConfigSetBody',
    description:
      'Request body to merge keys into an operator platform configuration. Omitted keys keep their stored value; `null` clears a key.',
  })

export function createPlatformsRoutes(aggregator: Aggregator, adminStore: AdminStore) {
  return async function platformsRoutes(fastify: FastifyInstance): Promise<void> {
    fastify.addHook('preHandler', fastify.authenticate)

    fastify.get<{ Querystring: { vertical?: string; search?: string } }>(
      '/api/platforms',
      {
        schema: {
          tags: [TAG],
          summary: 'List platforms across every vertical',
          description:
            "List every available platform (integration adapter) across all verticals, with optional `vertical` and free-text `search` filters. Any authenticated operator. Includes each platform's `authType` and enabled state.",
          operationId: 'platforms.list',
          querystring: PlatformsQuery,
          response: {
            200: listEnvelope(Platform),
            401: errorBody,
          },
        },
      },
      async (request) => {
        let platforms = await aggregator.allPlatforms()
        const { vertical, search } = request.query
        if (vertical) platforms = platforms.filter((p) => p.vertical === vertical)
        if (search) {
          const q = search.toLowerCase()
          platforms = platforms.filter(
            (p) => p.name.toLowerCase().includes(q) || p.slug.toLowerCase().includes(q),
          )
        }
        // Normalise the redundant auth-type field to the camelCase `authType`
        // wire shape: prefer an existing `authType`, otherwise carry the
        // upstream `auth_type` value, and never emit `auth_type` itself.
        const data = platforms.map((p) => {
          const { auth_type, authType, ...rest } = p
          return { ...rest, authType: authType ?? auth_type }
        })
        return { data, meta: { page: 1, limit: data.length, total: data.length } }
      },
    )

    // Operator rows for EVERY vertical in one request. The per-vertical route
    // below answers the same question one vertical at a time; looping it
    // costs the Connect Link pages ten upstream calls per render (a catalog
    // call plus one per vertical) — enough, under integration-server's
    // per-IP budget, for the admin UI to rate-limit itself. Upstream
    // `/admin/platforms` already returns all verticals with a `vertical` field
    // on each row, so nothing new is computed here.
    fastify.get(
      '/api/platforms/status',
      {
        schema: {
          tags: [TAG],
          summary: 'List operator enable/config state for every platform',
          description:
            'List every platform across every vertical with its operator-facing enabled/config state. The all-verticals counterpart of `/api/verticals/{vertical}/platforms`; each row carries the `vertical` it belongs to. Any authenticated operator. Returns `502` if integration-server cannot be reached.',
          operationId: 'platforms.list-status',
          response: {
            200: listEnvelope(PlatformOperatorRow),
            401: errorBody,
            502: errorBody,
          },
        },
      },
      async (_request, reply) => {
        try {
          const platforms = await aggregator.getClient().listPlatforms()
          return {
            data: platforms,
            meta: { page: 1, limit: platforms.length, total: platforms.length },
          }
        } catch (err) {
          return reply.status(502).send({
            error: 'Failed to list platform status',
            detail: err instanceof Error ? err.message : String(err),
          })
        }
      },
    )

    fastify.get<{ Params: { vertical: string } }>(
      '/api/verticals/:vertical/platforms',
      {
        schema: {
          tags: [TAG],
          summary: 'List platforms in one vertical',
          description:
            'List the platforms available within a single vertical, with operator-facing enabled/config state. Any authenticated operator. Returns `404` if the vertical is unknown and `502` if integration-server cannot be reached.',
          operationId: 'platforms.list-by-vertical',
          params: VerticalParams,
          response: {
            200: listEnvelope(PlatformOperatorRow),
            401: errorBody,
            404: errorBody,
            502: errorBody,
          },
        },
      },
      async (request, reply) => {
        if (!aggregator.knownVertical(request.params.vertical)) {
          return reply.status(404).send({ error: 'Unknown vertical' })
        }
        try {
          const platforms = await aggregator.getClient().listPlatforms(request.params.vertical)
          return {
            data: platforms,
            meta: { page: 1, limit: platforms.length, total: platforms.length },
          }
        } catch (err) {
          return reply.status(502).send({
            error: `Failed to list platforms for ${request.params.vertical}`,
            detail: err instanceof Error ? err.message : String(err),
          })
        }
      },
    )

    fastify.get<{ Params: { vertical: string; slug: string } }>(
      '/api/verticals/:vertical/platforms/:slug/config',
      {
        preHandler: [fastify.authenticate, fastify.operatorOnly, denyRestrictedScope],
        schema: {
          tags: [TAG],
          summary: "Read a platform's operator-set config (redacted)",
          description:
            'Read the operator-managed configuration for a platform, with secret fields redacted. Operator role or higher. Refused (`403 SCOPE_RESTRICTED`) for a user restricted to specific tenants: it affects every tenant. Returns `404` if the vertical or platform is unknown and `502` if integration-server cannot be reached.',
          operationId: 'platforms.config.get',
          params: VerticalSlugParams,
          response: {
            200: dataEnvelope(PlatformConfigRedacted),
            401: errorBody,
            403: errorBody,
            404: errorBody,
            502: errorBody,
          },
        },
      },
      async (request, reply) => {
        if (!aggregator.knownVertical(request.params.vertical)) {
          return reply.status(404).send({ error: 'Unknown vertical' })
        }
        try {
          const config = await aggregator
            .getClient()
            .getPlatformConfig(request.params.vertical, request.params.slug)
          if (!config) return reply.status(404).send({ error: 'Platform not found' })
          return { data: config }
        } catch (err) {
          return reply.status(502).send({
            error: 'Failed to read platform config',
            detail: err instanceof Error ? err.message : String(err),
          })
        }
      },
    )

    fastify.post<{
      Params: { vertical: string; slug: string }
      Body: { config?: Record<string, unknown> }
    }>(
      '/api/verticals/:vertical/platforms/:slug/enable',
      {
        preHandler: [fastify.authenticate, fastify.operatorOnly, denyRestrictedScope],
        schema: {
          tags: [TAG],
          summary: 'Enable a platform with operator-supplied config',
          description:
            'Enable a platform for a vertical, optionally applying operator credentials/config; omit `config` for adapters that need none. Operator role or higher. Refused (`403 SCOPE_RESTRICTED`) for a user restricted to specific tenants: it affects every tenant. Returns `404` if the vertical is unknown and `502` if integration-server cannot be reached. Writes an `adapter.enable` audit entry.',
          operationId: 'platforms.enable',
          params: VerticalSlugParams,
          body: EnableBody,
          response: {
            200: okEnvelope,
            400: errorBody,
            401: errorBody,
            403: errorBody,
            404: errorBody,
            502: errorBody,
          },
        },
      },
      async (request, reply) => {
        if (!aggregator.knownVertical(request.params.vertical)) {
          return reply.status(404).send({ error: 'Unknown vertical' })
        }
        try {
          await aggregator
            .getClient()
            .enablePlatform(request.params.vertical, request.params.slug, request.body?.config)
          adminStore.writeAudit(
            request.jwtUser!.id,
            'adapter.enable',
            request.params.vertical,
            request.params.slug,
          )
          return { ok: true } as const
        } catch (err) {
          return forwardUpstreamError(err, reply, 'Failed to enable platform')
        }
      },
    )

    fastify.post<{ Params: { vertical: string; slug: string } }>(
      '/api/verticals/:vertical/platforms/:slug/disable',
      {
        preHandler: [fastify.authenticate, fastify.operatorOnly, denyRestrictedScope],
        schema: {
          tags: [TAG],
          summary: 'Disable a platform',
          description:
            'Disable a platform for a vertical so it can no longer be connected. Operator role or higher. Refused (`403 SCOPE_RESTRICTED`) for a user restricted to specific tenants: it affects every tenant. Returns `404` if the vertical is unknown and `502` if integration-server cannot be reached. Writes an `adapter.disable` audit entry.',
          operationId: 'platforms.disable',
          params: VerticalSlugParams,
          response: {
            200: okEnvelope,
            400: errorBody,
            401: errorBody,
            403: errorBody,
            404: errorBody,
            502: errorBody,
          },
        },
      },
      async (request, reply) => {
        if (!aggregator.knownVertical(request.params.vertical)) {
          return reply.status(404).send({ error: 'Unknown vertical' })
        }
        try {
          await aggregator.getClient().disablePlatform(request.params.vertical, request.params.slug)
          adminStore.writeAudit(
            request.jwtUser!.id,
            'adapter.disable',
            request.params.vertical,
            request.params.slug,
          )
          return { ok: true } as const
        } catch (err) {
          return forwardUpstreamError(err, reply, 'Failed to disable platform')
        }
      },
    )

    fastify.put<{
      Params: { vertical: string; slug: string }
      Body: { config: Record<string, unknown> }
    }>(
      '/api/verticals/:vertical/platforms/:slug/config',
      {
        preHandler: [fastify.authenticate, fastify.operatorOnly, denyRestrictedScope],
        schema: {
          tags: [TAG],
          summary: "Set a platform's operator-managed config",
          description:
            'Set or replace the operator-managed configuration (credentials, keyed by `authType`) for a platform. Operator role or higher. Refused (`403 SCOPE_RESTRICTED`) for a user restricted to specific tenants: it affects every tenant. Returns `404` if the vertical is unknown, `400` if the body lacks a `config` object, and `502` if integration-server cannot be reached. Writes an `adapter.config` audit entry.',
          operationId: 'platforms.config.set',
          params: VerticalSlugParams,
          body: ConfigBody,
          response: {
            200: okEnvelope,
            400: errorBody,
            401: errorBody,
            403: errorBody,
            404: errorBody,
            502: errorBody,
          },
        },
      },
      async (request, reply) => {
        if (!aggregator.knownVertical(request.params.vertical)) {
          return reply.status(404).send({ error: 'Unknown vertical' })
        }
        if (!request.body?.config || typeof request.body.config !== 'object') {
          return reply.status(400).send({ error: 'Body must include a config object' })
        }
        try {
          await aggregator
            .getClient()
            .setPlatformConfig(request.params.vertical, request.params.slug, request.body.config)
          adminStore.writeAudit(
            request.jwtUser!.id,
            'adapter.config',
            request.params.vertical,
            request.params.slug,
          )
          return { ok: true } as const
        } catch (err) {
          return forwardUpstreamError(err, reply, 'Failed to update platform config')
        }
      },
    )
  }
}
