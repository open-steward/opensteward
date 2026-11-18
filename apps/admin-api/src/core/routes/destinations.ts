/**
 * Destinations — scheduled exports of the stored records to an operator's
 * lake or warehouse (Parquet to S3/GCS/Azure Blob, rows into Postgres,
 * warehouse loaders; see `GET /api/destinations/types` for what this build offers).
 *
 * Routes (every one needs `destinations:manage`):
 *   GET    /api/destinations/types              type catalog (config + secret JSON Schemas)
 *   GET    /api/destinations                    destinations inside your scope
 *   POST   /api/destinations                    create                    (audited)
 *   GET    /api/destinations/:id                one destination
 *   PATCH  /api/destinations/:id                change settings           (audited)
 *   DELETE /api/destinations/:id                delete                    (audited)
 *   PUT    /api/destinations/:id/credentials    replace the secrets       (audited, names only)
 *   POST   /api/destinations/:id/test           connection test           (audited)
 *   POST   /api/destinations/:id/run            start a run now           (audited)
 *   POST   /api/destinations/:id/backfill       reset cursors (+ run)     (audited)
 *   GET    /api/destinations/:id/runs           run history
 *
 * Every route proxies to integration-server's `/admin/destinations/*` with
 * the caller's data scope (`X-OpenSteward-Data-Scope`, built exactly as for
 * the data viewer). integration-server keeps each destination inside that
 * scope: one outside it answers 404, a write that would widen one beyond the
 * caller 403 `SCOPE_EXCEEDS_CALLER`. `revealPii` is in the scope only when
 * the caller holds `data:read_pii` — the permission integration-server reads
 * before it lets a destination export personal data unmasked
 * (`PII_NOT_PERMITTED` otherwise). The signed-in user's id travels as
 * `actor`, recorded upstream as the creator and PII approver.
 *
 * Secrets are write-only end to end: responses carry `secretFieldsSet` (the
 * names of the fields holding a value), and audit rows record names only.
 *
 * Upstream refusals pass through with their own status and code (400
 * `INVALID_CONFIG` / `HOST_NOT_ALLOWED`, 403, 404, 409 `DATA_STORE_DISABLED`
 * in passthrough mode, 409 `RUN_IN_PROGRESS`).
 */
import type { FastifyInstance, FastifyRequest } from 'fastify'
import { z } from 'zod'
import type { AdminStore } from '../db/admin-store'
import type { RuntimeSettingsStore } from '../db/runtime-settings-store'
import type { UnifiedClient } from '../proxy/client'
import { callerPermissions, requirePermission } from '../auth/access'
import { buildDataScope, passUpstreamError, readMaskFinancial } from './data'
import { dataEnvelope, errorBody, noContent, toIsoTimestamp } from './_openapi'

const TAG = 'destinations'
const PERMISSION = 'destinations:manage' as const

// ── Schemas ───────────────────────────────────────────────────────────────

const TenantList = z.union([z.literal('*'), z.array(z.string().min(1)).max(1000)])

export const DestinationScopeBody = z
  .object({
    tenants: TenantList.meta({
      description:
        'Owner tenants whose connections are exported, or `*` for every tenant (the only value that also exports connections with no owner tenant).',
      example: ['acme'],
    }),
    verticals: z
      .record(z.string(), z.union([z.literal('*'), z.array(z.string().min(1)).max(500)]))
      .optional()
      .meta({
        description:
          'Verticals exported, each with `*` or a list of resource types. Omit to export every vertical.',
        example: { crm: '*', ecommerce: ['orders'] },
      }),
    maskFinancial: z.boolean().optional().meta({
      description: 'Also mask financial fields (amounts, balances).',
      example: false,
    }),
  })
  .meta({
    id: 'DestinationScope',
    description:
      'Which records a destination exports. Must lie inside your own tenant (and vertical) scope.',
  })

const Destination = z
  .object({
    id: z.string().meta({
      description: 'Destination id.',
      example: '5b1c2d3e-4f50-4617-8a9b-0c1d2e3f4a5b',
    }),
    name: z.string().meta({ description: 'Display name.', example: 'Lake (prod)' }),
    type: z.string().meta({
      description: 'Destination type, one of the ids in the type catalog (e.g. `s3`, `postgres`).',
      example: 's3',
    }),
    config: z.record(z.string(), z.unknown()).meta({
      description: 'Non-secret settings, as validated for the type.',
      example: { bucket: 'lake', region: 'eu-west-1', prefix: 'opensteward/' },
    }),
    secretFieldsSet: z.array(z.string()).meta({
      description: 'Names of the credential fields that hold a value. Values are never returned.',
      example: ['accessKeyId', 'secretAccessKey'],
    }),
    includePii: z.boolean().meta({
      description: 'True when personal data is exported unmasked.',
      example: false,
    }),
    piiApprovedBy: z.string().nullable().meta({
      description: 'User id that approved exporting personal data; null when masked.',
      example: null,
    }),
    scope: DestinationScopeBody,
    intervalSec: z.number().meta({ description: 'Seconds between runs.', example: 3600 }),
    enabled: z.boolean().meta({ description: 'Whether scheduled runs happen.', example: true }),
    createdBy: z.string().nullable().meta({
      description: 'User id that created the destination.',
      example: 'b3c4d5e6-0000-4000-8000-000000000001',
    }),
    createdAt: z.string().nullable().meta({
      description: 'When the destination was created (ISO 8601).',
      example: '2026-09-29T12:00:00.000Z',
    }),
    updatedAt: z.string().nullable().meta({
      description: 'When the destination last changed (ISO 8601).',
      example: '2026-09-29T12:00:00.000Z',
    }),
    lastRunAt: z.string().nullable().meta({
      description: 'When the last run started (ISO 8601); null if never.',
      example: '2026-09-29T13:00:00.000Z',
    }),
    lastStatus: z.string().nullable().meta({
      description: 'Status of the last run: `running`, `success` or `failed`; null if never run.',
      example: 'success',
    }),
    lastError: z.string().nullable().meta({
      description: 'Error of the last failed run.',
      example: null,
    }),
  })
  .meta({
    id: 'Destination',
    description: 'A warehouse or lake destination. Never carries secrets.',
  })

const DestinationType = z
  .object({
    type: z.string().meta({ description: 'Type id.', example: 's3' }),
    label: z
      .string()
      .meta({ description: 'Display name.', example: 'Amazon S3 (and S3-compatible)' }),
    kind: z.string().meta({
      description: '`object_store` (Parquet files), `table` (rows in a database) or `loader`.',
      example: 'object_store',
    }),
    available: z.boolean().meta({
      description: 'False for reserved types that cannot be created yet.',
      example: true,
    }),
    experimental: z.boolean().optional().meta({
      description: 'True for types whose behaviour may still change.',
      example: false,
    }),
    configSchema: z
      .record(z.string(), z.unknown())
      .nullable()
      .meta({
        description: 'JSON Schema of the non-secret settings.',
        example: { type: 'object', properties: { bucket: { type: 'string' } } },
      }),
    secretsSchema: z
      .record(z.string(), z.unknown())
      .nullable()
      .meta({
        description: 'JSON Schema of the write-only credential fields.',
        example: { type: 'object', properties: { secretAccessKey: { type: 'string' } } },
      }),
    secretFields: z.array(z.string()).meta({
      description: 'Names of the write-only fields.',
      example: ['accessKeyId', 'secretAccessKey', 'sessionToken'],
    }),
  })
  .meta({ id: 'DestinationTypeInfo', description: 'One destination type and its settings form.' })

const DestinationRunFile = z
  .object({
    path: z.string().meta({
      description: 'Path relative to the destination prefix (object stores) or the table name.',
      example: 'vertical=crm/resource_type=contacts/dt=2026-09-29/5b1c-00000.parquet',
    }),
    kind: z.string().meta({
      description: '`rows`, `deletes`, `manifest` or `table`.',
      example: 'rows',
    }),
    vertical: z.string().optional().meta({ description: 'Vertical.', example: 'crm' }),
    resourceType: z
      .string()
      .optional()
      .meta({ description: 'Resource type.', example: 'contacts' }),
    rows: z.number().meta({ description: 'Rows written.', example: 1250 }),
  })
  .meta({ id: 'DestinationRunFile', description: 'A file (or table batch) a run wrote.' })

const DestinationRun = z
  .object({
    id: z.string().meta({
      description: 'Run id.',
      example: '0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d',
    }),
    destinationId: z.string().meta({
      description: 'Destination id.',
      example: '5b1c2d3e-4f50-4617-8a9b-0c1d2e3f4a5b',
    }),
    trigger: z.string().meta({
      description: 'What started it: `schedule`, `manual` or `backfill`.',
      example: 'schedule',
    }),
    status: z.string().meta({
      description: '`running`, `success` or `failed`.',
      example: 'success',
    }),
    startedAt: z.string().nullable().meta({
      description: 'Start time (ISO 8601).',
      example: '2026-09-29T12:00:00.000Z',
    }),
    finishedAt: z.string().nullable().meta({
      description: 'End time (ISO 8601); null while running.',
      example: '2026-09-29T12:00:04.210Z',
    }),
    rowsWritten: z.number().meta({ description: 'Rows exported.', example: 1250 }),
    deletesWritten: z.number().meta({ description: 'Deletions exported.', example: 3 }),
    files: z.array(DestinationRunFile).meta({ description: 'Files written.', example: [] }),
    error: z.string().nullable().meta({ description: 'Why it failed.', example: null }),
  })
  .meta({ id: 'DestinationRun', description: 'One export run of a destination.' })

const TestResult = z
  .object({
    ok: z.boolean().meta({ description: 'Whether the test passed.', example: true }),
    error: z.string().optional().meta({
      description: 'Why it failed.',
      example: 'AccessDenied: Access Denied',
    }),
    latencyMs: z.number().meta({ description: 'How long the test took.', example: 412 }),
  })
  .meta({ id: 'DestinationTestResult', description: 'Outcome of a destination connection test.' })

const Secrets = z.record(z.string(), z.string().max(20_000)).meta({
  description:
    'Write-only credentials, by field name (see the type catalog). Never returned or logged.',
  example: { accessKeyId: 'AKIA…', secretAccessKey: '…' },
})

const Interval = z
  .number()
  .int()
  .min(60)
  .max(7 * 24 * 3600)

const CreateBody = z
  .object({
    name: z.string().trim().min(1).max(200).meta({
      description: 'Display name.',
      example: 'Lake (prod)',
    }),
    type: z.string().min(1).max(40).meta({ description: 'Destination type.', example: 's3' }),
    config: z.record(z.string(), z.unknown()).meta({
      description: "The type's non-secret settings.",
      example: { bucket: 'lake', region: 'eu-west-1' },
    }),
    secrets: Secrets.optional(),
    scope: DestinationScopeBody,
    includePii: z.boolean().optional().meta({
      description:
        'Export personal data unmasked. Needs `data:read_pii`; you are recorded as approver.',
      example: false,
    }),
    intervalSec: Interval.optional().meta({
      description: 'Seconds between runs, 60 to 604800 (default 3600).',
      example: 3600,
    }),
    enabled: z.boolean().optional().meta({
      description: 'Run on schedule (default true).',
      example: true,
    }),
  })
  .meta({ id: 'CreateDestinationBody', description: 'Request body to create a destination.' })

const PatchBody = z
  .object({
    name: z.string().trim().min(1).max(200).optional().meta({
      description: 'Display name.',
      example: 'Lake (prod)',
    }),
    config: z
      .record(z.string(), z.unknown())
      .optional()
      .meta({
        description: "The type's full non-secret settings (replaces the stored ones).",
        example: { bucket: 'lake', region: 'eu-west-1' },
      }),
    scope: DestinationScopeBody.optional(),
    includePii: z.boolean().optional().meta({
      description: 'Export personal data unmasked. Turning it on needs `data:read_pii`.',
      example: false,
    }),
    intervalSec: Interval.optional().meta({ description: 'Seconds between runs.', example: 3600 }),
    enabled: z.boolean().optional().meta({ description: 'Run on schedule.', example: true }),
  })
  .meta({ id: 'UpdateDestinationBody', description: 'Request body to change a destination.' })

const CredentialsBody = z
  .object({ secrets: Secrets })
  .meta({ id: 'DestinationCredentialsBody', description: "Replace a destination's credentials." })

const BackfillBody = z
  .object({
    vertical: z.string().min(1).max(100).optional().meta({
      description: 'Only reset this vertical. Omit to re-export everything.',
      example: 'crm',
    }),
    resourceType: z.string().min(1).max(100).optional().meta({
      description: 'Only reset this resource type (needs `vertical`).',
      example: 'contacts',
    }),
    run: z.boolean().optional().meta({
      description: 'Start a run right away (default true).',
      example: true,
    }),
  })
  .meta({ id: 'DestinationBackfillBody', description: 'Request body to backfill a destination.' })

const BackfillResult = z
  .object({
    cursorsReset: z.number().meta({ description: 'Cursors reset.', example: 3 }),
    runId: z.string().nullable().meta({
      description: 'Run started; null when none was (disabled, or one is already running).',
      example: '0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d',
    }),
  })
  .meta({ id: 'DestinationBackfillResult', description: 'Outcome of a backfill.' })

const RunStarted = z
  .object({
    runId: z.string().meta({
      description: 'Id of the run started.',
      example: '0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d',
    }),
  })
  .meta({ id: 'DestinationRunStarted', description: 'A run that was started.' })

const IdParams = z.object({ id: z.string() })

const RunsQuery = z.object({
  limit: z.string().optional().meta({
    description: 'How many runs, newest first, 1–500 (default 50).',
    example: '50',
  }),
})

// ── Presenters ────────────────────────────────────────────────────────────

type Row = Record<string, unknown>

function iso(v: unknown): string | null {
  return typeof v === 'number' || typeof v === 'string' ? toIsoTimestamp(v) : null
}

export function presentDestination(d: Row): Row {
  return {
    ...d,
    createdAt: iso(d['createdAt']),
    updatedAt: iso(d['updatedAt']),
    lastRunAt: iso(d['lastRunAt']),
  }
}

function presentRun(r: Row): Row {
  return {
    ...r,
    startedAt: iso(r['startedAt']),
    finishedAt: iso(r['finishedAt']),
    files: Array.isArray(r['files']) ? r['files'] : [],
  }
}

const str = (v: unknown): string => (typeof v === 'string' ? v : '')

export function createDestinationsRoutes(
  unifiedClient: UnifiedClient,
  adminStore: AdminStore,
  runtimeSettings?: RuntimeSettingsStore,
) {
  // `revealPii: true` is only a request: buildDataScope sets it when the
  // caller actually holds data:read_pii.
  const scopeFor = async (request: FastifyRequest) =>
    buildDataScope(request, {
      revealPii: true,
      maskFinancial: await readMaskFinancial(runtimeSettings),
    })

  const piiRefused = {
    error: {
      code: 'PII_NOT_PERMITTED',
      message: 'Exporting unmasked PII needs the data:read_pii permission.',
    },
  }

  return async function destinationsRoutes(fastify: FastifyInstance): Promise<void> {
    fastify.addHook('preHandler', fastify.authenticate)

    const guard = { preHandler: [requirePermission(PERMISSION)] }

    fastify.get(
      '/api/destinations/types',
      {
        ...guard,
        schema: {
          tags: [TAG],
          summary: 'List destination types',
          description:
            'Every destination type with its settings form: the non-secret config and write-only secret fields as JSON Schema (types, defaults, descriptions). Types flagged `experimental` work but may still change; a type listed with `available: false` cannot be created. Requires `destinations:manage`.',
          operationId: 'destinations.types',
          response: {
            200: z.object({ data: z.array(DestinationType) }),
            401: errorBody,
            403: errorBody,
          },
        },
      },
      async (_request, reply) => {
        try {
          return { data: await unifiedClient.listDestinationTypes() }
        } catch (err) {
          return passUpstreamError(reply, err)
        }
      },
    )

    fastify.get(
      '/api/destinations',
      {
        ...guard,
        schema: {
          tags: [TAG],
          summary: 'List destinations',
          description:
            'Destinations whose scope lies inside yours, with their last run. Requires `destinations:manage`. `409` `DATA_STORE_DISABLED` in passthrough mode.',
          operationId: 'destinations.list',
          response: {
            200: z.object({ data: z.array(Destination) }),
            401: errorBody,
            403: errorBody,
            409: errorBody,
          },
        },
      },
      async (request, reply) => {
        try {
          const rows = await unifiedClient.listDestinations(await scopeFor(request))
          return { data: (rows as Row[]).map(presentDestination) }
        } catch (err) {
          return passUpstreamError(reply, err)
        }
      },
    )

    fastify.post<{ Body: z.infer<typeof CreateBody> }>(
      '/api/destinations',
      {
        ...guard,
        schema: {
          tags: [TAG],
          summary: 'Create a destination',
          description:
            "Create a destination. `config` and `secrets` follow the type's schemas (`GET /api/destinations/types`); secrets are stored encrypted and never returned. `scope` must lie inside your own (`403` `SCOPE_EXCEEDS_CALLER`); `includePii` needs `data:read_pii` (`403` `PII_NOT_PERMITTED`) and records you as approver. Every host named must be public unless allow-listed (`400` `HOST_NOT_ALLOWED`). Requires `destinations:manage`; audited as `destination.create`.",
          operationId: 'destinations.create',
          body: CreateBody,
          response: {
            201: dataEnvelope(Destination),
            400: errorBody,
            401: errorBody,
            403: errorBody,
            409: errorBody,
          },
        },
      },
      async (request, reply) => {
        const body = request.body
        if (body.includePii && !(await callerPermissions(request)).has('data:read_pii')) {
          return reply.status(403).send(piiRefused)
        }
        let created: Row
        try {
          created = await unifiedClient.createDestination(await scopeFor(request), {
            ...body,
            actor: request.jwtUser!.id,
          })
        } catch (err) {
          return passUpstreamError(reply, err)
        }
        const id = str(created['id'])
        const scope = (created['scope'] ?? body.scope) as { tenants?: '*' | string[] }
        await adminStore.writeAudit({
          userId: request.jwtUser!.id,
          action: 'destination.create',
          targetId: id,
          detail: {
            destinationId: id,
            name: str(created['name']) || body.name,
            type: str(created['type']) || body.type,
            includePii: created['includePii'] === true,
            tenants: scope.tenants ?? body.scope.tenants,
          },
        })
        return reply.status(201).send({ data: presentDestination(created) })
      },
    )

    fastify.get<{ Params: { id: string } }>(
      '/api/destinations/:id',
      {
        ...guard,
        schema: {
          tags: [TAG],
          summary: 'Get a destination',
          description:
            'One destination. `404` when unknown or outside your scope. Requires `destinations:manage`.',
          operationId: 'destinations.get',
          params: IdParams,
          response: {
            200: dataEnvelope(Destination),
            401: errorBody,
            403: errorBody,
            404: errorBody,
            409: errorBody,
          },
        },
      },
      async (request, reply) => {
        try {
          const d = await unifiedClient.getDestination(await scopeFor(request), request.params.id)
          return { data: presentDestination(d) }
        } catch (err) {
          return passUpstreamError(reply, err)
        }
      },
    )

    fastify.patch<{ Params: { id: string }; Body: z.infer<typeof PatchBody> }>(
      '/api/destinations/:id',
      {
        ...guard,
        schema: {
          tags: [TAG],
          summary: 'Change a destination',
          description:
            'Change a destination’s name, config, scope, PII setting, interval or enabled state. Changing the config, scope or PII of a PII destination needs `data:read_pii`; turning it off or disabling it does not. Widening the scope does not re-export skipped rows: run a backfill. Requires `destinations:manage`; audited as `destination.update`.',
          operationId: 'destinations.update',
          params: IdParams,
          body: PatchBody,
          response: {
            200: dataEnvelope(Destination),
            400: errorBody,
            401: errorBody,
            403: errorBody,
            404: errorBody,
            409: errorBody,
          },
        },
      },
      async (request, reply) => {
        const body = request.body ?? {}
        if (body.includePii === true && !(await callerPermissions(request)).has('data:read_pii')) {
          return reply.status(403).send(piiRefused)
        }
        let updated: Row
        try {
          updated = await unifiedClient.updateDestination(
            await scopeFor(request),
            request.params.id,
            { ...body, actor: request.jwtUser!.id },
          )
        } catch (err) {
          return passUpstreamError(reply, err)
        }
        await adminStore.writeAudit({
          userId: request.jwtUser!.id,
          action: 'destination.update',
          targetId: request.params.id,
          detail: {
            destinationId: request.params.id,
            name: str(updated['name']),
            fields: Object.keys(body).filter(
              (k) => (body as Record<string, unknown>)[k] !== undefined,
            ),
            includePii: updated['includePii'] === true,
          },
        })
        return { data: presentDestination(updated) }
      },
    )

    fastify.delete<{ Params: { id: string } }>(
      '/api/destinations/:id',
      {
        ...guard,
        schema: {
          tags: [TAG],
          summary: 'Delete a destination',
          description:
            'Delete a destination with its cursors and run history. Files and rows already exported stay where they are. Requires `destinations:manage`; audited as `destination.delete`.',
          operationId: 'destinations.delete',
          params: IdParams,
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
        const scope = await scopeFor(request)
        let name: string | null = null
        try {
          const current = await unifiedClient.getDestination(scope, request.params.id)
          name = str(current['name']) || null
          await unifiedClient.deleteDestination(scope, request.params.id)
        } catch (err) {
          return passUpstreamError(reply, err)
        }
        await adminStore.writeAudit({
          userId: request.jwtUser!.id,
          action: 'destination.delete',
          targetId: request.params.id,
          detail: { destinationId: request.params.id, name },
        })
        return reply.status(204).send()
      },
    )

    fastify.put<{ Params: { id: string }; Body: z.infer<typeof CredentialsBody> }>(
      '/api/destinations/:id/credentials',
      {
        ...guard,
        schema: {
          tags: [TAG],
          summary: 'Replace (rotate) destination credentials',
          description:
            'Replace every secret of a destination with the ones given (fields left out are cleared). Values are write-only: the response lists only the names set, and the audit row (`destination.credentials_rotate`) records names only. On a PII destination this needs `data:read_pii`. Requires `destinations:manage`.',
          operationId: 'destinations.credentials',
          params: IdParams,
          body: CredentialsBody,
          response: {
            200: dataEnvelope(Destination),
            400: errorBody,
            401: errorBody,
            403: errorBody,
            404: errorBody,
            409: errorBody,
          },
        },
      },
      async (request, reply) => {
        let updated: Row
        try {
          updated = await unifiedClient.setDestinationCredentials(
            await scopeFor(request),
            request.params.id,
            { secrets: request.body.secrets, actor: request.jwtUser!.id },
          )
        } catch (err) {
          return passUpstreamError(reply, err)
        }
        const set = updated['secretFieldsSet']
        await adminStore.writeAudit({
          userId: request.jwtUser!.id,
          action: 'destination.credentials_rotate',
          targetId: request.params.id,
          detail: {
            destinationId: request.params.id,
            secretFields: Array.isArray(set)
              ? set.filter((s): s is string => typeof s === 'string')
              : Object.keys(request.body.secrets),
          },
        })
        return { data: presentDestination(updated) }
      },
    )

    fastify.post<{ Params: { id: string } }>(
      '/api/destinations/:id/test',
      {
        ...guard,
        schema: {
          tags: [TAG],
          summary: 'Test a destination connection',
          description:
            'Build the sink with the stored credentials and prove it can write: a probe object in the bucket, or `CREATE` on the Postgres schema. A failed test still answers `200` with `ok: false` and the reason. Requires `destinations:manage`; audited as `destination.test`.',
          operationId: 'destinations.test',
          params: IdParams,
          response: {
            200: dataEnvelope(TestResult),
            401: errorBody,
            403: errorBody,
            404: errorBody,
            409: errorBody,
          },
        },
      },
      async (request, reply) => {
        let result: Awaited<ReturnType<UnifiedClient['testDestination']>>
        try {
          result = await unifiedClient.testDestination(await scopeFor(request), request.params.id)
        } catch (err) {
          return passUpstreamError(reply, err)
        }
        await adminStore.writeAudit({
          userId: request.jwtUser!.id,
          action: 'destination.test',
          targetId: request.params.id,
          detail: { destinationId: request.params.id, ok: result?.ok === true },
        })
        return { data: result }
      },
    )

    fastify.post<{ Params: { id: string } }>(
      '/api/destinations/:id/run',
      {
        ...guard,
        schema: {
          tags: [TAG],
          summary: 'Run a destination now',
          description:
            'Start an export run now, outside the schedule. `202` with the run id; `409` `RUN_IN_PROGRESS` when one is already running, `409` `DESTINATION_DISABLED` when it is disabled. Requires `destinations:manage`; audited as `destination.run`.',
          operationId: 'destinations.run',
          params: IdParams,
          response: {
            202: dataEnvelope(RunStarted),
            401: errorBody,
            403: errorBody,
            404: errorBody,
            409: errorBody,
          },
        },
      },
      async (request, reply) => {
        let started: { runId: string }
        try {
          started = await unifiedClient.runDestination(await scopeFor(request), request.params.id)
        } catch (err) {
          return passUpstreamError(reply, err)
        }
        await adminStore.writeAudit({
          userId: request.jwtUser!.id,
          action: 'destination.run',
          targetId: request.params.id,
          detail: { destinationId: request.params.id, runId: str(started?.runId) },
        })
        return reply.status(202).send({ data: { runId: str(started?.runId) } })
      },
    )

    fastify.post<{ Params: { id: string }; Body: z.infer<typeof BackfillBody> }>(
      '/api/destinations/:id/backfill',
      {
        ...guard,
        schema: {
          tags: [TAG],
          summary: 'Backfill a destination',
          description:
            'Reset the export cursors — all of them, one vertical’s, or one resource type’s — so the next run re-exports every stored record in scope, then start a run unless `run: false`. Consumers should deduplicate on `_pk`. Requires `destinations:manage`; audited as `destination.backfill`.',
          operationId: 'destinations.backfill',
          params: IdParams,
          body: BackfillBody,
          response: {
            200: dataEnvelope(BackfillResult),
            400: errorBody,
            401: errorBody,
            403: errorBody,
            404: errorBody,
            409: errorBody,
          },
        },
      },
      async (request, reply) => {
        const body = request.body ?? {}
        let result: { cursorsReset: number; runId: string | null }
        try {
          result = await unifiedClient.backfillDestination(
            await scopeFor(request),
            request.params.id,
            { ...body, actor: request.jwtUser!.id },
          )
        } catch (err) {
          return passUpstreamError(reply, err)
        }
        await adminStore.writeAudit({
          userId: request.jwtUser!.id,
          action: 'destination.backfill',
          targetId: request.params.id,
          detail: {
            destinationId: request.params.id,
            vertical: body.vertical ?? null,
            resourceType: body.resourceType ?? null,
            cursorsReset: Number(result?.cursorsReset ?? 0),
            runId: result?.runId ?? null,
          },
        })
        return { data: result }
      },
    )

    fastify.get<{ Params: { id: string }; Querystring: z.infer<typeof RunsQuery> }>(
      '/api/destinations/:id/runs',
      {
        ...guard,
        schema: {
          tags: [TAG],
          summary: 'List destination runs',
          description:
            'Run history of a destination, newest first: trigger, status, rows and deletions written, files, and the error of a failed run. Requires `destinations:manage`.',
          operationId: 'destinations.runs',
          params: IdParams,
          querystring: RunsQuery,
          response: {
            200: z.object({ data: z.array(DestinationRun) }),
            400: errorBody,
            401: errorBody,
            403: errorBody,
            404: errorBody,
            409: errorBody,
          },
        },
      },
      async (request, reply) => {
        const raw = request.query?.limit
        const limit = raw === undefined || raw === '' ? undefined : Number(raw)
        if (limit !== undefined && (!Number.isInteger(limit) || limit < 1 || limit > 500)) {
          return reply.status(400).send({
            error: { code: 'INVALID_QUERY', message: '`limit` must be an integer 1..500.' },
          })
        }
        try {
          const runs = await unifiedClient.listDestinationRuns(
            await scopeFor(request),
            request.params.id,
            limit,
          )
          return { data: (runs as Row[]).map(presentRun) }
        } catch (err) {
          return passUpstreamError(reply, err)
        }
      },
    )
  }
}
