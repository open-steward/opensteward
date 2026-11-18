/**
 * Stored data — the admin data viewer's API.
 *
 * Routes:
 *   GET  /api/data/summary                                        data:read
 *   GET  /api/data/schema/:vertical/:type                         data:read
 *   GET  /api/data/connections/:id/resources/:type                data:read
 *   GET  /api/data/connections/:id/resources/:type/export         data:export (+ data:read_pii for include_pii)
 *   GET  /api/data/connections/:id/resources/:type/:rid           data:read
 *   POST /api/data/connections/:id/resources/:type/:rid/reveal    data:read + data:read_pii (audited)
 *
 * Every route proxies to integration-server's `/admin/data/*` with the
 * deployment admin secret AND the caller's scope (`X-OpenSteward-Data-Scope`):
 * the tenants (and per-tenant verticals) the operator may see, whether this
 * request may reveal personal data, and whether financial fields are masked
 * (`data_access.mask_financial`). integration-server re-checks connection
 * ownership against that scope and masks every record by its field
 * classification — admin-api never receives an unmasked record unless the
 * request is a reveal (or a PII export) by a `data:read_pii` holder, and
 * every one of those is written to the audit log before the data goes out.
 *
 * Upstream refusals pass through with their own status and code: 404 for an
 * unknown or out-of-scope connection, record or type; 409
 * `DATA_STORE_DISABLED` in passthrough mode; 400 `FIELD_NOT_SEARCHABLE` for a
 * filter on a field this caller may not search.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { z } from 'zod'
import { SETTING } from '@opensteward/shared'
import type { AdminStore } from '../db/admin-store'
import type { RuntimeSettingsStore } from '../db/runtime-settings-store'
import type { DataScopeHeader, UnifiedClient } from '../proxy/client'
import { callerPermissions, getAccess, requirePermission, toProxyScope } from '../auth/access'
import { dataEnvelope, errorBody, toIsoTimestamp } from './_openapi'

const TAG = 'data'

// ── Scope ─────────────────────────────────────────────────────────────────

/**
 * The scope integration-server enforces for this caller. `revealPii` is set
 * only when the caller asked for unmasked data on this request AND holds
 * `data:read_pii`; everything else is read masked.
 */
export async function buildDataScope(
  request: FastifyRequest,
  opts: { revealPii: boolean; maskFinancial: boolean },
): Promise<DataScopeHeader> {
  const access = await getAccess(request)
  const held = await callerPermissions(request)
  const proxy = access ? toProxyScope(access) : ({ tenants: '*' } as const)
  const scope: DataScopeHeader =
    proxy.tenants === '*'
      ? { tenants: '*' }
      : { tenants: proxy.tenants, tenantVerticals: proxy.verticals }
  if (opts.revealPii && held.has('data:read_pii')) scope.revealPii = true
  if (opts.maskFinancial) scope.maskFinancial = true
  return scope
}

/** `data_access.mask_financial`, false when unset or unreadable. */
export async function readMaskFinancial(settings: RuntimeSettingsStore | undefined) {
  if (!settings) return false
  try {
    return (await settings.get(SETTING.DATA_ACCESS_MASK_FINANCIAL))?.value === true
  } catch {
    return false
  }
}

/**
 * Hand an upstream 4xx back with integration-server's own status and code.
 * Anything else (5xx, unreachable) rethrows to the central error handler.
 */
export function passUpstreamError(reply: FastifyReply, err: unknown) {
  const e = err as { response?: { status?: number; data?: unknown } }
  const status = e.response?.status
  if (!status || status < 400 || status >= 500) throw err
  const body = e.response?.data as { error?: unknown } | undefined
  const error =
    body && typeof body === 'object' && body.error !== undefined
      ? body.error
      : { code: 'UPSTREAM_ERROR', message: `integration-server answered ${status}` }
  return reply.status(status).send({ error })
}

/**
 * Records are sent as a pre-serialised string: the response-wide timestamp
 * rewrite (`isoifyTimestamps`) would otherwise reach INTO stored records and
 * turn a numeric `createdAt` the platform sent into an ISO string. The row
 * metadata is converted here instead; `data` goes out exactly as stored
 * (masked).
 */
function presentRecord(r: unknown): unknown {
  if (!r || typeof r !== 'object') return r
  const rec = r as Record<string, unknown>
  return {
    ...rec,
    fetchedAt: toIsoTimestamp(rec['fetchedAt'] as number | null),
    updatedAt: toIsoTimestamp(rec['updatedAt'] as number | null),
    changedAt: toIsoTimestamp(rec['changedAt'] as number | null),
  }
}

function sendJson(reply: FastifyReply, body: unknown) {
  return reply.type('application/json; charset=utf-8').send(JSON.stringify(body))
}

// ── Schemas ───────────────────────────────────────────────────────────────

const DataResourceSummary = z
  .object({
    resourceType: z.string().meta({ description: 'Stored resource type.', example: 'contacts' }),
    count: z.number().meta({ description: 'Records stored for this connection.', example: 1240 }),
    latestChangedAt: z.number().nullable().meta({
      description: 'When the newest record last changed (epoch ms); null when none.',
      example: 1767225600000,
    }),
    collectionCompletedAt: z.number().nullable().meta({
      description: 'When the last full sync of this type finished (epoch ms); null if never.',
      example: 1767225600000,
    }),
    classified: z.boolean().meta({
      description:
        'False when the type has no field classification; every field is then masked as personal data.',
      example: true,
    }),
  })
  .meta({ id: 'DataResourceSummary', description: 'Stored records of one type on one connection.' })

const DataConnectionSummary = z
  .object({
    connectionId: z.string().meta({
      description: 'Connection id.',
      example: '9f8e7d6c-1a2b-4c3d-8e9f-0a1b2c3d4e5f',
    }),
    vertical: z.string().meta({ description: 'Vertical.', example: 'crm' }),
    platform: z.string().meta({ description: 'Platform slug.', example: 'hubspot' }),
    label: z.string().nullable().meta({ description: 'Connection label.', example: 'Acme CRM' }),
    ownerTenantId: z.string().nullable().meta({
      description: 'Deployment tenant that owns the connection.',
      example: 'acme',
    }),
    resources: z.array(DataResourceSummary).meta({
      description: 'Stored resource types, alphabetical.',
      example: [],
    }),
  })
  .meta({
    id: 'DataConnectionSummary',
    description: 'What the data store holds for one connection in your scope.',
  })

const DataField = z
  .object({
    path: z.string().meta({ description: 'Dotted field path.', example: 'email' }),
    class: z.enum(['public', 'internal', 'pii', 'financial', 'secret']).meta({
      description: 'Classification of the field.',
      example: 'pii',
    }),
    mask: z
      .string()
      .nullable()
      .meta({ description: 'Mask applied when hidden.', example: 'email' }),
    classified: z.boolean().meta({
      description: 'True when the path has its own classification entry.',
      example: true,
    }),
    inSchema: z.boolean().meta({
      description: 'True when the path is a top-level field of the canonical schema.',
      example: true,
    }),
    searchable: z.boolean().meta({
      description: 'Whether you may filter and search on this field.',
      example: false,
    }),
  })
  .meta({ id: 'DataField', description: 'One field of a stored resource type.' })

const DataSchema = z
  .object({
    vertical: z.string().meta({ description: 'Vertical.', example: 'crm' }),
    resourceType: z.string().meta({ description: 'Resource type.', example: 'contacts' }),
    classified: z.boolean().meta({ description: 'Whether the type is classified.', example: true }),
    defaultClass: z.string().meta({
      description: 'Class of fields with no rule of their own.',
      example: 'internal',
    }),
    fields: z.array(DataField).meta({ description: 'Fields and their classes.', example: [] }),
  })
  .meta({ id: 'DataSchema', description: 'Fields, classes and searchability of a resource type.' })

const DataRecord = z
  .object({
    id: z.string().meta({ description: 'Record id.', example: 'cont_jane' }),
    resourceType: z.string().meta({ description: 'Resource type.', example: 'contacts' }),
    vertical: z.string().meta({ description: 'Vertical.', example: 'crm' }),
    platform: z.string().meta({ description: 'Platform slug.', example: 'hubspot' }),
    connectionId: z.string().meta({
      description: 'Connection id.',
      example: '9f8e7d6c-1a2b-4c3d-8e9f-0a1b2c3d4e5f',
    }),
    fetchedAt: z.string().nullable().meta({
      description: 'When the record was fetched (ISO 8601).',
      example: '2026-03-01T10:00:00.000Z',
    }),
    updatedAt: z.string().nullable().meta({
      description: 'When the stored row was last written (ISO 8601).',
      example: '2026-03-01T10:00:00.000Z',
    }),
    changedAt: z.string().nullable().meta({
      description: 'When the record content last changed (ISO 8601).',
      example: '2026-03-01T10:00:00.000Z',
    }),
    normVersion: z.string().nullable().meta({
      description: 'Normaliser version that wrote the record.',
      example: '1',
    }),
    data: z.record(z.string(), z.unknown()).meta({
      description:
        'The canonical record, masked by field classification: personal data masked unless revealed, secrets removed.',
      example: { id: 'cont_jane', email: 'j***@acme.example', title: 'CFO' },
    }),
  })
  .meta({ id: 'DataRecord', description: 'One stored record, masked for the caller.' })

const DataRecordMeta = z
  .object({
    piiRevealed: z.boolean().meta({ description: 'Personal data is unmasked.', example: false }),
    financialMasked: z
      .boolean()
      .meta({ description: 'Financial fields are masked.', example: false }),
    classified: z.boolean().meta({ description: 'The type is classified.', example: true }),
  })
  .meta({ id: 'DataRecordMeta', description: 'How a stored record was masked.' })

const DataRecordPageMeta = DataRecordMeta.extend({
  nextCursor: z.string().nullable().meta({
    description: 'Opaque cursor for the next page; null on the last.',
    example: 'eyJ2IjoxfQ',
  }),
  total: z.number().meta({ description: 'Matching records (capped).', example: 1240 }),
  totalCapped: z.boolean().meta({
    description: 'True when `total` hit the count cap (10,000).',
    example: false,
  }),
}).meta({ id: 'DataRecordPageMeta', description: 'Pagination and masking of a record page.' })

const ConnTypeParams = z.object({ id: z.string(), type: z.string() })
const RecordParams = ConnTypeParams.extend({ rid: z.string() })

const ListQuery = z.object({
  cursor: z.string().optional().meta({
    description: 'Cursor from the previous page’s `meta.nextCursor`.',
    example: 'eyJ2IjoxfQ',
  }),
  limit: z
    .string()
    .optional()
    .meta({ description: 'Page size, 1–200 (default 50).', example: '50' }),
  sort: z.enum(['updated_at', 'resource_id']).optional().meta({
    description: 'Sort key.',
    example: 'updated_at',
  }),
  dir: z.enum(['asc', 'desc']).optional().meta({ description: 'Sort direction.', example: 'desc' }),
  filters: z.string().optional().meta({
    description:
      'JSON array of `{ path, op, value }` with `op` one of `eq`, `contains`, `gt`, `lt`, `is_null`. Only searchable fields (see the schema route) are accepted.',
    example: '[{"path":"title","op":"contains","value":"CFO"}]',
  }),
  q: z.string().optional().meta({
    description: 'Free-text search over the record id and every searchable field.',
    example: 'acme',
  }),
})

const ExportQuery = ListQuery.omit({ cursor: true, limit: true }).extend({
  format: z.enum(['csv', 'ndjson']).optional().meta({
    description: 'Export format (default `csv`).',
    example: 'csv',
  }),
  include_pii: z.enum(['true', 'false']).optional().meta({
    description: 'Export personal data unmasked. Requires `data:read_pii`; audited.',
    example: 'false',
  }),
})

const RevealBody = z
  .object({
    reason: z.string().trim().max(500).optional().meta({
      description: 'Why you need the unmasked record; recorded in the audit log.',
      example: 'Support ticket #4821',
    }),
  })
  .meta({ id: 'DataRevealBody', description: 'Request body to reveal a stored record.' })

type ListQueryT = z.infer<typeof ListQuery>

function listParams(q: ListQueryT | undefined): Record<string, string | undefined> {
  return {
    cursor: q?.cursor,
    limit: q?.limit,
    sort: q?.sort,
    dir: q?.dir,
    filters: q?.filters,
    q: q?.q,
  }
}

export function createDataRoutes(
  unifiedClient: UnifiedClient,
  adminStore: AdminStore,
  runtimeSettings?: RuntimeSettingsStore,
) {
  const scopeFor = async (request: FastifyRequest, revealPii = false) =>
    buildDataScope(request, { revealPii, maskFinancial: await readMaskFinancial(runtimeSettings) })

  return async function dataRoutes(fastify: FastifyInstance): Promise<void> {
    fastify.addHook('preHandler', fastify.authenticate)

    fastify.get(
      '/api/data/summary',
      {
        preHandler: [requirePermission('data:read')],
        schema: {
          tags: [TAG],
          summary: 'Summarise stored data per connection',
          description:
            'List every connection in your tenant scope with the resource types the data store holds for it: record counts, the newest change and when each type was last fully synced. Requires `data:read`. Answers `409` (`DATA_STORE_DISABLED`) when the deployment runs in passthrough mode.',
          operationId: 'data.summary',
          response: {
            200: z.object({ data: z.array(DataConnectionSummary) }),
            401: errorBody,
            403: errorBody,
            409: errorBody,
          },
        },
      },
      async (request, reply) => {
        try {
          return await unifiedClient.getDataSummary(await scopeFor(request))
        } catch (err) {
          return passUpstreamError(reply, err)
        }
      },
    )

    fastify.get<{ Params: { vertical: string; type: string } }>(
      '/api/data/schema/:vertical/:type',
      {
        preHandler: [requirePermission('data:read')],
        schema: {
          tags: [TAG],
          summary: 'Describe a stored resource type',
          description:
            'Fields of a stored resource type with their classification (`public`, `internal`, `pii`, `financial`, `secret`) and whether you may filter on them. Requires `data:read`. `404` for an unknown type or one outside your scope.',
          operationId: 'data.schema',
          params: z.object({ vertical: z.string(), type: z.string() }),
          response: {
            200: dataEnvelope(DataSchema),
            401: errorBody,
            403: errorBody,
            404: errorBody,
          },
        },
      },
      async (request, reply) => {
        try {
          const data = await unifiedClient.getDataSchema(
            await scopeFor(request),
            request.params.vertical,
            request.params.type,
          )
          return { data }
        } catch (err) {
          return passUpstreamError(reply, err)
        }
      },
    )

    fastify.get<{ Params: { id: string; type: string }; Querystring: ListQueryT }>(
      '/api/data/connections/:id/resources/:type',
      {
        preHandler: [requirePermission('data:read')],
        schema: {
          tags: [TAG],
          summary: 'List stored records',
          description:
            'One cursor-paginated page of stored records of a type on a connection, masked by field classification (personal data is never revealed here). Supports `filters`, free-text `q`, `sort` and `dir`. Requires `data:read`. `404` when the connection is unknown or outside your tenant scope; `400` `FIELD_NOT_SEARCHABLE` for a filter on a field you may not search; `409` in passthrough mode.',
          operationId: 'data.records.list',
          params: ConnTypeParams,
          querystring: ListQuery,
          response: {
            200: z.object({ data: z.array(DataRecord), meta: DataRecordPageMeta }),
            400: errorBody,
            401: errorBody,
            403: errorBody,
            404: errorBody,
            409: errorBody,
          },
        },
      },
      async (request, reply) => {
        try {
          const page = await unifiedClient.listDataRecords(
            await scopeFor(request),
            request.params.id,
            request.params.type,
            listParams(request.query),
          )
          return sendJson(reply, { data: page.data.map(presentRecord), meta: page.meta })
        } catch (err) {
          return passUpstreamError(reply, err)
        }
      },
    )

    fastify.get<{
      Params: { id: string; type: string }
      Querystring: z.infer<typeof ExportQuery>
    }>(
      '/api/data/connections/:id/resources/:type/export',
      {
        preHandler: [requirePermission('data:export')],
        schema: {
          tags: [TAG],
          summary: 'Export stored records as CSV or NDJSON',
          description:
            'Stream every stored record of a type on a connection (up to 100,000) as a `csv` or `ndjson` attachment, masked like the list. `include_pii=true` exports personal data unmasked and additionally requires `data:read_pii`. Requires `data:export`. Every export is written to the audit log as `data.export`.',
          operationId: 'data.records.export',
          params: ConnTypeParams,
          querystring: ExportQuery,
          response: {
            400: errorBody,
            401: errorBody,
            403: errorBody,
            404: errorBody,
            409: errorBody,
          },
        },
      },
      async (request, reply) => {
        const q = request.query ?? {}
        const includePii = q.include_pii === 'true'
        if (includePii && !(await callerPermissions(request)).has('data:read_pii')) {
          return reply
            .status(403)
            .send({ error: 'Forbidden — exporting personal data needs data:read_pii' })
        }
        const format = q.format === 'ndjson' ? 'ndjson' : 'csv'
        let opened: Awaited<ReturnType<UnifiedClient['openDataExport']>>
        try {
          opened = await unifiedClient.openDataExport(
            await scopeFor(request, includePii),
            request.params.id,
            request.params.type,
            {
              format,
              sort: q.sort,
              dir: q.dir,
              filters: q.filters,
              q: q.q,
              reveal: includePii ? 'pii' : undefined,
            },
          )
        } catch (err) {
          return passUpstreamError(reply, err)
        }
        await adminStore.writeAudit({
          userId: request.jwtUser!.id,
          action: 'data.export',
          targetId: request.params.id,
          detail: {
            connectionId: request.params.id,
            resourceType: request.params.type,
            format,
            includePii,
          },
        })
        for (const [k, v] of Object.entries(opened.headers)) reply.header(k, v)
        reply.header('cache-control', 'no-store')
        return reply.send(opened.stream)
      },
    )

    fastify.get<{ Params: { id: string; type: string; rid: string } }>(
      '/api/data/connections/:id/resources/:type/:rid',
      {
        preHandler: [requirePermission('data:read')],
        schema: {
          tags: [TAG],
          summary: 'Read one stored record (masked)',
          description:
            'One stored record with its row metadata, masked by field classification. To see personal data use the `reveal` route. Requires `data:read`. `404` when the connection, type or record is unknown or outside your scope.',
          operationId: 'data.records.get',
          params: RecordParams,
          response: {
            200: z.object({ data: DataRecord, meta: DataRecordMeta }),
            401: errorBody,
            403: errorBody,
            404: errorBody,
            409: errorBody,
          },
        },
      },
      async (request, reply) => {
        try {
          const rec = await unifiedClient.getDataRecord(
            await scopeFor(request),
            request.params.id,
            request.params.type,
            request.params.rid,
            false,
          )
          reply.header('cache-control', 'no-store')
          return sendJson(reply, { data: presentRecord(rec.data), meta: rec.meta })
        } catch (err) {
          return passUpstreamError(reply, err)
        }
      },
    )

    fastify.post<{
      Params: { id: string; type: string; rid: string }
      Body: z.infer<typeof RevealBody>
    }>(
      '/api/data/connections/:id/resources/:type/:rid/reveal',
      {
        preHandler: [requirePermission('data:read'), requirePermission('data:read_pii')],
        schema: {
          tags: [TAG],
          summary: 'Reveal the personal data in one stored record',
          description:
            'The stored record with personal data unmasked (secrets are still removed; financial fields follow `data_access.mask_financial`). Requires `data:read` and `data:read_pii`. Every reveal is written to the audit log as `data.pii_reveal`, with the optional `reason`, before the record is returned. The response is `Cache-Control: no-store`.',
          operationId: 'data.records.reveal',
          params: RecordParams,
          body: RevealBody,
          response: {
            200: z.object({ data: DataRecord, meta: DataRecordMeta }),
            400: errorBody,
            401: errorBody,
            403: errorBody,
            404: errorBody,
            409: errorBody,
          },
        },
      },
      async (request, reply) => {
        const { id, type, rid } = request.params
        let rec: Awaited<ReturnType<UnifiedClient['getDataRecord']>>
        try {
          rec = await unifiedClient.getDataRecord(
            await scopeFor(request, true),
            id,
            type,
            rid,
            true,
          )
        } catch (err) {
          return passUpstreamError(reply, err)
        }
        // Audited BEFORE the data leaves: if the audit write fails the
        // request fails, and nothing unmasked was shown.
        const vertical = typeof rec.data['vertical'] === 'string' ? rec.data['vertical'] : null
        await adminStore.writeAudit({
          userId: request.jwtUser!.id,
          action: 'data.pii_reveal',
          vertical,
          targetId: rid,
          detail: {
            connectionId: id,
            resourceType: type,
            resourceId: rid,
            reason: request.body?.reason?.trim() || null,
          },
        })
        reply.header('cache-control', 'no-store')
        return sendJson(reply, { data: presentRecord(rec.data), meta: rec.meta })
      },
    )
  }
}
