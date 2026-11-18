/**
 * Internal destinations surface — `/admin/destinations/*`.
 *
 * Destinations export the stored copy of synced records to an operator's
 * lake or warehouse (Parquet to S3/GCS/Azure Blob, rows into Postgres,
 * staged loads MERGEd into Snowflake / BigQuery / Databricks, or — as an
 * experiment — Iceberg-ready files in a REST catalog's tables) — see
 * `@opensteward/destinations` and docs/integrate/destinations.md. Every type
 * the catalog (`GET /admin/destinations/types`) lists can be created.
 *
 * The caller is admin-api (`adminGuard`), acting for a signed-in operator
 * whose access arrives as the same SCOPE the data viewer uses
 * (`X-OpenSteward-Data-Scope`, see ./scope.ts). A destination is visible —
 * and changeable — only when its own scope lies inside the caller's:
 *
 *   - its tenants ⊆ the caller's tenants (and within each tenant's granted
 *     verticals), its verticals and resource types ⊆ the caller's;
 *   - a caller whose financial fields are masked cannot create a destination
 *     that exports them unmasked;
 *   - `includePii` needs `revealPii` in the caller's scope, and the caller's
 *     `actor` is recorded as the approver. Re-pointing a PII destination
 *     (config, scope, credentials) needs `revealPii` too, or its approval
 *     could be redirected to another bucket.
 *
 * Out-of-scope ids answer 404, never 403, so a scope cannot probe for ids;
 * a request that would WIDEN a destination beyond the caller answers 403.
 * Secrets are write-only: responses carry `secretFieldsSet`, never values.
 * `actor` in a body is the admin user id, recorded as `created_by` /
 * `pii_approved_by`.
 */
import type { FastifyPluginAsync, FastifyReply } from 'fastify'
import { z } from 'zod'
import { adminGuard } from '@opensteward/shared'
import {
  DestinationConfigError,
  DestinationNotFoundError,
  DestinationScopeSchema,
  LeaseHeldError,
  assertDestinationHosts,
  destinationCatalog,
  isImplementedType,
  parseConfig,
  truncateError,
  type DestinationRecord,
  type DestinationScope,
  type DestinationStore,
  type HostGuard,
  type RunSummary,
  type RunTrigger,
  type SinkFactory,
} from '@opensteward/destinations'
import { HttpError as ScopeHttpError, fail, parseScope, type DataScope } from './scope'

export interface DestinationRunner {
  runNow(id: string, trigger?: RunTrigger): Promise<{ runId: string; done: Promise<RunSummary> }>
}

export interface CreateDestinationsRouterOptions {
  /** Undefined in passthrough mode — every route but `/types` answers 409. */
  store?: DestinationStore
  runner?: DestinationRunner
  /** Builds a sink for `POST /:id/test` (and checks its hosts on the way). */
  sinkFactory: SinkFactory
  /** Checks every host a create/update names; throws to refuse. */
  hostGuard: HostGuard
}

type ErrorCode =
  | 'DATA_STORE_DISABLED'
  | 'DESTINATION_NOT_FOUND'
  | 'INVALID_BODY'
  | 'INVALID_CONFIG'
  | 'UNSUPPORTED_TYPE'
  | 'HOST_NOT_ALLOWED'
  | 'SCOPE_EXCEEDS_CALLER'
  | 'PII_NOT_PERMITTED'
  | 'RUN_IN_PROGRESS'
  | 'DESTINATION_DISABLED'

class DestHttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: ErrorCode,
    message: string,
    readonly details?: unknown,
  ) {
    super(message)
  }
}

// ── Scope containment ────────────────────────────────────────────────────

function listWithin(inner: '*' | string[], outer: '*' | string[]): boolean {
  if (outer === '*') return true
  if (inner === '*') return false
  return inner.every((x) => outer.includes(x))
}

/**
 * The verticals (and their types) a destination may export for one tenant,
 * against what the caller holds: the global `verticals` map intersected with
 * that tenant's `tenantVerticals` grant.
 */
function verticalsWithin(
  dest: DestinationScope['verticals'],
  callerVerticals: DataScope['verticals'],
  tenantGrant: '*' | string[] | undefined,
): boolean {
  const restrictedByTenant = tenantGrant !== undefined && tenantGrant !== '*'
  if (!callerVerticals && !restrictedByTenant) return true
  if (!dest) return false // "all verticals" exceeds any restriction
  for (const [vertical, types] of Object.entries(dest)) {
    if (restrictedByTenant && !(tenantGrant as string[]).includes(vertical)) return false
    if (callerVerticals) {
      const allowed = callerVerticals[vertical]
      if (allowed === undefined || !listWithin(types, allowed)) return false
    }
  }
  return true
}

/** Whether every record a destination scope exports is visible to the caller. */
export function destinationScopeWithin(dest: DestinationScope, caller: DataScope): boolean {
  if (caller.maskFinancial === true && dest.maskFinancial !== true) return false
  if (!listWithin(dest.tenants, caller.tenants)) return false
  if (caller.tenants === '*') return verticalsWithin(dest.verticals, caller.verticals, undefined)
  // A tenant-restricted caller: check each tenant's own vertical grant.
  for (const t of dest.tenants as string[]) {
    if (!verticalsWithin(dest.verticals, caller.verticals, caller.tenantVerticals?.[t]))
      return false
  }
  return true
}

// ── Bodies ───────────────────────────────────────────────────────────────

const Actor = z.string().min(1).max(200).optional()
const SecretsBody = z.record(z.string(), z.string().max(20_000))
const Interval = z
  .number()
  .int()
  .min(60)
  .max(7 * 24 * 3600)

const CreateBody = z
  .object({
    name: z.string().trim().min(1).max(200),
    type: z.string().min(1).max(40),
    config: z.record(z.string(), z.unknown()),
    secrets: SecretsBody.optional(),
    scope: DestinationScopeSchema,
    includePii: z.boolean().optional(),
    intervalSec: Interval.optional(),
    enabled: z.boolean().optional(),
    actor: Actor,
  })
  .strict()

const PatchBody = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    config: z.record(z.string(), z.unknown()).optional(),
    scope: DestinationScopeSchema.optional(),
    includePii: z.boolean().optional(),
    intervalSec: Interval.optional(),
    enabled: z.boolean().optional(),
    actor: Actor,
  })
  .strict()

const CredentialsBody = z.object({ secrets: SecretsBody, actor: Actor }).strict()

const BackfillBody = z
  .object({
    vertical: z.string().min(1).max(100).optional(),
    resourceType: z.string().min(1).max(100).optional(),
    /** Start a run right away (default true). */
    run: z.boolean().optional(),
    actor: Actor,
  })
  .strict()
  .refine((b) => !b.resourceType || b.vertical, '`resourceType` needs `vertical`')

function parseBody<T>(schema: z.ZodType<T>, body: unknown): T {
  const parsed = schema.safeParse(body ?? {})
  if (!parsed.success) {
    throw new DestHttpError(
      400,
      'INVALID_BODY',
      'The request body is invalid.',
      parsed.error.issues.map((i) => ({ path: i.path.map(String).join('.'), message: i.message })),
    )
  }
  return parsed.data
}

/** A destination as the API returns it (the record is already secret-free). */
function present(d: DestinationRecord) {
  return d
}

export function createDestinationsRouter(
  opts: CreateDestinationsRouterOptions,
): FastifyPluginAsync {
  const { store, runner } = opts

  function requireStore(): DestinationStore {
    if (!store) {
      throw new DestHttpError(
        409,
        'DATA_STORE_DISABLED',
        'The data store is off (DATA_STORE_MODE=passthrough); there is nothing to export.',
      )
    }
    return store
  }

  /** The destination, or 404 when missing or outside the caller's scope. */
  async function visible(scope: DataScope, id: string): Promise<DestinationRecord> {
    const d = await requireStore().get(id)
    if (!d || !destinationScopeWithin(d.scope, scope)) {
      throw new DestHttpError(404, 'DESTINATION_NOT_FOUND', 'No such destination.')
    }
    return d
  }

  function assertScopeAllowed(dest: DestinationScope, caller: DataScope) {
    if (!destinationScopeWithin(dest, caller)) {
      throw new DestHttpError(
        403,
        'SCOPE_EXCEEDS_CALLER',
        "The destination's scope reaches tenants, verticals or unmasked fields outside yours.",
      )
    }
  }

  function assertPiiAllowed(caller: DataScope) {
    if (caller.revealPii !== true) {
      throw new DestHttpError(
        403,
        'PII_NOT_PERMITTED',
        'Exporting unmasked PII needs the data:read_pii permission.',
      )
    }
  }

  async function checkHosts(type: string, config: Record<string, unknown>) {
    try {
      await assertDestinationHosts(opts.hostGuard, type, config)
    } catch (err) {
      throw new DestHttpError(
        400,
        'HOST_NOT_ALLOWED',
        `${truncateError(err)} Private hosts must be listed in DESTINATIONS_ALLOW_PRIVATE_HOSTS.`,
      )
    }
  }

  function errorReply(reply: FastifyReply, err: DestHttpError) {
    return reply.status(err.status).send({
      error: {
        code: err.code,
        message: err.message,
        ...(err.details !== undefined ? { details: err.details } : {}),
      },
    })
  }

  return async (fastify) => {
    fastify.addHook('preHandler', async (request, reply) => {
      if (!adminGuard(request, reply)) return reply
    })

    fastify.setErrorHandler((err, _request, reply) => {
      if (err instanceof DestHttpError) return errorReply(reply, err)
      if (err instanceof ScopeHttpError) return fail(reply, err.status, err.code, err.message)
      if (err instanceof DestinationConfigError) {
        return errorReply(reply, new DestHttpError(400, 'INVALID_CONFIG', err.message, err.issues))
      }
      if (err instanceof DestinationNotFoundError) {
        return errorReply(
          reply,
          new DestHttpError(404, 'DESTINATION_NOT_FOUND', 'No such destination.'),
        )
      }
      throw err
    })

    fastify.get('/admin/destinations/types', async (_request, reply) => {
      return reply.send({ data: destinationCatalog() })
    })

    fastify.get('/admin/destinations', async (request, reply) => {
      const scope = parseScope(request)
      const all = await requireStore().list()
      return reply.send({
        data: all.filter((d) => destinationScopeWithin(d.scope, scope)).map(present),
      })
    })

    fastify.post('/admin/destinations', async (request, reply) => {
      const scope = parseScope(request)
      const s = requireStore()
      const body = parseBody(CreateBody, request.body)
      if (!isImplementedType(body.type)) {
        throw new DestHttpError(
          400,
          'UNSUPPORTED_TYPE',
          `Destination type '${body.type}' is not available. See GET /admin/destinations/types.`,
        )
      }
      assertScopeAllowed(body.scope, scope)
      if (body.includePii) assertPiiAllowed(scope)
      await checkHosts(body.type, parseConfig(body.type, body.config))
      const created = await s.create({ ...body, actor: body.actor ?? null })
      return reply.status(201).send({ data: present(created) })
    })

    fastify.get<{ Params: { id: string } }>('/admin/destinations/:id', async (request, reply) => {
      const scope = parseScope(request)
      return reply.send({ data: present(await visible(scope, request.params.id)) })
    })

    fastify.patch<{ Params: { id: string } }>('/admin/destinations/:id', async (request, reply) => {
      const scope = parseScope(request)
      const current = await visible(scope, request.params.id)
      const body = parseBody(PatchBody, request.body)
      // Narrowing a PII destination (turning PII or the destination off,
      // renaming, rescheduling) is always allowed; anything that could
      // redirect its approved export needs the PII permission.
      const redirects =
        body.config !== undefined || body.scope !== undefined || body.includePii === true
      if ((current.includePii && redirects) || body.includePii === true) assertPiiAllowed(scope)
      if (body.scope !== undefined) assertScopeAllowed(body.scope, scope)
      if (body.config !== undefined) {
        await checkHosts(current.type, parseConfig(current.type, body.config))
      }
      const updated = await requireStore().update(current.id, {
        ...body,
        actor: body.actor ?? null,
      })
      return reply.send({ data: present(updated!) })
    })

    fastify.delete<{ Params: { id: string } }>(
      '/admin/destinations/:id',
      async (request, reply) => {
        const scope = parseScope(request)
        const current = await visible(scope, request.params.id)
        await requireStore().delete(current.id)
        return reply.status(204).send()
      },
    )

    fastify.put<{ Params: { id: string } }>(
      '/admin/destinations/:id/credentials',
      async (request, reply) => {
        const scope = parseScope(request)
        const current = await visible(scope, request.params.id)
        if (current.includePii) assertPiiAllowed(scope)
        const body = parseBody(CredentialsBody, request.body)
        const updated = await requireStore().setSecrets(current.id, body.secrets)
        return reply.send({ data: present(updated!) })
      },
    )

    fastify.post<{ Params: { id: string } }>(
      '/admin/destinations/:id/test',
      async (request, reply) => {
        const scope = parseScope(request)
        const s = requireStore()
        const current = await visible(scope, request.params.id)
        const started = Date.now()
        try {
          const sink = await opts.sinkFactory(current, await s.getSecrets(current.id))
          try {
            await sink.test()
          } finally {
            await sink.close().catch(() => {})
          }
          return reply.send({ data: { ok: true, latencyMs: Date.now() - started } })
        } catch (err) {
          return reply.send({
            data: { ok: false, error: truncateError(err), latencyMs: Date.now() - started },
          })
        }
      },
    )

    async function startRun(id: string, trigger: RunTrigger): Promise<string> {
      if (!runner) {
        throw new DestHttpError(
          409,
          'DATA_STORE_DISABLED',
          'The destination worker is not available.',
        )
      }
      try {
        const { runId } = await runner.runNow(id, trigger)
        return runId
      } catch (err) {
        if (err instanceof LeaseHeldError) {
          throw new DestHttpError(
            409,
            'RUN_IN_PROGRESS',
            'A run of this destination is in progress.',
          )
        }
        throw err
      }
    }

    fastify.post<{ Params: { id: string } }>(
      '/admin/destinations/:id/run',
      async (request, reply) => {
        const scope = parseScope(request)
        const current = await visible(scope, request.params.id)
        if (!current.enabled) {
          throw new DestHttpError(409, 'DESTINATION_DISABLED', 'The destination is disabled.')
        }
        const runId = await startRun(current.id, 'manual')
        return reply.status(202).send({ data: { runId } })
      },
    )

    fastify.post<{ Params: { id: string } }>(
      '/admin/destinations/:id/backfill',
      async (request, reply) => {
        const scope = parseScope(request)
        const current = await visible(scope, request.params.id)
        const body = parseBody(BackfillBody, request.body)
        const cursorsReset = await requireStore().resetCursors(current.id, {
          vertical: body.vertical,
          resourceType: body.resourceType,
        })
        let runId: string | null = null
        if (body.run !== false && current.enabled) {
          try {
            runId = await startRun(current.id, 'backfill')
          } catch (err) {
            // A run already in progress picks the reset up next time.
            if (!(err instanceof DestHttpError && err.code === 'RUN_IN_PROGRESS')) throw err
          }
        }
        return reply.send({ data: { cursorsReset, runId } })
      },
    )

    fastify.get<{ Params: { id: string }; Querystring: { limit?: string } }>(
      '/admin/destinations/:id/runs',
      async (request, reply) => {
        const scope = parseScope(request)
        const current = await visible(scope, request.params.id)
        const raw = request.query?.limit
        const limit = raw === undefined ? 50 : Number(raw)
        if (!Number.isInteger(limit) || limit < 1 || limit > 500) {
          throw new DestHttpError(400, 'INVALID_BODY', '`limit` must be an integer 1..500.')
        }
        return reply.send({ data: await requireStore().listRuns(current.id, limit) })
      },
    )
  }
}
