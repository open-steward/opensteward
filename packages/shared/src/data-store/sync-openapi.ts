/**
 * OpenAPI path builders for the per-vertical `/sync` routes mounted by
 * `createSyncRouter`. Each vertical's `openapi.ts` spreads these into its
 * `paths` block; the unified spec ends up with one set per vertical at
 * `/v1/{vertical}/sync` (e.g. `/v1/accounting/sync`).
 *
 * Auth: tenant-scoped Bearer key with `vertical:<vertical>` scope. The
 * `connection_id` query param is required by the auth middleware so the
 * tenant ↔ connection ownership check can run.
 */

export interface SyncOpenapiOptions {
  /** Vertical slug, e.g. `accounting`. Used in path prefix + tag name. */
  vertical: string
  /** Reference to the response envelope used for 4xx errors. Defaults to
   *  `#/components/responses/BadRequest` etc. */
  refs?: {
    badRequest?: string
    forbidden?: string
    notFound?: string
  }
}

/**
 * Named whole-body `examples` for the sync-job poll/GET response
 * (`{ data: SyncJob }`). One job (`sync_1042`) walked through its four
 * lifecycle states — only `status` / `progress` / `error` / the timestamps
 * vary; the connection / xero / acme values stay fixed. One builder covers
 * every vertical (the `vertical` field is parameterised).
 */
function syncJobPollExamples(vertical: string): Record<string, unknown> {
  const base = {
    id: 'sync_1042',
    vertical,
    connectionId: '1b9d6bcd-bf5c-4a3e-9b2a-2f4e8c7d1a90',
    platform: 'xero',
    tenantId: 'acme',
    callbackUrl: 'https://hooks.acme.example/sync',
    createdAt: '2026-01-15T09:30:00Z',
  }
  return {
    pending: {
      summary: 'Queued — worker has not started yet',
      value: {
        data: {
          ...base,
          status: 'pending',
          progress: null,
          error: null,
          startedAt: null,
          completedAt: null,
        },
      },
    },
    running: {
      summary: 'In flight — some resources synced, others still pending',
      value: {
        data: {
          ...base,
          status: 'running',
          progress: {
            invoices: { synced: 128, status: 'completed' },
            contacts: { synced: 64, status: 'running' },
            bills: { synced: 0, status: 'pending' },
          },
          error: null,
          startedAt: '2026-01-15T09:30:00Z',
          completedAt: null,
        },
      },
    },
    completed: {
      summary: 'Finished — every resource synced',
      value: {
        data: {
          ...base,
          status: 'completed',
          progress: {
            invoices: { synced: 128, status: 'completed' },
            contacts: { synced: 64, status: 'completed' },
            bills: { synced: 42, status: 'completed' },
          },
          error: null,
          startedAt: '2026-01-15T09:30:00Z',
          completedAt: '2026-02-01T14:20:00Z',
        },
      },
    },
    failed: {
      summary: 'Aborted — upstream error surfaced on the job',
      value: {
        data: {
          ...base,
          status: 'failed',
          progress: {
            invoices: { synced: 128, status: 'completed' },
            contacts: { synced: 0, status: 'failed', error: 'rate limited by upstream' },
          },
          error: 'rate limited by upstream',
          startedAt: '2026-01-15T09:30:00Z',
          completedAt: '2026-02-01T14:20:00Z',
        },
      },
    },
  }
}

export function buildSyncOpenapiPaths(opts: SyncOpenapiOptions): Record<string, unknown> {
  const { vertical, refs } = opts
  const tag = 'Sync'
  // Per-vertical specs are merged by the unified generator which prefixes
  // every `/v1/*` path with the vertical segment. We emit `/v1/sync` here
  // and the generator turns it into `/v1/<vertical>/sync`.
  const prefix = '/v1'

  const errorRefs = {
    badRequest: refs?.badRequest ?? '#/components/responses/BadRequest',
    forbidden: refs?.forbidden ?? '#/components/responses/Forbidden',
    notFound: refs?.notFound ?? '#/components/responses/NotFound',
  }

  const connectionIdParam = {
    name: 'connection_id',
    in: 'query',
    required: true,
    description: `UUID of the connection to sync. Tenant ownership verified by auth middleware.`,
    schema: { type: 'string', format: 'uuid' },
  }

  return {
    [`${prefix}/sync`]: {
      post: {
        tags: [tag],
        summary: `Create a background sync job for the ${vertical} vertical`,
        description: `Enqueues a job that walks the vertical's listable resources and bulk-upserts canonical rows into the local cache. Requires \`dataStore.mode != passthrough\` — passthrough deployments return 404 (route not mounted).\n\nAuth: tenant-scoped Bearer key with \`vertical:${vertical}\` (or \`vertical:read\`) scope. \`vertical:write\` is NOT required — a sync only fills the local cache and never writes upstream — except when supplying \`callback_url\`, which makes the deployment call out to an address of your choosing and additionally requires \`vertical:write\`. A \`callback_url\` must be https and must not point at a loopback, private or link-local address.\n\nIf you do not need a callback — which is the case for any read-only key — send an empty JSON object as the body. The body is optional but an empty one is not: a request that sets \`Content-Type: application/json\` and sends nothing is rejected with \`400 Body cannot be empty\`, and most clients set that header automatically. So send \`{}\`, or omit both the body and the header: \`curl -X POST -H 'Content-Type: application/json' '$BASE/v1/${vertical}/sync?connection_id=<uuid>' -d '{}'\`.`,
        parameters: [connectionIdParam],
        requestBody: {
          required: false,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  callback_url: {
                    type: 'string',
                    format: 'uri',
                    description:
                      'Optional URL to POST `sync.completed` / `sync.failed` events to. Retries up to 3× with exponential backoff.',
                  },
                },
              },
            },
          },
        },
        responses: {
          '202': {
            description: 'Job accepted (status `pending`).',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    data: { $ref: '#/components/schemas/SyncJob' },
                  },
                },
              },
            },
          },
          '400': { $ref: errorRefs.badRequest },
          '404': { $ref: errorRefs.notFound },
          '409': {
            description:
              'A pending or running sync already exists for this connection. The body returns the existing `SyncJob`.',
          },
        },
      },
      get: {
        tags: [tag],
        summary: `List sync jobs for one ${vertical} connection`,
        parameters: [
          connectionIdParam,
          {
            name: 'status',
            in: 'query',
            description: 'Filter by job status.',
            schema: { type: 'string', enum: ['pending', 'running', 'completed', 'failed'] },
          },
          {
            name: 'limit',
            in: 'query',
            description: 'Page size (default 25, max 100).',
            schema: { type: 'integer', minimum: 1, maximum: 100 },
          },
        ],
        responses: {
          '200': {
            description: 'Success',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    data: { type: 'array', items: { $ref: '#/components/schemas/SyncJob' } },
                  },
                },
              },
            },
          },
          '400': { $ref: errorRefs.badRequest },
          '403': { $ref: errorRefs.forbidden },
        },
      },
    },
    [`${prefix}/sync/{jobId}`]: {
      get: {
        tags: [tag],
        summary: `Get a ${vertical} sync job by id`,
        description: `Fetch one sync job. \`connection_id\` is required even though \`jobId\` identifies the job on its own: every /v1/${vertical}/* route is gated by the unified auth middleware, which resolves the connection before routing to determine the platform adapter and to verify tenant ownership. The handler also 404s a job belonging to a different connection.`,
        parameters: [
          {
            ...connectionIdParam,
            description:
              'UUID of the connection the job belongs to. Required by the auth middleware for every vertical route; also scopes the lookup, so a job id from another connection returns 404.',
          },
          { name: 'jobId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        responses: {
          '200': {
            description: 'Success',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    data: { $ref: '#/components/schemas/SyncJob' },
                  },
                },
                examples: syncJobPollExamples(vertical),
              },
            },
          },
          '404': { $ref: errorRefs.notFound },
        },
      },
    },
  }
}

export function buildSyncOpenapiSchemas(): Record<string, unknown> {
  return {
    SyncJob: {
      type: 'object',
      description: 'Background sync job. Created by `POST /v1/{vertical}/sync`.',
      properties: {
        id: { type: 'string', format: 'uuid', example: 'sync_1042' },
        vertical: { type: 'string', example: 'accounting' },
        connectionId: {
          type: 'string',
          format: 'uuid',
          example: '1b9d6bcd-bf5c-4a3e-9b2a-2f4e8c7d1a90',
        },
        platform: { type: 'string', example: 'xero' },
        tenantId: { type: 'string', nullable: true, example: 'acme' },
        status: {
          type: 'string',
          enum: ['pending', 'running', 'completed', 'failed'],
          example: 'completed',
        },
        progress: {
          type: 'object',
          nullable: true,
          additionalProperties: {
            type: 'object',
            properties: {
              synced: { type: 'integer', example: 128 },
              status: {
                type: 'string',
                enum: ['pending', 'running', 'completed', 'skipped', 'failed'],
                example: 'completed',
              },
              error: { type: 'string', example: 'rate limited by upstream' },
            },
          },
        },
        error: { type: 'string', nullable: true, example: null },
        callbackUrl: {
          type: 'string',
          format: 'uri',
          nullable: true,
          example: 'https://hooks.acme.example/sync',
        },
        createdAt: { type: 'string', format: 'date-time', example: '2026-01-15T09:30:00Z' },
        startedAt: {
          type: 'string',
          format: 'date-time',
          nullable: true,
          example: '2026-01-15T09:30:00Z',
        },
        completedAt: {
          type: 'string',
          format: 'date-time',
          nullable: true,
          example: '2026-02-01T14:20:00Z',
        },
        // OpenAPI 3.1: null is a type, not a `nullable` flag.
        origin: {
          type: ['string', 'null'],
          enum: ['manual', 'api', 'connect', 'boot', 'schedule', null],
          description:
            "Why the job was queued: `api` (POST /v1/{vertical}/sync), `manual` (the admin console), `connect` (right after a Connect Link), `boot` (DATA_STORE_AUTO_SYNC_ON_BOOT) or `schedule` (the connection's sync schedule). Null on jobs queued before this field existed.",
          example: 'schedule',
        },
      },
      required: ['id', 'vertical', 'connectionId', 'platform', 'status', 'createdAt'],
    },
  }
}
