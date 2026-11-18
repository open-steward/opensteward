/**
 * OpenAPI fragment describing the unified service's control plane:
 *   - /health
 *   - /admin/connections (+ /admin/connections/{id}) — operator surface
 *   - /v1/connections (+ /v1/connections/{id}) — tenant dev surface (test-able)
 *   - /v1/events — verified inbound event stream (test-able)
 *   - /auth/{vertical}/{platform}/{connect, callback, {connectionId}}
 *   - /v1/platforms (+ /v1/platforms/{vertical}/{slug})
 *   - /admin/platforms (+ /admin/platforms/{vertical}/{slug}/{enable, disable, config})
 *
 * The unified generator merges these AFTER the per-vertical fragments so
 * any auth/connections/health entries that survived the per-vertical
 * merge are overwritten with the canonical unified shapes.
 */

const verticalPathParam = {
  name: 'vertical',
  in: 'path',
  required: true,
  description:
    'Vertical name (`accounting`, `crm`, `ecommerce`, `logistics`, `payments`, `docsign`, `projects`, `customer-support`, `inventory`).',
  schema: { $ref: '#/components/schemas/Vertical' },
}

const platformPathParam = {
  name: 'platform',
  in: 'path',
  required: true,
  description: 'Adapter slug for the upstream platform (e.g. `fortnox`, `shopify`).',
  schema: { type: 'string' },
}

const connectionIdPathParam = {
  name: 'id',
  in: 'path',
  required: true,
  description: 'Connection UUID.',
  schema: { type: 'string', format: 'uuid' },
}

const slugPathParam = {
  name: 'slug',
  in: 'path',
  required: true,
  description: 'Adapter slug.',
  schema: { type: 'string' },
}

// Sync schedules — the values of `SYNC_MODES`, `SYNC_INTERVAL_MIN_MINUTES`
// and `SYNC_INTERVAL_MAX_MINUTES` in @opensteward/shared's sync-schedule.ts.
const SYNC_MODE_VALUES = ['default', 'custom', 'trigger_only', 'once']
const SYNC_INTERVAL_MIN = 15
const SYNC_INTERVAL_MAX = 43_200

const connectionSchema = {
  type: 'object',
  required: ['id', 'vertical', 'platform', 'status', 'createdAt', 'updatedAt'],
  properties: {
    id: { type: 'string', format: 'uuid', example: '1b9d6bcd-bf5c-4a3e-9b2a-2f4e8c7d1a90' },
    vertical: { $ref: '#/components/schemas/Vertical' },
    platform: { type: 'string', example: 'xero' },
    tenantId: {
      type: ['string', 'null'],
      description:
        "The OAuth provider's tenant id (e.g. Xero org id). Distinct from `ownerTenantId`.",
      example: 'acme',
    },
    ownerTenantId: {
      type: ['string', 'null'],
      description:
        'Deployment tenant that owns this connection. Set at OAuth-callback time when a Connect Link session was used; null for connections created via admin tooling.',
      example: 'acme',
    },
    label: { type: ['string', 'null'], example: 'Acme — Xero' },
    status: { type: 'string', enum: ['active', 'expired', 'revoked'], example: 'active' },
    expiresAt: { type: ['string', 'null'], format: 'date-time', example: '2026-02-01T14:20:00Z' },
    createdAt: { type: 'string', format: 'date-time', example: '2026-01-15T09:30:00Z' },
    updatedAt: { type: 'string', format: 'date-time', example: '2026-02-01T14:20:00Z' },
    syncMode: {
      type: 'string',
      enum: SYNC_MODE_VALUES,
      description:
        "How often the connection's data is re-synced: `default` (every deployment interval, the `data_store.sync.default_interval_minutes` runtime setting), `custom` (every `syncIntervalMinutes`), `trigger_only` (only when a sync is requested — never automatically, not even when connected) or `once` (one automatic sync when connected, then only on request).",
      example: 'default',
    },
    syncIntervalMinutes: {
      type: ['integer', 'null'],
      minimum: SYNC_INTERVAL_MIN,
      maximum: SYNC_INTERVAL_MAX,
      description: 'Minutes between syncs for a `custom` schedule; null for every other mode.',
      example: null,
    },
  },
}

/**
 * A connection's schedule as the scheduler sees it. The operator routes compute
 * it with the scheduler's own function, so `nextSyncAt` is what will happen.
 */
const connectionSyncStateSchema = {
  type: 'object',
  description:
    "A connection's sync schedule and history, computed exactly as the sync scheduler computes it. Times are epoch milliseconds.",
  required: [
    'mode',
    'intervalMinutes',
    'effectiveIntervalMinutes',
    'defaultIntervalMinutes',
    'lastSyncedAt',
    'lastAttemptAt',
    'lastStatus',
    'consecutiveFailures',
    'active',
    'nextSyncAt',
    'pausedReason',
  ],
  properties: {
    mode: { type: 'string', enum: SYNC_MODE_VALUES, example: 'default' },
    intervalMinutes: {
      type: ['integer', 'null'],
      description: "The connection's own interval; null unless `mode` is `custom`.",
      example: null,
    },
    effectiveIntervalMinutes: {
      type: ['integer', 'null'],
      description:
        "The interval that applies: the custom one, or the deployment's for `default`. Null for modes that never repeat (`trigger_only`, `once`).",
      example: 360,
    },
    defaultIntervalMinutes: {
      type: 'integer',
      description:
        'The deployment interval (`data_store.sync.default_interval_minutes`), so a console can label the Default choice.',
      example: 360,
    },
    lastSyncedAt: {
      type: ['integer', 'null'],
      description: 'When the newest completed sync finished. Null when none has.',
      example: 1790000000000,
    },
    lastAttemptAt: {
      type: ['integer', 'null'],
      description: 'When the newest finished sync, completed or failed, finished.',
      example: 1790000000000,
    },
    lastStatus: {
      type: ['string', 'null'],
      enum: ['completed', 'failed', null],
      description: "That sync's outcome.",
      example: 'completed',
    },
    consecutiveFailures: {
      type: 'integer',
      minimum: 0,
      description:
        'Failed syncs since the newest completed one. A failed sync is retried after 15 minutes, doubling per failure, never later than the interval.',
      example: 0,
    },
    active: {
      type: 'boolean',
      description: 'A sync is pending or running now.',
      example: false,
    },
    nextSyncAt: {
      type: ['integer', 'null'],
      description:
        'When the scheduler will next enqueue a sync. Null when it never will on its own right now: trigger only, a spent one-time sync, a sync in flight, or paused.',
      example: 1790021600000,
    },
    pausedReason: {
      type: ['string', 'null'],
      enum: ['needs_reauthorization', 'platform_error', null],
      description:
        "Why an automatic schedule is on hold: `needs_reauthorization` (the customer must re-authorize) or `platform_error` (the operator must fix the platform's OAuth client). Null when it is not.",
      example: null,
    },
  },
}

/** What the operator connection routes return: `Connection` plus `sync`. */
const adminConnectionSchema = {
  description:
    'A connection as the operator routes (`/admin/connections*`) return it: `Connection` plus the state of its sync schedule.',
  allOf: [
    { $ref: '#/components/schemas/Connection' },
    {
      type: 'object',
      required: ['sync'],
      properties: {
        sync: {
          description:
            'The sync schedule as the scheduler sees it. Null in `passthrough` mode, where nothing syncs — and on the reply to a write whose sync state could not be read afterwards (the write itself succeeded).',
          anyOf: [{ $ref: '#/components/schemas/ConnectionSyncState' }, { type: 'null' }],
        },
      },
    },
  ],
}

/** The body of `PUT /admin/connections/{id}/sync-schedule` — `SyncScheduleSchema`. */
const syncScheduleSchema = {
  type: 'object',
  required: ['mode'],
  additionalProperties: false,
  description:
    "A connection's sync schedule. `intervalMinutes` belongs to `custom` and only to `custom`: it is required there and refused with any other mode.",
  properties: {
    mode: {
      type: 'string',
      enum: SYNC_MODE_VALUES,
      description:
        '`default` — every deployment interval. `custom` — every `intervalMinutes`. `trigger_only` — never automatically; only the admin "Sync now" or `POST /v1/{vertical}/sync`. `once` — one automatic sync when connected, then only on request.',
      example: 'custom',
    },
    intervalMinutes: {
      type: 'integer',
      minimum: SYNC_INTERVAL_MIN,
      maximum: SYNC_INTERVAL_MAX,
      description:
        'Minutes between syncs, 15 minutes to 30 days. Required with `custom`; refused with any other mode.',
      example: 60,
    },
  },
}

const platformSchema = {
  type: 'object',
  required: ['slug', 'vertical', 'name'],
  description:
    'A platform that the integration-server can connect to. The `auth_type` field tells you which `/auth/{vertical}/{platform}/connect` variant to use: `oauth2` / `oauth2_cc` → GET (browser redirect); `api_key` / `basic` / `session` / `local` → POST (JSON body with credentials).',
  properties: {
    slug: {
      type: 'string',
      description:
        'Stable URL-safe identifier (e.g. `fortnox`, `shopify`, `fedex`). Used in path params throughout the API.',
      example: 'xero',
    },
    vertical: { $ref: '#/components/schemas/Vertical' },
    name: {
      type: 'string',
      description: 'Display name (e.g. `Fortnox`, `Shopify`).',
      example: 'Xero',
    },
    description: { type: 'string', example: 'Cloud accounting for small business.' },
    website: { type: 'string', format: 'uri', example: 'https://www.xero.com' },
    category: { type: 'string', example: 'accounting' },
    auth_type: {
      type: 'string',
      enum: ['oauth2', 'oauth2_cc', 'api_key', 'basic', 'session', 'local'],
      description:
        'Authentication mechanism this platform requires. Determines whether to use GET or POST on `/auth/{vertical}/{platform}/connect`. Values: `oauth2` (standard authorization-code OAuth, GET), `oauth2_cc` (OAuth client-credentials, GET), `api_key` (long-lived API key, POST), `basic` (HTTP Basic, POST), `session` (cookie-based session, POST), `local` (no upstream — fixture/test platforms).',
      example: 'oauth2',
    },
    auth_label: {
      type: 'string',
      description:
        'Human-readable label for the auth mechanism — shown on the admin /platforms page (`OAuth 2.0`, `API Key`, etc.).',
      example: 'OAuth 2.0',
    },
    hq_country: { $ref: '#/components/schemas/ISO3166' },
    docs_url: { type: 'string', format: 'uri', example: 'https://developer.xero.com' },
    pricing_url: { type: 'string', format: 'uri', example: 'https://www.xero.com/pricing' },
    primary_color: { $ref: '#/components/schemas/HexColor' },
    founded_year: { type: 'integer', example: 2006 },
    enabled: {
      type: 'boolean',
      description:
        "Whether this platform is enabled on this deployment. When `false`, the platform ships with the binary but the operator has not configured / activated it — `/auth/{vertical}/{platform}/connect` will return 403/404. When `true`, end-user connections can be initiated. Resolved at request time from the deployment's AdapterSettingsStore.",
      example: true,
    },
    unsupported: {
      type: 'object',
      description:
        'Present when the platform is listed and viewable but cannot be enabled or connected — e.g. its OAuth client must be registered inside each customer\'s own instance, or no public API exists. When set, `/auth/{vertical}/{platform}/connect` and `/admin/platforms/{vertical}/{slug}/enable` refuse with `400 PLATFORM_UNSUPPORTED` carrying this same `reason`/`issueUrl`; existing connections keep working. Absent when the platform is fully supported.',
      required: ['reason'],
      properties: {
        reason: {
          type: 'string',
          description: 'Why the platform cannot be connected today.',
          example: "OAuth client must be registered inside each customer's own instance.",
        },
        issueUrl: {
          type: 'string',
          format: 'uri',
          description: 'Tracking issue for adding support, when one exists.',
          example: 'https://example.com/issues/123',
        },
      },
    },
  },
}

const adapterRowSchema = {
  type: 'object',
  required: ['vertical', 'slug', 'enabled', 'hasConfig'],
  properties: {
    vertical: { type: 'string', example: 'accounting' },
    slug: { type: 'string', example: 'xero' },
    enabled: { type: 'boolean', example: true },
    hasConfig: { type: 'boolean', example: true },
    unsupported: {
      type: 'object',
      description:
        'Present when the platform is listed and viewable but cannot be enabled or connected. See `Platform.unsupported`. Absent when the platform is fully supported.',
      required: ['reason'],
      properties: {
        reason: { type: 'string', example: "OAuth client must be registered inside each customer's own instance." },
        issueUrl: {
          type: 'string',
          format: 'uri',
          example: 'https://example.com/issues/123',
        },
      },
    },
  },
}

// Canonical webhook event — the shape each adapter's parseWebhookEvents()
// returns. Fields that appear in every vertical's per-vertical schema are
// kept; vertical-specific resource-type enums live in the
// {Vertical}WebhookEvent schemas merged in from verticals/<v>/openapi.ts.
const webhookEventSchema = {
  type: 'object',
  required: ['platform', 'type', 'resourceId'],
  properties: {
    id: { type: 'string', description: 'Upstream event ID, when provided.', example: 'whs_1042' },
    platform: { type: 'string', description: 'Adapter slug (e.g. `fortnox`).', example: 'xero' },
    type: {
      type: 'string',
      description: 'Dot-notation `resource.action`, e.g. `invoice.created`.',
      example: 'customer.created',
    },
    resourceId: {
      type: 'string',
      description: 'Upstream resource identifier.',
      example: 'cus_4Qm2Xa9Lr',
    },
    resourceType: {
      type: 'string',
      description: 'Canonical resource category per vertical.',
      example: 'customer',
    },
    action: {
      type: 'string',
      enum: ['created', 'updated', 'deleted', 'unknown'],
      example: 'created',
    },
    tenantId: { type: ['string', 'null'], example: 'acme' },
    connectionId: {
      type: 'string',
      format: 'uuid',
      description:
        'Populated during fan-out when the (vertical, platform, tenantId) tuple matches a stored connection.',
      example: '1b9d6bcd-bf5c-4a3e-9b2a-2f4e8c7d1a90',
    },
    payload: {
      type: 'object',
      additionalProperties: true,
      description: 'Verbatim upstream payload — not filtered.',
    },
  },
}

const webhookForwardEnvelopeSchema = {
  type: 'object',
  required: ['events'],
  description:
    'Body POSTed to `webhooks.callbackUrl` when the unified service forwards normalised events.',
  properties: {
    events: {
      type: 'array',
      items: { $ref: '#/components/schemas/WebhookEvent' },
      example: [
        {
          id: 'whs_1042',
          platform: 'xero',
          type: 'customer.created',
          resourceId: 'cus_4Qm2Xa9Lr',
          resourceType: 'customer',
          action: 'created',
          tenantId: 'acme',
          connectionId: '1b9d6bcd-bf5c-4a3e-9b2a-2f4e8c7d1a90',
        },
      ],
    },
  },
}

// A verified inbound platform event as returned by `GET /v1/events`. Distinct
// from `WebhookEvent` (the shape POSTed to a callback): this row carries the
// monotonic `seq` cursor and the persisted resolution fields.
const inboundEventSchema = {
  type: 'object',
  required: [
    'seq',
    'id',
    'vertical',
    'platform',
    'eventType',
    'resourceType',
    'action',
    'resourceId',
    'receivedAt',
  ],
  properties: {
    seq: {
      type: 'integer',
      format: 'int64',
      description: 'Monotonic per-tenant cursor. Page with `?after_seq=<seq>`.',
      example: 1,
    },
    id: { type: 'string', description: 'Event id.', example: 'evt_8sd3k2' },
    tenantId: { type: ['string', 'null'], example: 'acme' },
    vertical: { $ref: '#/components/schemas/Vertical' },
    platform: { type: 'string', description: 'Adapter slug.', example: 'xero' },
    connectionId: {
      type: ['string', 'null'],
      format: 'uuid',
      description: 'The connection the event was fanned out to, when resolved.',
      example: '1b9d6bcd-bf5c-4a3e-9b2a-2f4e8c7d1a90',
    },
    eventType: {
      type: 'string',
      description: 'Dot-notation `resource.action`.',
      example: 'invoice.created',
    },
    resourceType: { type: 'string', example: 'invoices' },
    action: {
      type: 'string',
      enum: ['created', 'updated', 'deleted', 'unknown'],
      example: 'created',
    },
    resourceId: { type: 'string', example: 'inv_1042' },
    receivedAt: {
      type: 'integer',
      format: 'int64',
      description: 'Epoch milliseconds the event was verified and stored.',
      example: 1767225600000,
    },
    payload: {
      type: 'object',
      additionalProperties: true,
      description: 'Verbatim upstream payload — not filtered.',
    },
  },
}

function listResponse(itemRef: string) {
  return {
    type: 'object',
    required: ['data'],
    properties: {
      data: {
        type: 'array',
        items: { $ref: itemRef },
      },
    },
  }
}

function singleResponse(itemRef: string) {
  return {
    type: 'object',
    required: ['data'],
    properties: { data: { $ref: itemRef } },
  }
}

const adminSecretHeader = {
  name: 'X-Admin-Secret',
  in: 'header',
  required: false,
  description: 'Required when ADMIN_SECRET is set on the server.',
  schema: { type: 'string' },
}

const customerIdPathParam = {
  name: 'id',
  in: 'path',
  required: true,
  description: 'Customer (end-user) UUID.',
  schema: { type: 'string', format: 'uuid' },
}

const apiKeySecurity = [{ ApiKeyAuth: [] }]
/**
 * Operator-only. Note this OVERRIDES the spec's default of
 * `[{ ApiKeyAuth: [] }]`, so a dev key is not an alternative — these routes
 * span tenants and want the admin secret specifically.
 */
const adminSecurity = [{ AdminSecret: [] }]

const customerSchema = {
  type: 'object',
  required: ['id', 'tenantId', 'email', 'createdAt', 'updatedAt'],
  description:
    "External customer record owned by your tenant. Connections completed via Connect Link are joined back to this record so you can list a customer's integrations.",
  properties: {
    id: { type: 'string', format: 'uuid', example: 'cus_4Qm2Xa9Lr' },
    tenantId: {
      type: 'string',
      description:
        'Set automatically from the calling API key — body-supplied tenantId is ignored.',
      example: 'acme',
    },
    email: { type: 'string', format: 'email', example: 'jane.doe@acme.example' },
    displayName: { type: ['string', 'null'], example: 'Jane Doe' },
    externalReference: {
      type: ['string', 'null'],
      description: 'Free-form pointer back to your own system (CRM ID, billing ID, etc.).',
      example: 'acme-industries',
    },
    pii: {
      description:
        'Decrypted PII. Only present when the request used `?include_pii=true` AND the API key has the `customers:read_pii` scope.',
      type: ['object', 'null'],
      properties: {
        firstName: { type: 'string', example: 'Jane' },
        lastName: { type: 'string', example: 'Doe' },
        personalIdNumber: { type: 'string', example: '000-00-0000' },
        phone: { $ref: '#/components/schemas/E164' },
        address: {
          type: 'object',
          properties: {
            line1: { type: 'string', example: '2500 Market Street' },
            line2: { type: 'string', example: 'Suite 300' },
            city: { type: 'string', example: 'San Francisco' },
            region: { type: 'string', example: 'CA' },
            postalCode: { type: 'string', example: '94114' },
            country: {
              type: 'string',
              minLength: 2,
              maxLength: 2,
              pattern: '^[A-Z]{2}$',
              example: 'US',
            },
          },
        },
      },
    },
    createdAt: { type: 'integer', description: 'Epoch ms.', example: 1768469400000 },
    updatedAt: { type: 'integer', description: 'Epoch ms.', example: 1769955600000 },
  },
}

const createCustomerBodySchema = {
  type: 'object',
  required: ['email'],
  properties: {
    email: { type: 'string', format: 'email' },
    displayName: { type: 'string', maxLength: 200 },
    externalReference: { type: 'string', maxLength: 200 },
  },
}

const updateCustomerBodySchema = {
  type: 'object',
  properties: {
    displayName: { type: ['string', 'null'], maxLength: 200 },
    externalReference: { type: ['string', 'null'], maxLength: 200 },
  },
}

const connectLinkSchema = {
  type: 'object',
  required: ['id', 'token', 'url', 'expiresAt'],
  description:
    'Hosted Connect Link session. Send the `url` to the customer; once they authorise, a connection is created and tagged back to this customer.',
  properties: {
    id: { type: 'string', format: 'uuid', example: 'cl_8f3a2b9c4d' },
    token: {
      type: 'string',
      description: 'URL-safe token embedded in `url`. Treat as secret.',
      example: 'cl_8f3a2b9c4d',
    },
    url: {
      type: 'string',
      format: 'uri',
      example: 'https://connect.northwind.example/cl_8f3a2b9c4d',
    },
    label: { type: 'string', example: 'Acme onboarding' },
    endUserId: { type: 'string', format: 'uuid', example: 'cus_4Qm2Xa9Lr' },
    allowedVerticals: {
      type: 'array',
      items: { $ref: '#/components/schemas/Vertical' },
      example: ['accounting'],
    },
    allowedPlatforms: {
      type: 'array',
      items: {
        type: 'object',
        required: ['vertical', 'slug'],
        properties: {
          vertical: { $ref: '#/components/schemas/Vertical' },
          slug: {
            type: 'string',
            description: 'Adapter slug. See the `PlatformSlug` schema for the full list.',
            example: 'xero',
          },
        },
      },
    },
    redirectUrl: {
      type: ['string', 'null'],
      format: 'uri',
      example: 'https://app.acme.example/integrations/done',
    },
    expiresAt: { type: 'integer', description: 'Epoch ms.', example: 1769955600000 },
    consumedAt: { type: ['integer', 'null'], example: 1769955600000 },
    connectionId: {
      type: ['string', 'null'],
      format: 'uuid',
      example: '1b9d6bcd-bf5c-4a3e-9b2a-2f4e8c7d1a90',
    },
    status: { type: 'string', enum: ['active', 'consumed', 'expired'], example: 'active' },
  },
}

const capabilitiesSchema = {
  type: 'object',
  required: ['verticals'],
  description: 'What this deployment serves to your credential. Carries no license details.',
  properties: {
    verticals: {
      type: 'array',
      description:
        'Verticals whose `/v1/{vertical}/*` routes answer here, sorted: every vertical the server runs that its license includes. Any other vertical answers 403 `LICENSE_FEATURE_NOT_ENTITLED`.',
      items: { $ref: '#/components/schemas/Vertical' },
      example: ['accounting', 'crm', 'payments'],
    },
  },
}

const createConnectLinkBodySchema = {
  type: 'object',
  description:
    'When `vertical` is supplied without `platform`, the customer can pick any enabled adapter in that vertical. When both are supplied, the link is pinned to a single adapter.',
  properties: {
    label: { type: 'string', maxLength: 200 },
    vertical: { $ref: '#/components/schemas/Vertical' },
    platform: {
      type: 'string',
      description: 'Adapter slug. See the `PlatformSlug` schema for the full list.',
      example: 'fortnox',
    },
    redirectUrl: { type: 'string', format: 'uri' },
    expiresInSeconds: {
      type: 'integer',
      minimum: 1,
      maximum: 90 * 24 * 60 * 60,
      description: 'TTL in seconds. Defaults to 7 days; capped at 90.',
    },
  },
}

// Named whole-body examples for the sync-job poll/GET response
// (`{ data: SyncJob }`). One job (`sync_1042`) walked through its four
// lifecycle states — only status / progress / error / the timestamps vary.
// The `/v1/{vertical}/sync/{jobId}` path is vertical-agnostic, so the `vertical`
// field uses a representative value (`accounting`).
const syncJobPollExamples = (() => {
  const base = {
    id: 'sync_1042',
    vertical: 'accounting',
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
})()

export const controlPlanePaths: Record<string, unknown> = {
  '/health': {
    get: {
      tags: ['Platform'],
      summary: 'Service health',
      description:
        'Returns service status, the registered verticals, and the total enabled-adapter count.',
      security: [],
      responses: {
        '200': {
          description: 'OK',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['status', 'verticals', 'adapters', 'timestamp'],
                properties: {
                  status: { type: 'string', enum: ['ok'] },
                  verticals: { type: 'array', items: { type: 'string' } },
                  adapters: { type: 'integer' },
                  timestamp: { type: 'string', format: 'date-time' },
                },
              },
            },
          },
        },
      },
    },
  },

  // ── Sandbox control surface ────────────────────────────────────────────
  //
  // Absolute keys, so they keep their `/test/v1` inline and pick up the
  // unversioned `servers` override — the same treatment `/health` and
  // `/admin/connections` get. These three (`keys`, `connections`, `reset`)
  // are sandbox-only meta routes with no `/v1` twin, so they are authored
  // absolute rather than stripped; the sandbox variant of the tenant
  // connections/customers/events surfaces comes from the versioned keys via
  // the Servers dropdown, not from here.
  '/test/v1/keys': {
    post: {
      tags: ['Sandbox'],
      operationId: 'sandbox.self-serve-key',
      summary: 'Mint a sandbox API key, self-serve (operator opt-in)',
      description:
        'Unauthenticated, and OFF by default \u2014 answers `403 SANDBOX_SELF_SERVE_DISABLED` until ' +
        'the operator enables `auth.sandbox_self_serve_enabled`. When enabled, mints an ' +
        '`osk_test_\u2026` key (plaintext returned once) bound to a fresh throwaway tenant: it works ' +
        'only on the no-egress `/test/v1/*` sandbox, expires after 7 days, and minting is ' +
        'IP-rate-limited (3/hour). Start with `GET /test/v1/connections` using the new key.',
      security: [],
      requestBody: {
        required: false,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                label: {
                  type: 'string',
                  maxLength: 200,
                  description: 'Optional label; defaults to "self-serve sandbox".',
                },
              },
            },
          },
        },
      },
      responses: {
        '201': {
          description: 'Key minted \u2014 the plaintext appears once, here.',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  data: {
                    type: 'object',
                    properties: {
                      id: { type: 'string' },
                      tenantId: { type: 'string', example: 'sandbox-8f3a2b9c' },
                      plaintext: { type: 'string', example: 'osk_test_sandbox-8f3a2b9c_\u2026' },
                      mode: { type: 'string', enum: ['test'] },
                      expiresAt: { type: 'number', description: 'Epoch ms \u2014 7 days out.' },
                      next: { type: 'string' },
                    },
                  },
                },
              },
            },
          },
        },
        '403': { description: 'Self-serve minting disabled (the default)' },
        '429': { description: 'Per-IP mint budget exhausted' },
        '503': { description: 'Test mode disabled' },
      },
    },
  },

  // The sandbox test issuer. The OIDC counterpart of a test key: minted by
  // the deployment against a test key, accepted on /test/v1/* as a bearer
  // token, refused on /v1/* with KEY_MODE_MISMATCH. Registered on
  // /oauth-clients with the "sandbox" preset so the registry / intersect /
  // token-decides configuration can be rehearsed with no real IdP.
  '/test/oidc/.well-known/openid-configuration': {
    get: {
      tags: ['Sandbox'],
      operationId: 'sandbox.oidc-discovery',
      summary: 'Sandbox test issuer: OIDC discovery',
      description:
        'Discovery document for this deployment’s own test issuer. `issuer` is `<public base>/test/oidc` ' +
        '— the exact string to register on /oauth-clients (preset “OpenSteward test issuer”); ' +
        'the “Test” button there reads `jwks_uri` from here. Unauthenticated.',
      security: [],
      responses: {
        '200': {
          description: 'OK',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  issuer: { type: 'string', example: 'http://localhost:3010/test/oidc' },
                  jwks_uri: { type: 'string', example: 'http://localhost:3010/test/oidc/jwks' },
                  token_endpoint: {
                    type: 'string',
                    example: 'http://localhost:3010/test/oidc/token',
                  },
                  grant_types_supported: {
                    type: 'array',
                    items: { type: 'string' },
                    example: ['client_credentials'],
                  },
                },
              },
            },
          },
        },
        '503': { description: 'Test mode disabled' },
      },
    },
  },

  '/test/oidc/jwks': {
    get: {
      tags: ['Sandbox'],
      operationId: 'sandbox.oidc-jwks',
      summary: 'Sandbox test issuer: signing keys',
      description:
        'The RS256 public key the test issuer signs with. Generated in memory when the server starts — ' +
        'a restart rotates it and every earlier test token stops verifying. Unauthenticated.',
      security: [],
      responses: {
        '200': {
          description: 'OK',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  keys: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        kty: { type: 'string', example: 'RSA' },
                        kid: { type: 'string', example: 'sandbox-1' },
                        alg: { type: 'string', example: 'RS256' },
                        use: { type: 'string', example: 'sig' },
                        n: { type: 'string' },
                        e: { type: 'string', example: 'AQAB' },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        '503': { description: 'Test mode disabled' },
      },
    },
  },

  '/test/oidc/token': {
    post: {
      tags: ['Sandbox'],
      operationId: 'sandbox.oidc-token',
      summary: 'Sandbox test issuer: mint a token (client_credentials)',
      description:
        'Trades a **test API key** for an OIDC bearer token, the way an identity provider trades a ' +
        'client secret for one. `client_id` is the subject the token is minted for; `client_secret` is an ' +
        '`osk_test_…` key (a live key is refused). Also accepts HTTP Basic client authentication. ' +
        'The tenant claim is always the key’s tenant — nothing in the request can widen it.\n\n' +
        'The token carries `iss` = this deployment’s test issuer and works on `/test/v1/*` only; ' +
        '`/v1/*` answers `403 KEY_MODE_MISMATCH`, as it does for a test key. Whether the token is ' +
        '*admitted* is the registered issuer’s configuration — registry (the subject must be a ' +
        'registered service account), intersect, or token-decides — exactly as on `/v1/*`. ' +
        'Requires the test issuer to be registered on /oauth-clients first; answers `400 invalid_request` ' +
        'naming the URL to register otherwise. Errors use the OAuth 2.0 shape (`error`, ' +
        '`error_description`). IP-rate-limited (60/hour).',
      security: [],
      requestBody: {
        required: true,
        content: {
          'application/x-www-form-urlencoded': {
            schema: {
              type: 'object',
              required: ['grant_type', 'client_id', 'client_secret'],
              properties: {
                grant_type: { type: 'string', enum: ['client_credentials'] },
                client_id: {
                  type: 'string',
                  example: 'billing-service',
                  description: 'The subject (`sub` and `azp`) the token is minted for.',
                },
                client_secret: {
                  type: 'string',
                  example: 'osk_test_default_…',
                  description: 'A test API key. Its tenant becomes the token’s tenant claim.',
                },
                scope: {
                  type: 'string',
                  example: 'customers:read vertical:accounting',
                  description:
                    'Space-separated scope claim. Defaults to the key’s scopes. Ignored in registry mode, ' +
                    'narrows the registered set in intersect mode, mapped through scope rules in token-decides mode.',
                },
              },
            },
          },
          'application/json': {
            schema: {
              type: 'object',
              required: ['grant_type', 'client_id', 'client_secret'],
              properties: {
                grant_type: { type: 'string', enum: ['client_credentials'] },
                client_id: { type: 'string', example: 'billing-service' },
                client_secret: { type: 'string', example: 'osk_test_default_…' },
                scope: { type: 'string', example: 'customers:read vertical:accounting' },
              },
            },
          },
        },
      },
      responses: {
        '200': {
          description: 'Token minted',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  access_token: { type: 'string', example: 'eyJhbGciOiJSUzI1NiIsImtpZCI6InNhbmRib3gtMSJ9.…' },
                  token_type: { type: 'string', enum: ['Bearer'] },
                  expires_in: { type: 'integer', example: 3600 },
                  scope: { type: 'string', example: 'customers:read vertical:accounting' },
                },
              },
            },
          },
        },
        '400': { description: 'Unsupported grant, or the test issuer is not registered yet' },
        '401': { description: 'Missing or invalid client credentials (not a test key)' },
        '429': { description: 'Per-IP mint budget exhausted' },
        '503': { description: 'Test mode disabled' },
      },
    },
  },

  '/test/v1/connections': {
    get: {
      tags: ['Sandbox'],
      operationId: 'sandbox.connections',
      summary: 'List sandbox connections',
      description:
        'Every sandbox connection for the calling tenant — one per mounted vertical. **Start here**: every other `/test/v1/*` request needs a `connection_id`, and these are the only ids the sandbox accepts.\n\nRequires a **test-mode** dev key (`osk_test_…`). A live key on this path is `403 KEY_MODE_MISMATCH`, and the reverse is true on `/v1/*` — the two surfaces never share a credential.',
      security: apiKeySecurity,
      responses: {
        '200': {
          description: 'OK',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['data', 'meta'],
                properties: {
                  data: {
                    type: 'array',
                    items: { $ref: '#/components/schemas/SandboxConnection' },
                  },
                  meta: {
                    type: 'object',
                    required: ['total'],
                    properties: { total: { type: 'integer', example: 9 } },
                  },
                },
              },
            },
          },
        },
        '401': {
          description: 'Missing or invalid key',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
        },
        '403': {
          description: 'A live key was used on the sandbox surface (`KEY_MODE_MISMATCH`).',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
        },
        '429': {
          description: 'Rate limited — the sandbox applies the same limits as `/v1/*`.',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
        },
        '503': {
          description:
            'Test mode is switched off for this deployment (`TEST_MODE_DISABLED`). Operators control it with the `features.test_mode_enabled` runtime setting; it takes effect within one settings poll, and leaves `/v1/*` untouched.',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
        },
      },
    },
  },

  '/test/v1/reset': {
    delete: {
      tags: ['Sandbox'],
      operationId: 'sandbox.reset',
      summary: 'Reset the sandbox',
      description:
        "Deletes every sandbox record belonging to the calling tenant. The next read reseeds from the same documented examples the Unified API reference shows, so a suite can reset between runs and get identical data back.\n\nScoped to the tenant on the verified key, never to anything in the request — one tenant cannot reset another's. `/v1/*` data is untouched: the sandbox lives in its own table.",
      security: apiKeySecurity,
      responses: {
        '200': {
          description: 'OK',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['data'],
                properties: {
                  data: {
                    type: 'object',
                    required: ['deleted'],
                    properties: {
                      deleted: {
                        type: 'integer',
                        description: 'How many records were removed.',
                        example: 312,
                      },
                    },
                  },
                },
              },
            },
          },
        },
        '401': {
          description: 'Missing or invalid key',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
        },
        '403': {
          description: 'A live key was used on the sandbox surface (`KEY_MODE_MISMATCH`).',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
        },
        '429': {
          description: 'Rate limited.',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
        },
        '503': {
          description: 'Test mode is switched off for this deployment (`TEST_MODE_DISABLED`).',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
        },
      },
    },
  },

  '/test/v1/auth/{vertical}/{platform}/connect': {
    get: {
      tags: ['Sandbox'],
      operationId: 'sandbox.auth-connect',
      summary: 'Start the mock OAuth ceremony',
      description: [
        'The sandbox stand-in for `GET /auth/{vertical}/{platform}/connect`. The live ceremony needs an enabled adapter with real OAuth client config and a live provider; the sandbox simulates the whole dance against the synthetic `sandbox` platform with **no outbound request**.',
        '',
        'Without `outcome`, responds `302` to a hosted mock authorize page (Approve / Deny buttons) — the browser journey. With `outcome`, skips the page and drives the flow programmatically:',
        '',
        '- `granted` → 302 straight to the callback with a valid `code` + `state` → the callback answers `201` with the **derived sandbox connection id**.',
        '- `denied` → callback answers `400 OAUTH_ACCESS_DENIED` (no id).',
        '- `error` → callback answers `400 OAUTH_PROVIDER_ERROR` (no id).',
        '- `expired` → the callback receives a state that was never stored → `400 INVALID_STATE`, exactly what an expired live state looks like.',
        '',
        "`tenant_id` is required — the ceremony derives the connection id from it, the same UUIDv5 derivation as `GET /test/v1/connections`. Only `platform = 'sandbox'` exists; any other slug answers the live-shaped `404 ADAPTER_UNAVAILABLE`. Unauthenticated by design (browser ceremony, like the live `/auth` GETs), gated by the test-mode flag and an IP rate limit.",
      ].join('\n'),
      security: [],
      parameters: [
        verticalPathParam,
        {
          name: 'platform',
          in: 'path',
          required: true,
          description: 'Always `sandbox` — the only platform the sandbox serves.',
          schema: { type: 'string', enum: ['sandbox'] },
        },
        {
          name: 'tenant_id',
          in: 'query',
          required: true,
          description: 'Tenant whose derived sandbox connection the ceremony grants.',
          schema: { type: 'string', example: 'default' },
        },
        {
          name: 'label',
          in: 'query',
          description: 'Optional label echoed on the granted connection.',
          schema: { type: 'string' },
        },
        {
          name: 'outcome',
          in: 'query',
          description: 'Skip the hosted authorize page and drive the flow programmatically.',
          schema: { type: 'string', enum: ['granted', 'denied', 'error', 'expired'] },
        },
      ],
      responses: {
        '302': {
          description:
            'Redirect — to the hosted mock authorize page (no `outcome`) or directly to the callback (`outcome` given).',
        },
        '400': {
          description: 'MISSING_PARAMS (no tenant_id), INVALID_OUTCOME, or INVALID_LINK_TOKEN',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
        },
        '404': {
          description: "ADAPTER_UNAVAILABLE — platform is not 'sandbox' or unknown vertical",
          content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
        },
        '503': {
          description: 'TEST_MODE_DISABLED',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
        },
      },
    },
  },

  '/test/v1/auth/{vertical}/{platform}/callback': {
    get: {
      tags: ['Sandbox'],
      operationId: 'sandbox.auth-callback',
      summary: 'Complete the mock OAuth ceremony',
      description: [
        'Where the mock authorize page (or an `outcome`-driven redirect) lands. Consumes the one-time `state` — a replayed, expired, or unknown state answers `400 INVALID_STATE`, and a state started for a different vertical answers `400 STATE_MISMATCH`, mirroring the live CSRF guard.',
        '',
        'On success the response is `201` with the **derived** sandbox connection id — the same id `GET /test/v1/connections` lists for that tenant and vertical. The sandbox never mints new connection ids; denied/error outcomes return an error payload and no id. (A flow started from a sandbox Connect Link 302s to the hosted done page instead of returning JSON, mirroring the live Connect Link branch.)',
      ].join('\n'),
      security: [],
      parameters: [
        verticalPathParam,
        {
          name: 'platform',
          in: 'path',
          required: true,
          schema: { type: 'string', enum: ['sandbox'] },
        },
        {
          name: 'code',
          in: 'query',
          description: 'The mock authorization code (any `sbx_…` value the connect leg issued).',
          schema: { type: 'string' },
        },
        {
          name: 'state',
          in: 'query',
          required: true,
          description: 'One-time CSRF state issued by the connect leg.',
          schema: { type: 'string' },
        },
        {
          name: 'error',
          in: 'query',
          description: 'Provider-style error instead of a code: `access_denied` or `server_error`.',
          schema: { type: 'string', enum: ['access_denied', 'server_error'] },
        },
      ],
      responses: {
        '201': {
          description: 'Mock connection granted',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['data'],
                properties: {
                  data: {
                    type: 'object',
                    required: ['id', 'vertical', 'platform', 'tenantId', 'status'],
                    properties: {
                      id: {
                        type: 'string',
                        format: 'uuid',
                        description:
                          'The DERIVED sandbox connection id — identical to the one `GET /test/v1/connections` lists for this tenant + vertical.',
                        example: 'ed57733f-b65b-56fc-93a9-5654d3183944',
                      },
                      vertical: { $ref: '#/components/schemas/Vertical' },
                      platform: { type: 'string', enum: ['sandbox'] },
                      tenantId: { type: 'string', example: 'default' },
                      label: { type: ['string', 'null'] },
                      status: { type: 'string', enum: ['connected'] },
                    },
                  },
                },
              },
            },
          },
        },
        '302': { description: 'Connect Link flow — redirect to the hosted done page.' },
        '400': {
          description:
            'MISSING_PARAMS, INVALID_STATE (unknown / expired / replayed), STATE_MISMATCH, OAUTH_ACCESS_DENIED, or OAUTH_PROVIDER_ERROR',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
        },
        '503': {
          description: 'TEST_MODE_DISABLED',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
        },
      },
    },
  },

  '/admin/connections': {
    get: {
      tags: ['Admin'],
      summary: 'List connections (operator)',
      description:
        'Returns every stored connection across every vertical. **Operator-only — gated by `X-Admin-Secret`.** Each row carries its `vertical` and `platform`. Tenant-scoped clients should use `GET /v1/connections` (Bearer dev key) instead.',
      parameters: [
        {
          name: 'vertical',
          in: 'query',
          description: 'Filter to one vertical.',
          schema: { $ref: '#/components/schemas/Vertical' },
        },
        {
          name: 'platform',
          in: 'query',
          // Deliberately not an enum: the CLI generator turns query enums
          // into `choices`, and a 1,500-choice flag helps nobody. The
          // `PlatformSlug` component is the list; this is the free-text
          // filter over it.
          description:
            'Filter to one adapter, by slug. See the `PlatformSlug` schema or `GET /v1/platforms` for valid values.',
          schema: { type: 'string', example: 'fortnox' },
        },
        {
          name: 'status',
          in: 'query',
          schema: { type: 'string', enum: ['active', 'expired', 'revoked'] },
        },
      ],
      responses: {
        '200': {
          description: 'OK',
          content: {
            'application/json': { schema: listResponse('#/components/schemas/AdminConnection') },
          },
        },
      },
    },
  },

  '/admin/connections/{id}': {
    get: {
      tags: ['Admin'],
      summary: 'Get a connection (operator)',
      description:
        'Operator-only. Tenant-scoped clients use `GET /v1/connections/{id}` (Bearer + `connections:read` scope).',
      parameters: [connectionIdPathParam],
      responses: {
        '200': {
          description: 'OK',
          content: {
            'application/json': { schema: singleResponse('#/components/schemas/AdminConnection') },
          },
        },
        '404': {
          description: 'Not found',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
        },
      },
    },
    patch: {
      tags: ['Admin'],
      summary: 'Update connection metadata (operator)',
      description:
        'Update `label` or `tenantId`. Operator-only. Tenant-scoped clients use `PATCH /v1/connections/{id}` (Bearer + `connections:write` scope).',
      parameters: [connectionIdPathParam],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                label: { type: ['string', 'null'] },
                tenantId: { type: ['string', 'null'] },
              },
            },
          },
        },
      },
      responses: {
        '200': {
          description: 'Updated',
          content: {
            'application/json': { schema: singleResponse('#/components/schemas/AdminConnection') },
          },
        },
        '404': { description: 'Not found' },
      },
    },
    delete: {
      tags: ['Admin'],
      summary: 'Delete a connection (operator)',
      description:
        'Removes the connection row. Does NOT call the upstream platform to revoke OAuth tokens. Operator-only. Tenant-scoped clients use `DELETE /v1/connections/{id}` (Bearer + `connections:write` scope).',
      parameters: [connectionIdPathParam],
      responses: { '204': { description: 'Deleted' }, '404': { description: 'Not found' } },
    },
  },

  '/auth/{vertical}/{platform}/connect': {
    get: {
      tags: ['Auth'],
      summary: 'Start OAuth — redirect to provider authorization URL',
      description: [
        "Browser endpoint. The user-agent is 302'd to the upstream provider's authorization URL. After the user consents, the provider redirects back to `GET /auth/{vertical}/{platform}/callback`.",
        '',
        "**When to use this vs the POST variant:** check the platform's `auth_type` in `/v1/platforms/{vertical}/{slug}`. `oauth2` → use this GET. Any other value (`api_key`, `basic`, `session`) → use the POST variant on the same path.",
        '',
        '**Admin tooling vs end-user flow:** this path is for admin tooling — the resulting connection has `ownerTenantId = null` and **does not appear** under `/v1/customers/{id}/connections`. For end-user flows (where the connection should be attached to one of your customers), mint a Connect Link with `POST /v1/customers/{id}/connect-links` instead and let the user complete OAuth via that flow.',
      ].join('\n'),
      security: [],
      parameters: [
        verticalPathParam,
        platformPathParam,
        {
          name: 'tenant_id',
          in: 'query',
          schema: { type: ['string', 'null'] },
          description:
            'Tenant the connection belongs to. Omit for admin-tooling (no-owner) connections.',
        },
        {
          name: 'label',
          in: 'query',
          schema: { type: 'string' },
          description: 'Optional human-readable label, surfaced in connection listings.',
        },
      ],
      responses: {
        '302': { description: 'Redirect to provider authorization endpoint' },
        '400': {
          description:
            'Platform is marked unsupported and cannot be connected. Body: `{ error: { code: "PLATFORM_UNSUPPORTED", message, reason, issueUrl } }`.',
        },
      },
    },
    post: {
      tags: ['Auth'],
      summary: 'Connect via static API key (no OAuth)',
      description: [
        'For platforms whose `auth_type` is `api_key` (or similar non-OAuth) — primarily logistics carriers (e.g. FedEx, UPS, Shippo) and a handful of CRM platforms. Stores the static credential and returns the new connection.',
        '',
        "**When to use this vs the GET variant:** check the platform's `auth_type` in `/v1/platforms/{vertical}/{slug}`. `oauth2` → use `GET /auth/{vertical}/{platform}/connect` (browser redirect). `api_key` (or any other non-oauth value) → use this POST.",
        '',
        "Adapters that haven't opted into the static-credential flow (no `exchangeCredentials()`) reject this with 404 — fall back to the OAuth GET path.",
        '',
        "**Credential fields are the adapter's, not a fixed `api_key`.** Send them as `fields`, keyed by the names in `credentialFields()` — `GET /v1/platforms/{vertical}/{slug}` lists them. Some adapters take one token, others take `clientId` + `clientSecret` plus an account id. `api_key` is accepted as shorthand **only** where the adapter declares exactly one field (the carrier case); anything else answers 400 and names what it needs.",
        '',
        "`tenant_id` is optional: omit it for admin-tooling connections (the connection lands with `ownerTenantId = null` and won't appear under `/v1/customers/{id}/connections`). Provide it when minting a connection that should belong to one of your tenants.",
        '',
        '**Two credentials, deliberately unequal.** Send `X-Admin-Secret` and `tenant_id` is taken from the body, so an operator can provision for any tenant or for none. Send a tenant Bearer key carrying `connections:write` and it works too — but `tenant_id` comes from the KEY and the body\u2019s value is ignored, which is what makes it safe to expose: a tenant can provision its own carriers headlessly and cannot reach another\u2019s. Presenting a Bearer header selects the tenant path even if a secret is also present, so the narrower rule wins.',
        '',
        'This route always requires a credential: an unauthenticated caller able to supply `tenant_id` could mint a connection owned by any tenant and route that tenant\u2019s traffic through an upstream account the caller controls. End-user credential entry belongs on the Connect Link flow, which is scoped by a one-time session token.',
      ].join('\n'),
      // Either credential. OpenAPI reads a list of requirement objects as OR.
      security: [...adminSecurity, ...apiKeySecurity],
      parameters: [verticalPathParam, platformPathParam],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              description:
                'Supply `fields` (preferred) or `api_key` for single-field adapters. One of the two is required.',
              properties: {
                fields: {
                  type: 'object',
                  additionalProperties: { type: 'string' },
                  description:
                    "The adapter's credential fields, keyed by the names `credentialFields()` declares.",
                  example: { clientId: 'ck_live_…', clientSecret: 'cs_live_…' },
                },
                api_key: {
                  type: 'string',
                  description:
                    'Shorthand for a single-field adapter. Rejected with 400 when the adapter declares more than one field.',
                  example: 'shippo_live_…',
                },
                tenant_id: {
                  type: ['string', 'null'],
                  description:
                    'Tenant the connection belongs to. Omit for admin-tooling (no-owner) connections. **Ignored when authenticating with a tenant Bearer key** — that key\u2019s own tenant is used.',
                },
                label: { type: 'string', description: 'Optional human-readable label.' },
              },
            },
          },
        },
      },
      responses: {
        '200': {
          description: 'Connection created',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  data: {
                    type: 'object',
                    required: ['id', 'platform', 'status'],
                    properties: {
                      id: { type: 'string', format: 'uuid' },
                      platform: { type: 'string' },
                      tenantId: { type: ['string', 'null'] },
                      label: { type: ['string', 'null'] },
                      status: { type: 'string', enum: ['connected'] },
                    },
                  },
                },
              },
            },
          },
        },
        '400': {
          description:
            "Missing or rejected credentials, or an unsupported platform. `MISSING_FIELDS` and `FIELDS_REQUIRED` both carry the adapter's field list; `CREDENTIAL_EXCHANGE_FAILED` means the platform refused them; `PLATFORM_UNSUPPORTED` means the platform is marked unsupported and carries `reason`/`issueUrl`.",
        },
        '401': { description: 'A Bearer key was sent and it is invalid or expired.' },
        '403': {
          description:
            'Missing or invalid `X-Admin-Secret`, or a Bearer key without `connections:write`. A sandbox (`osk_test_…`) key is also refused — this writes a real credential.',
        },
        '404': {
          description:
            "Adapter not found, or doesn't accept static credentials (use the OAuth GET path instead).",
        },
        '409': { description: 'Duplicate label for (vertical, platform, tenant).' },
      },
    },
  },

  '/auth/{vertical}/{platform}/callback': {
    get: {
      tags: ['Auth'],
      summary: 'OAuth callback — exchanges code, stores connection',
      description: [
        'Returned to by the upstream provider with `code` and `state` query params. Exchanges the code for tokens and persists a new connection row.',
        '',
        '**Two response shapes** depending on how the OAuth was started:',
        "- **Admin tooling** (started via `GET /auth/.../connect`): returns 200 JSON with `{ connection_id, vertical, platform }`. The connection has `ownerTenantId = null` — it won't appear under `/v1/customers/{id}/connections`.",
        "- **Connect Link flow** (started via `POST /connect/sessions/:token/oauth-start`): 302 redirects to the session's `redirect_url` (or the hosted thank-you page). The connection has `ownerTenantId` set from the session's tenant and IS visible under `/v1/customers/{id}/connections`.",
      ].join('\n'),
      security: [],
      parameters: [
        verticalPathParam,
        platformPathParam,
        { name: 'code', in: 'query', required: true, schema: { type: 'string' } },
        { name: 'state', in: 'query', required: true, schema: { type: 'string' } },
      ],
      responses: {
        '200': {
          description:
            'Connection created (admin-tooling flow). For Connect Link flows, response is 302 to the session redirect_url.',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['connection_id', 'vertical', 'platform'],
                properties: {
                  connection_id: { type: 'string', format: 'uuid' },
                  vertical: { $ref: '#/components/schemas/Vertical' },
                  platform: {
                    type: 'string',
                    description: 'Adapter slug. See the `PlatformSlug` schema for the full list.',
                    example: 'fortnox',
                  },
                },
              },
            },
          },
        },
      },
    },
  },

  // Connection deletion lives under the Connections + Admin tags:
  //   DELETE /admin/connections/{id}  — operator (X-Admin-Secret), cross-tenant
  //   DELETE /v1/connections/{id}     — tenant Bearer key + connections:write
  // The /auth/{vertical}/{platform}/* paths are OAuth ceremony only.

  '/v1/platforms': {
    get: {
      tags: ['Platform'],
      summary: 'List platforms',
      description:
        'Flat list of every adapter known to the service across every vertical. Each row carries an `enabled` boolean reflecting the deployment-specific activation state — use `?enabled=true` to filter to only the platforms a customer can actually connect to right now. Requires a credential: a Bearer dev key (live) or `X-Admin-Secret`. **In test mode** (`/test/v1/platforms`, test key) the catalog is curated: one synthetic `sandbox` platform per vertical, always enabled — exactly the platforms the sandbox connections use.',
      // Either credential (OR). The route was historically served
      // unauthenticated while this spec declared ApiKeyAuth; the runtime now
      // enforces what was always declared.
      security: [...apiKeySecurity, ...adminSecurity],
      parameters: [
        {
          name: 'vertical',
          in: 'query',
          description: 'Filter to one vertical.',
          schema: { $ref: '#/components/schemas/Vertical' },
        },
        { name: 'search', in: 'query', schema: { type: 'string' } },
        {
          name: 'enabled',
          in: 'query',
          description:
            'When `true`, return only platforms the operator has enabled on this deployment. When `false`, return only disabled platforms. Omit to return both.',
          schema: { type: 'string', enum: ['true', 'false'] },
        },
      ],
      responses: {
        '200': {
          description: 'OK',
          content: {
            'application/json': { schema: listResponse('#/components/schemas/Platform') },
          },
        },
      },
    },
  },

  '/v1/platforms/{vertical}/{slug}': {
    get: {
      tags: ['Platform'],
      summary: 'Get platform metadata',
      description:
        'Requires a credential: a Bearer dev key (live) or `X-Admin-Secret`. In test mode (`/test/v1/platforms/{vertical}/sandbox`, test key) only the synthetic `sandbox` slug resolves.',
      security: [...apiKeySecurity, ...adminSecurity],
      parameters: [verticalPathParam, slugPathParam],
      responses: {
        '200': {
          description: 'OK',
          content: {
            'application/json': { schema: singleResponse('#/components/schemas/Platform') },
          },
        },
        '404': { description: 'Not found' },
      },
    },
  },

  '/v1/capabilities': {
    get: {
      tags: ['Platform'],
      operationId: 'capabilities.get',
      summary: 'List the verticals this deployment serves',
      description:
        'The verticals whose routes answer for your credential: every vertical the deployment runs that its license includes. An MCP client registers tools only for these. Any Bearer dev key works, with no particular scope; an `mcp:read` key is also refused here when the license or the `features.mcp_enabled` setting withholds MCP. Carries no license details. End-user tokens (`eut_`) use `GET /v1/me/capabilities`, which lists the verticals mounted under `/v1/me` that the license includes. **In test mode** (`/test/v1/capabilities`, test key) the list is the sandbox verticals the license includes.',
      security: apiKeySecurity,
      responses: {
        '200': {
          description: 'OK',
          content: {
            'application/json': { schema: singleResponse('#/components/schemas/Capabilities') },
          },
        },
        '401': { $ref: '#/components/responses/Unauthorized' },
        '403': { $ref: '#/components/responses/Forbidden' },
      },
    },
  },

  '/admin/platforms': {
    get: {
      tags: ['Admin'],
      summary: 'List adapter enable-state across every vertical',
      parameters: [
        adminSecretHeader,
        {
          name: 'vertical',
          in: 'query',
          description: 'Filter to one vertical.',
          schema: { $ref: '#/components/schemas/Vertical' },
        },
      ],
      responses: {
        '200': {
          description: 'OK',
          content: {
            'application/json': { schema: listResponse('#/components/schemas/AdapterRow') },
          },
        },
        '403': { description: 'Forbidden — invalid X-Admin-Secret' },
      },
    },
  },

  '/admin/platforms/{vertical}/{slug}/enable': {
    post: {
      tags: ['Admin'],
      summary: 'Enable an adapter (and optionally seed its config)',
      parameters: [adminSecretHeader, verticalPathParam, slugPathParam],
      requestBody: {
        required: false,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: { config: { type: 'object', additionalProperties: true } },
            },
          },
        },
      },
      responses: {
        '200': { description: 'OK' },
        '400': {
          description:
            'Platform is marked unsupported and cannot be enabled. Body: `{ error: { code: "PLATFORM_UNSUPPORTED", message, reason, issueUrl } }`.',
        },
        '403': { description: 'Forbidden' },
        '404': { description: 'Unknown adapter (vertical, slug)' },
      },
    },
  },

  '/admin/platforms/{vertical}/{slug}/disable': {
    post: {
      tags: ['Admin'],
      summary: 'Disable an adapter (settings row preserved)',
      parameters: [adminSecretHeader, verticalPathParam, slugPathParam],
      responses: {
        '200': { description: 'OK' },
        '403': { description: 'Forbidden' },
        '404': { description: 'Unknown adapter' },
      },
    },
  },

  '/webhooks/{vertical}/{platform}': {
    post: {
      tags: ['Webhooks'],
      summary: 'Inbound webhook receiver',
      description:
        'Verifies the upstream signature, normalises the payload into one or more `WebhookEvent`s, fans each one out across matching stored connections (same `(vertical, platform, tenantId)` may resolve to multiple connections), and — if `webhooks.callbackUrl` is configured — POSTs `{ events: WebhookEvent[] }` to that URL as a fire-and-forget. Response body carries only `{ received, eventCount }`; consumers that need the event payloads wire a `callbackUrl`.',
      security: [],
      parameters: [
        verticalPathParam,
        platformPathParam,
        { name: 'x-test-signature', in: 'header', schema: { type: 'string' } },
      ],
      requestBody: {
        required: true,
        description:
          'Upstream-defined payload, passed verbatim to the adapter handler. The examples below are **representative raw upstream payloads** — each platform defines its own shape, so these illustrate the kind of body to expect rather than a canonical schema.',
        content: {
          'application/json': {
            schema: { type: 'object', additionalProperties: true },
            examples: {
              'payments.charge.succeeded': {
                summary: 'Representative raw Stripe charge.succeeded payload',
                value: {
                  id: 'evt_1042',
                  type: 'charge.succeeded',
                  created: 1768469400,
                  data: {
                    object: {
                      id: 'ch_1042',
                      object: 'charge',
                      amount: 125000,
                      currency: 'usd',
                      status: 'succeeded',
                      customer: 'cus_4Qm2Xa9Lr',
                      receipt_email: 'jane.doe@acme.example',
                    },
                  },
                },
              },
              'accounting.invoice.updated': {
                summary: 'Representative raw Xero invoice.updated payload',
                value: {
                  events: [
                    {
                      resourceId: 'inv_1042',
                      eventCategory: 'INVOICE',
                      eventType: 'UPDATE',
                      eventDateUtc: '2026-02-01T14:20:00Z',
                      tenantId: 'acme',
                    },
                  ],
                },
              },
              'crm.contact.created': {
                summary: 'Representative raw HubSpot contact.created payload',
                value: [
                  {
                    eventId: 'whs_1042',
                    subscriptionType: 'contact.creation',
                    occurredAt: 1768469400000,
                    objectId: 'cus_4Qm2Xa9Lr',
                    propertyName: 'email',
                    propertyValue: 'jane.doe@acme.example',
                  },
                ],
              },
            },
          },
        },
      },
      responses: {
        '200': {
          description: 'Webhook accepted',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['received', 'eventCount'],
                properties: {
                  received: { type: 'boolean' },
                  eventCount: {
                    type: 'integer',
                    description:
                      'Number of `WebhookEvent`s produced after fan-out. May exceed the upstream event count when a (platform, tenantId) matches multiple stored connections.',
                  },
                },
              },
            },
          },
        },
        '400': { description: 'Invalid JSON body' },
        '401': { description: 'Invalid webhook signature' },
        '404': { description: 'No webhook handler for (vertical, platform)' },
      },
    },
  },

  '/v1/customers': {
    get: {
      tags: ['Customers'],
      summary: 'List customers',
      description:
        'Returns customers owned by the tenant of the calling API key. Searchable by email, display name, or external reference. Requires scope `customers:read`.',
      security: apiKeySecurity,
      parameters: [
        { name: 'q', in: 'query', schema: { type: 'string' } },
        { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 200 } },
        { name: 'offset', in: 'query', schema: { type: 'integer', minimum: 0 } },
      ],
      responses: {
        '200': {
          description: 'OK',
          content: {
            'application/json': { schema: listResponse('#/components/schemas/Customer') },
          },
        },
        '401': {
          description: 'Missing or invalid API key',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
        },
      },
    },
    post: {
      tags: ['Customers'],
      summary: 'Create or upsert a customer',
      description:
        'Idempotent on `(tenant, email)` — re-posting the same email returns the existing record with a 200 instead of erroring. Requires scope `customers:write`.',
      security: apiKeySecurity,
      requestBody: {
        required: true,
        content: { 'application/json': { schema: createCustomerBodySchema } },
      },
      responses: {
        '200': {
          description: 'Existing record returned (idempotent retry).',
          content: {
            'application/json': { schema: singleResponse('#/components/schemas/Customer') },
          },
        },
        '201': {
          description: 'Customer created',
          content: {
            'application/json': { schema: singleResponse('#/components/schemas/Customer') },
          },
        },
        '400': {
          description: 'Validation error',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
        },
        '401': { description: 'Missing or invalid API key' },
      },
    },
  },

  '/v1/customers/{id}': {
    get: {
      tags: ['Customers'],
      summary: 'Get a customer',
      description:
        'Requires scope `customers:read`. Pass `?include_pii=true` to additionally return the decrypted PII (firstName, lastName, phone, address, personalIdNumber); requires scope `customers:read_pii`. Each reveal writes a structured `pii_reveal` audit log line.',
      security: apiKeySecurity,
      parameters: [
        customerIdPathParam,
        {
          name: 'include_pii',
          in: 'query',
          required: false,
          description:
            'When `true`, response `data.pii` is populated with the decrypted record. Requires the `customers:read_pii` scope.',
          schema: { type: 'string', enum: ['true', 'false'] },
        },
      ],
      responses: {
        '200': {
          description: 'OK',
          content: {
            'application/json': { schema: singleResponse('#/components/schemas/Customer') },
          },
        },
        '403': {
          description: 'Forbidden — missing `customers:read_pii` scope when `?include_pii=true`.',
        },
        '404': {
          description: 'Not found',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
        },
      },
    },
    patch: {
      tags: ['Customers'],
      summary: 'Update a customer',
      description: 'Requires scope `customers:write`.',
      security: apiKeySecurity,
      parameters: [customerIdPathParam],
      requestBody: {
        required: true,
        content: { 'application/json': { schema: updateCustomerBodySchema } },
      },
      responses: {
        '200': {
          description: 'Updated',
          content: {
            'application/json': { schema: singleResponse('#/components/schemas/Customer') },
          },
        },
        '400': { description: 'Validation error' },
        '404': { description: 'Not found' },
      },
    },
    delete: {
      tags: ['Customers'],
      summary: 'Delete a customer',
      description:
        'Detaches the customer from any connect-link sessions and hard-deletes the record. ' +
        'By default linked connections are NOT revoked \u2014 pass `?cascade=connections` to also ' +
        'delete every connection this customer\u2019s links produced, which drops their cached ' +
        'resources, sync history and external-account links (the standard connection-delete ' +
        'cascade). The provider-side OAuth grant is not called either way. Requires scope ' +
        '`customers:write`.',
      security: apiKeySecurity,
      parameters: [
        customerIdPathParam,
        {
          name: 'cascade',
          in: 'query',
          description:
            "Pass `connections` to also delete this customer's connections and their derived state — the erasure-request shape.",
          schema: { type: 'string', enum: ['connections'] },
        },
      ],
      responses: {
        '204': { description: 'Deleted' },
        '404': { description: 'Not found' },
      },
    },
  },

  '/v1/customers/{id}/connections': {
    get: {
      tags: ['Customers'],
      summary: "List a customer's connections",
      description:
        'Returns every connection joined to this customer via a consumed Connect Link session. Requires scope `connections:read`.',
      security: apiKeySecurity,
      parameters: [customerIdPathParam],
      responses: {
        '200': {
          description: 'OK',
          content: {
            'application/json': { schema: listResponse('#/components/schemas/Connection') },
          },
        },
        '404': { description: 'Not found' },
      },
    },
  },

  '/v1/customers/{id}/connect-links': {
    post: {
      tags: ['Customers'],
      summary: 'Create a hosted Connect Link for a customer',
      description:
        'Returns a single-use, time-bound URL the customer opens to authorise an integration. When the customer completes the flow, the resulting connection is tagged back to this customer and visible at `GET /v1/customers/{id}/connections`. Requires scope `connect-links:write`.',
      security: apiKeySecurity,
      parameters: [customerIdPathParam],
      requestBody: {
        required: false,
        content: {
          'application/json': {
            schema: createConnectLinkBodySchema,
            examples: {
              pinned: {
                summary: 'Pinned to a single adapter (Xero)',
                value: { vertical: 'accounting', platform: 'xero', label: 'Acme onboarding' },
              },
              customerPicks: {
                summary: 'Vertical only — customer chooses any enabled adapter',
                value: { vertical: 'accounting' },
              },
              withRedirect: {
                summary: 'Return the customer to your app when done',
                value: { vertical: 'accounting', redirectUrl: 'https://app.acme.example/done' },
              },
              oneTime: {
                summary: 'Single-use link — consumed after one connection',
                value: { vertical: 'accounting', oneTimeOnly: true },
              },
            },
          },
        },
      },
      responses: {
        '201': {
          description: 'Link created',
          content: {
            'application/json': {
              schema: singleResponse('#/components/schemas/ConnectLink'),
              examples: {
                active: {
                  summary: 'Active link returned to send to the customer',
                  value: {
                    data: {
                      id: 'cl_8f3a2b9c4d',
                      token: 'cl_8f3a2b9c4d',
                      url: 'https://connect.northwind.example/cl_8f3a2b9c4d',
                      label: 'Acme onboarding',
                      endUserId: 'cus_4Qm2Xa9Lr',
                      allowedVerticals: ['accounting'],
                      allowedPlatforms: [{ vertical: 'accounting', slug: 'xero' }],
                      redirectUrl: 'https://app.acme.example/done',
                      expiresAt: 1769955600000,
                      consumedAt: null,
                      connectionId: null,
                      status: 'active',
                    },
                  },
                },
              },
            },
          },
        },
        '400': { description: 'Validation error' },
        '404': { description: 'Customer not found' },
      },
    },
  },

  '/v1/connections': {
    get: {
      tags: ['Connections'],
      summary: "List your tenant's connections",
      description:
        'Returns connections owned by your tenant — i.e. connections that landed via a Connect Link spawned for one of your customers. Connections created out-of-band via admin tooling carry no owner tenant and are not returned here. Requires scope `connections:read`.',
      security: apiKeySecurity,
      parameters: [
        {
          name: 'vertical',
          in: 'query',
          description: 'Filter to one vertical.',
          schema: { $ref: '#/components/schemas/Vertical' },
        },
        {
          name: 'platform',
          in: 'query',
          // Deliberately not an enum: the CLI generator turns query enums
          // into `choices`, and a 1,500-choice flag helps nobody. The
          // `PlatformSlug` component is the list; this is the free-text
          // filter over it.
          description:
            'Filter to one adapter, by slug. See the `PlatformSlug` schema or `GET /v1/platforms` for valid values.',
          schema: { type: 'string', example: 'fortnox' },
        },
      ],
      responses: {
        '200': {
          description: 'OK',
          content: {
            'application/json': { schema: listResponse('#/components/schemas/Connection') },
          },
        },
        '401': { description: 'Missing or invalid API key' },
        '403': { description: 'Missing required scope' },
      },
    },
  },

  '/v1/connections/{id}': {
    get: {
      tags: ['Connections'],
      summary: 'Get a connection',
      description:
        "Cross-tenant lookups return 404 (not 403) so the caller cannot probe for other tenants' ids. Requires scope `connections:read`.",
      security: apiKeySecurity,
      parameters: [connectionIdPathParam],
      responses: {
        '200': {
          description: 'OK',
          content: {
            'application/json': {
              schema: singleResponse('#/components/schemas/Connection'),
              examples: {
                active: {
                  summary: 'Active — tokens valid',
                  value: {
                    data: {
                      id: '1b9d6bcd-bf5c-4a3e-9b2a-2f4e8c7d1a90',
                      vertical: 'accounting',
                      platform: 'xero',
                      tenantId: 'acme',
                      ownerTenantId: 'acme',
                      label: 'Acme — Xero',
                      status: 'active',
                      expiresAt: '2026-02-01T14:20:00Z',
                      createdAt: '2026-01-15T09:30:00Z',
                      updatedAt: '2026-02-01T14:20:00Z',
                    },
                  },
                },
                expired: {
                  summary: 'Expired — access token lapsed, refresh needed',
                  value: {
                    data: {
                      id: '1b9d6bcd-bf5c-4a3e-9b2a-2f4e8c7d1a90',
                      vertical: 'accounting',
                      platform: 'xero',
                      tenantId: 'acme',
                      ownerTenantId: 'acme',
                      label: 'Acme — Xero',
                      status: 'expired',
                      expiresAt: '2026-02-01T14:20:00Z',
                      createdAt: '2026-01-15T09:30:00Z',
                      updatedAt: '2026-02-01T14:20:00Z',
                    },
                  },
                },
                revoked: {
                  summary: 'Revoked — connection deactivated',
                  value: {
                    data: {
                      id: '1b9d6bcd-bf5c-4a3e-9b2a-2f4e8c7d1a90',
                      vertical: 'accounting',
                      platform: 'xero',
                      tenantId: 'acme',
                      ownerTenantId: 'acme',
                      label: 'Acme — Xero',
                      status: 'revoked',
                      expiresAt: null,
                      createdAt: '2026-01-15T09:30:00Z',
                      updatedAt: '2026-02-01T14:20:00Z',
                    },
                  },
                },
              },
            },
          },
        },
        '404': { description: 'Not found / not owned' },
      },
    },
    patch: {
      tags: ['Connections'],
      summary: 'Rename a connection',
      description: 'Body: `{ "label": "<new>" | null }`. Requires scope `connections:write`.',
      security: apiKeySecurity,
      parameters: [connectionIdPathParam],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['label'],
              properties: { label: { type: ['string', 'null'] } },
            },
          },
        },
      },
      responses: {
        '200': {
          description: 'Updated',
          content: {
            'application/json': { schema: singleResponse('#/components/schemas/Connection') },
          },
        },
        '400': { description: 'Validation error' },
        '404': { description: 'Not found / not owned' },
        '409': { description: 'Duplicate label for (vertical, platform, tenant)' },
      },
    },
    delete: {
      tags: ['Connections'],
      summary: 'Delete a connection',
      description:
        'Removes the connection row. Does NOT call the upstream platform to revoke OAuth tokens — issue a platform-side revoke separately if needed. Requires scope `connections:write`.',
      security: apiKeySecurity,
      parameters: [connectionIdPathParam],
      responses: {
        '204': { description: 'Deleted' },
        '404': { description: 'Not found / not owned' },
      },
    },
  },

  // ─── Events (verified inbound platform events, tenant-scoped stream) ──────
  // Mounted at /v1/events (live) and /test/v1/events (sandbox — same shape,
  // synthetic rows). `seq` is a monotonic cursor: poll with the returned
  // `next_cursor` (`meta.next_cursor`) to pull only what arrived since.
  '/v1/events': {
    get: {
      tags: ['Events'],
      operationId: 'events.list',
      summary: 'List inbound events',
      description:
        "Returns verified inbound platform webhook events for your tenant in `seq` order (oldest first). `seq` is monotonic, so paging with `after_seq` = the previous page's `meta.next_cursor` pulls only new events with no clock-skew gaps. Requires scope `events:read`. In test mode (`/test/v1/events`) the stream is a small deterministic synthetic set.",
      security: apiKeySecurity,
      parameters: [
        {
          name: 'after_seq',
          in: 'query',
          description:
            "Return only events with `seq` greater than this. Pass the previous page's `meta.next_cursor`. Omit (or `0`) to start from the beginning.",
          schema: { type: 'integer', format: 'int64', minimum: 0, example: 0 },
        },
        {
          name: 'limit',
          in: 'query',
          description: 'Maximum rows to return in one page.',
          schema: { type: 'integer', minimum: 1, maximum: 200, example: 50 },
        },
      ],
      responses: {
        '200': {
          description: 'OK',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['data', 'meta'],
                properties: {
                  data: {
                    type: 'array',
                    items: { $ref: '#/components/schemas/InboundEvent' },
                  },
                  meta: {
                    type: 'object',
                    required: ['next_cursor', 'count'],
                    properties: {
                      next_cursor: {
                        type: 'integer',
                        format: 'int64',
                        description:
                          'Highest `seq` in this page (equals `after_seq` when the page is empty). Pass it back as `after_seq` to poll.',
                        example: 2,
                      },
                      count: { type: 'integer', example: 2 },
                      fetchedAt: { type: 'string', format: 'date-time' },
                    },
                  },
                },
              },
            },
          },
        },
        '401': { description: 'Missing or invalid API key' },
        '403': { description: 'Missing required scope (`events:read`)' },
      },
    },
  },

  // ─── Sync (background full-sync jobs, per-vertical mount) ─────────────────
  // Routes are mounted at /v1/<vertical>/sync for each of the five verticals;
  // documenting once with `{vertical}` as a path param keeps the spec compact.
  // Tenant-scoped Bearer key + `vertical:<v>` scope; `vertical:write` is NOT
  // required since enqueueing a sync only writes to the local cache, not
  // upstream platforms. (This was the intent from the start, but the runtime
  // did not match it until 2026-08: the auth middleware classified every
  // non-GET as a write, so a read-only key was refused. `readSafe` on the
  // route is what encodes the exception.) Supplying `callback_url` is the one
  // part that does require `vertical:write` — it makes the deployment issue an
  // outbound request of its own. Routes are only mounted when `dataStore.mode != passthrough`.

  '/v1/{vertical}/sync': {
    post: {
      tags: ['Sync'],
      summary: 'Enqueue a background sync job',
      description:
        "Walks the vertical's listable resources for the given connection and bulk-upserts canonical rows into the local cache. Returns 409 with the existing job if one is already pending or running for the same connection. Returns 404 in `passthrough` mode (route not mounted).\n\n" +
        '**Scope.** A sync only fills the local cache and never writes upstream, so the touch axis alone is enough — `vertical:{vertical}` or `vertical:read`. `vertical:write` is NOT required.\n\n' +
        '**Unless you send `callback_url`.** Supplying one makes the deployment issue an outbound POST of its own when the job finishes, which is a different authority from refreshing your cache, so it additionally requires `vertical:write`. A key without that scope gets `403 INSUFFICIENT_SCOPE`.\n\n' +
        "If you do not need a callback, send an empty JSON object as the body. The body is optional, but an empty one is not: the server rejects a request that sets `Content-Type: application/json` and sends nothing with `400 Body cannot be empty when content-type is set to 'application/json'` — and this console, like most REST clients, always sets that header. So send `{}` (or omit both the body and the header):\n\n" +
        '```sh\n' +
        'curl -X POST -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \\\n' +
        '  "$BASE/v1/{vertical}/sync?connection_id=<uuid>" -d \'{}\'\n' +
        '```\n\n' +
        'A `callback_url` must be `https`, carry no embedded credentials, and must not resolve to a loopback, private or link-local address; it is validated when the job is enqueued (`400 INVALID_CALLBACK_URL`) and re-resolved immediately before the callback is sent.\n\n' +
        '**In the sandbox** (`/test/v1/{vertical}/sync`, test keys) the job lifecycle is simulated: it walks pending \u2192 running \u2192 completed over ~2s (`?fast=true` completes before the response returns), completion seeds a couple of fresh fixture rows per resource type so a re-poll sees new data, and `callback_url` is validated and stored but **never dialed** \u2014 the sandbox makes no outbound requests; poll `GET /sync/{jobId}` instead. The tighter 10/hour budget applies only to live syncs.',
      security: apiKeySecurity,
      parameters: [
        verticalPathParam,
        {
          name: 'connection_id',
          in: 'query',
          required: true,
          description:
            'UUID of the connection to sync. Tenant ownership verified by auth middleware.',
          schema: { type: 'string', format: 'uuid' },
        },
      ],
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
                    'Optional URL to POST `sync.completed` / `sync.failed` events to. Retries up to 3× with exponential backoff. Requires the `vertical:write` scope — omit it (send `{}`) if your key is read-only. Must be https, carry no credentials, and not resolve to a loopback, private or link-local address.',
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
                properties: { data: { $ref: '#/components/schemas/SyncJob' } },
              },
            },
          },
        },
        '400': { $ref: '#/components/responses/BadRequest' },
        '404': { description: 'Vertical unknown or `passthrough` mode — sync routes not mounted.' },
        '409': {
          description:
            'A pending or running sync already exists for this connection. The body returns the existing `SyncJob`.',
        },
      },
    },
    get: {
      tags: ['Sync'],
      summary: 'List sync jobs for one connection',
      security: apiKeySecurity,
      parameters: [
        verticalPathParam,
        {
          name: 'connection_id',
          in: 'query',
          required: true,
          description: 'UUID of the connection. Tenant ownership verified by auth middleware.',
          schema: { type: 'string', format: 'uuid' },
        },
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
        '400': { $ref: '#/components/responses/BadRequest' },
        '403': { description: 'Missing required scope.' },
      },
    },
  },

  '/v1/{vertical}/sync/{jobId}': {
    get: {
      tags: ['Sync'],
      summary: 'Get a sync job by id',
      description:
        "Fetch one sync job. `connection_id` is required even though `jobId` identifies the job on its own: every `/v1/{vertical}/*` route is gated by the unified auth middleware, which resolves the connection before routing in order to determine the platform adapter and to verify the connection belongs to the caller's tenant. The handler additionally 404s a job that belongs to a different connection, so a job id from another connection cannot be probed.",
      security: apiKeySecurity,
      parameters: [
        verticalPathParam,
        {
          name: 'connection_id',
          in: 'query',
          required: true,
          description:
            'UUID of the connection the job belongs to. Required by the auth middleware for every /v1/{vertical}/* route; also scopes the lookup, so a job id belonging to another connection returns 404.',
          schema: { type: 'string', format: 'uuid' },
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
                properties: { data: { $ref: '#/components/schemas/SyncJob' } },
              },
              examples: syncJobPollExamples,
            },
          },
        },
        '404': { description: 'Job not found or owned by a different tenant.' },
      },
    },
  },

  '/admin/api-keys': {
    get: {
      tags: ['Admin'],
      summary: 'List developer API keys',
      description:
        'Lists every key (active + revoked) optionally filtered by tenant. Admin-only — proxied through admin-api as `/api/api-keys`.',
      security: [],
      parameters: [
        adminSecretHeader,
        { name: 'tenantId', in: 'query', schema: { type: 'string' } },
      ],
      responses: {
        '200': {
          description: 'OK',
          content: {
            'application/json': {
              schema: listResponse('#/components/schemas/ApiKey'),
            },
          },
        },
        '403': { description: 'Forbidden' },
      },
    },
    post: {
      tags: ['Admin'],
      summary: 'Mint a developer API key',
      description:
        'Returns the plaintext key exactly once in `data.plaintext`. Optional `scopes` array narrows the key; default is `["*"]`.',
      security: [],
      parameters: [adminSecretHeader],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['tenantId'],
              properties: {
                tenantId: { type: 'string' },
                label: { type: 'string' },
                scopes: { type: 'array', items: { type: 'string' } },
              },
            },
          },
        },
      },
      responses: {
        '201': {
          description: 'Created',
          content: {
            'application/json': {
              schema: singleResponse('#/components/schemas/ApiKeyMint'),
            },
          },
        },
        '400': { description: 'Validation error' },
        '403': { description: 'Forbidden' },
      },
    },
  },

  '/admin/api-keys/{id}': {
    delete: {
      tags: ['Admin'],
      summary: 'Revoke a developer API key',
      security: [],
      parameters: [
        adminSecretHeader,
        { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
      ],
      responses: {
        '204': { description: 'Revoked' },
        '404': { description: 'Not found' },
        '403': { description: 'Forbidden' },
      },
    },
  },

  // ── Developer-facing webhook subscription self-service ────────────────────
  // Same store and delivery pipeline as the /admin/webhook-subscriptions
  // surface below, exposed to Bearer keys under webhooks:read /
  // webhooks:write. Tenant comes from the key; cross-tenant ids answer 404.

  '/v1/webhook-subscriptions': {
    get: {
      tags: ['Webhook subscriptions'],
      operationId: 'webhook-subscriptions.list',
      summary: "List your tenant's webhook subscriptions",
      description: 'Requires scope `webhooks:read`.',
      security: apiKeySecurity,
      responses: {
        '200': {
          description: 'OK',
          content: {
            'application/json': {
              schema: listResponse('#/components/schemas/WebhookSubscription'),
            },
          },
        },
        '401': { description: 'Missing or invalid API key' },
        '403': { description: 'Missing required scope' },
      },
    },
    post: {
      tags: ['Webhook subscriptions'],
      operationId: 'webhook-subscriptions.create',
      summary: 'Create a webhook subscription (secret returned once)',
      description:
        'Registers an HTTPS endpoint for your tenant\u2019s events without an operator round-trip. ' +
        'Requires scope `webhooks:write`. The response carries the plaintext signing secret exactly ' +
        'once \u2014 receivers verify `X-OI-Signature` by HMAC-SHA256-ing the raw body with it. The ' +
        'subscription is pinned to the tenant on your key; there is no `tenantId` field. Destination ' +
        'URLs are SSRF-guarded (public `https` hosts only), and one tenant may hold at most 20 ' +
        'subscriptions (`403 WEBHOOK_SUB_QUOTA_EXCEEDED`).',
      security: apiKeySecurity,
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['url'],
              properties: {
                url: { type: 'string', format: 'uri' },
                label: { type: ['string', 'null'], maxLength: 200, example: 'Billing service' },
                events: {
                  type: 'array',
                  items: { type: 'string' },
                  description:
                    'Event names to receive. Use `*` (or omit) for all, exact names, or prefix wildcards like `customer.*`.',
                  example: ['customer.created'],
                },
                format: {
                  type: 'string',
                  enum: ['opensteward', 'slack', 'teams', 'flat'],
                  description:
                    'Payload shape. Defaults to `opensteward`, the signed event envelope.',
                },
                headers: {
                  type: 'object',
                  additionalProperties: { type: 'string' },
                  description:
                    'Custom headers sent with every delivery. Stored encrypted, never returned. Reserved names rejected: `x-oi-*`, `host`, `content-*`, hop-by-hop.',
                },
              },
            },
          },
        },
      },
      responses: {
        '201': {
          description: 'Created',
          content: {
            'application/json': {
              schema: singleResponse('#/components/schemas/WebhookSubscriptionWithSecret'),
            },
          },
        },
        '400': { description: 'Validation error' },
        '401': { description: 'Missing or invalid API key' },
        '403': { description: 'Missing required scope, or subscription quota exceeded' },
      },
    },
  },

  '/v1/webhook-subscriptions/{id}': {
    get: {
      tags: ['Webhook subscriptions'],
      operationId: 'webhook-subscriptions.get',
      summary: 'Get one of your webhook subscriptions',
      description:
        'Cross-tenant lookups return 404 (not 403) so ids cannot be probed. Requires scope `webhooks:read`.',
      security: apiKeySecurity,
      parameters: [
        { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
      ],
      responses: {
        '200': {
          description: 'OK',
          content: {
            'application/json': {
              schema: singleResponse('#/components/schemas/WebhookSubscription'),
            },
          },
        },
        '401': { description: 'Missing or invalid API key' },
        '403': { description: 'Missing required scope' },
        '404': { description: 'Not found (or not yours)' },
      },
    },
    patch: {
      tags: ['Webhook subscriptions'],
      operationId: 'webhook-subscriptions.update',
      summary: 'Update format, headers or label',
      description:
        '`url` and `events` stay immutable, as on the operator surface \u2014 this exists so a header ' +
        'credential can be rotated or a subscription renamed without losing its delivery history. ' +
        'Requires scope `webhooks:write`.',
      security: apiKeySecurity,
      parameters: [
        { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
      ],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                format: { type: 'string', enum: ['opensteward', 'slack', 'teams', 'flat'] },
                headers: {
                  type: ['object', 'null'],
                  additionalProperties: { type: 'string' },
                  description: 'Replace the custom header set; null clears it.',
                },
                label: { type: ['string', 'null'], maxLength: 200 },
              },
            },
          },
        },
      },
      responses: {
        '200': {
          description: 'Updated',
          content: {
            'application/json': {
              schema: singleResponse('#/components/schemas/WebhookSubscription'),
            },
          },
        },
        '400': { description: 'Validation error' },
        '401': { description: 'Missing or invalid API key' },
        '403': { description: 'Missing required scope' },
        '404': { description: 'Not found (or not yours)' },
      },
    },
    delete: {
      tags: ['Webhook subscriptions'],
      operationId: 'webhook-subscriptions.delete',
      summary: 'Delete a webhook subscription',
      description: 'Requires scope `webhooks:write`.',
      security: apiKeySecurity,
      parameters: [
        { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
      ],
      responses: {
        '204': { description: 'Deleted' },
        '401': { description: 'Missing or invalid API key' },
        '403': { description: 'Missing required scope' },
        '404': { description: 'Not found (or not yours)' },
      },
    },
  },

  '/v1/webhook-subscriptions/{id}/test': {
    post: {
      tags: ['Webhook subscriptions'],
      operationId: 'webhook-subscriptions.test',
      summary: 'Send one synthetic delivery',
      description:
        'Proves a destination works without creating real data. Synchronous, never queued, never ' +
        'retried; a receiver rejection is reported as a result, not an error. Requires scope ' +
        '`webhooks:write`.',
      security: apiKeySecurity,
      parameters: [
        { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
      ],
      responses: {
        '200': {
          description: 'Delivery attempted \u2014 `data.ok` says whether the receiver accepted it.',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  data: {
                    type: 'object',
                    properties: {
                      id: { type: 'string' },
                      ok: { type: 'boolean' },
                      status: { type: ['integer', 'null'] },
                      format: { type: 'string' },
                      sentBody: { type: 'string' },
                      error: { type: 'string' },
                    },
                  },
                },
              },
            },
          },
        },
        '401': { description: 'Missing or invalid API key' },
        '403': { description: 'Missing required scope' },
        '404': { description: 'Not found (or not yours)' },
      },
    },
  },

  '/v1/webhook-subscriptions/{id}/paused': {
    post: {
      tags: ['Webhook subscriptions'],
      operationId: 'webhook-subscriptions.set-paused',
      summary: 'Pause or resume deliveries',
      description:
        'Retains the subscription but stops deliveries while paused. Body `{ "paused": false }` ' +
        'resumes; omitting the body pauses. Requires scope `webhooks:write`.',
      security: apiKeySecurity,
      parameters: [
        { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
      ],
      requestBody: {
        required: false,
        content: {
          'application/json': {
            schema: { type: 'object', properties: { paused: { type: 'boolean', default: true } } },
          },
        },
      },
      responses: {
        '200': { description: 'OK' },
        '401': { description: 'Missing or invalid API key' },
        '403': { description: 'Missing required scope' },
        '404': { description: 'Not found (or not yours)' },
      },
    },
  },

  '/v1/webhook-subscriptions/{id}/rotate-secret': {
    post: {
      tags: ['Webhook subscriptions'],
      operationId: 'webhook-subscriptions.rotate-secret',
      summary: 'Rotate the signing secret (returned once)',
      description:
        'Mints a new shared secret and returns it exactly once. Deliveries sign with the new secret ' +
        'immediately \u2014 update the receiver first. Requires scope `webhooks:write`.',
      security: apiKeySecurity,
      parameters: [
        { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
      ],
      responses: {
        '200': { description: 'New secret returned' },
        '401': { description: 'Missing or invalid API key' },
        '403': { description: 'Missing required scope' },
        '404': { description: 'Not found (or not yours)' },
      },
    },
  },

  '/v1/webhook-subscriptions/{id}/deliveries': {
    get: {
      tags: ['Webhook subscriptions'],
      operationId: 'webhook-subscriptions.deliveries',
      summary: "One subscription's delivery log",
      description:
        'Recent deliveries with status, attempt count and receiver response \u2014 the first place to ' +
        'look when events stop arriving. Requires scope `webhooks:read`.',
      security: apiKeySecurity,
      parameters: [
        { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        {
          name: 'status',
          in: 'query',
          schema: { type: 'string', enum: ['pending', 'delivered', 'dead'] },
        },
        { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 200 } },
      ],
      responses: {
        '200': { description: 'OK' },
        '401': { description: 'Missing or invalid API key' },
        '403': { description: 'Missing required scope' },
        '404': { description: 'Not found (or not yours)' },
      },
    },
  },

  '/admin/webhook-subscriptions': {
    get: {
      tags: ['Admin'],
      summary: 'List outbound webhook subscriptions',
      security: [],
      parameters: [
        adminSecretHeader,
        { name: 'tenantId', in: 'query', schema: { type: 'string' } },
      ],
      responses: {
        '200': {
          description: 'OK',
          content: {
            'application/json': {
              schema: listResponse('#/components/schemas/WebhookSubscription'),
            },
          },
        },
        '403': { description: 'Forbidden' },
      },
    },
    post: {
      tags: ['Admin'],
      summary: 'Create a webhook subscription',
      description:
        'Returns the plaintext shared secret exactly once. Receivers verify the `X-OI-Signature` header by HMAC-SHA256-ing the raw request body with this secret.',
      security: [],
      parameters: [adminSecretHeader],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['tenantId', 'url'],
              properties: {
                tenantId: { type: 'string' },
                url: { type: 'string', format: 'uri' },
                label: {
                  type: ['string', 'null'],
                  maxLength: 200,
                  description:
                    'Optional human-friendly name for the subscription. Purely descriptive; a blank string is stored as null.',
                  example: 'Billing service',
                },
                events: {
                  type: 'array',
                  items: { type: 'string' },
                  description:
                    'Event names to receive. Use `*` (or omit) for all, exact event names, or prefix wildcards like `customer.*`.',
                  example: ['customer.created'],
                },
                format: {
                  type: 'string',
                  enum: ['opensteward', 'slack', 'teams', 'flat'],
                  description:
                    'Payload shape for this endpoint. Defaults to `opensteward`, the signed event envelope. Choose `slack` for a Slack incoming-webhook URL, `teams` for a Teams Workflows (Power Automate) URL, or `flat` for a tool that only maps top-level fields. The signature always covers the rendered bytes, whichever shape is sent.',
                  example: 'slack',
                },
                headers: {
                  type: 'object',
                  additionalProperties: { type: 'string' },
                  description:
                    'Custom headers sent with every delivery, for a receiver that authenticates by header. Stored encrypted and never returned. Reserved names are rejected: `x-oi-*` (they carry the signature), `host`, `content-*`, and hop-by-hop headers. At most 10 headers, 4096 bytes in total; CR, LF and non-ASCII characters are rejected rather than stripped.',
                  example: { 'X-Api-Key': 'k-123' },
                },
              },
            },
          },
        },
      },
      responses: {
        '201': {
          description: 'Created',
          content: {
            'application/json': {
              schema: singleResponse('#/components/schemas/WebhookSubscriptionWithSecret'),
            },
          },
        },
        '400': { description: 'Validation error' },
        '403': { description: 'Forbidden' },
      },
      callbacks: {
        webhookDelivery: {
          '{$request.body#/url}': {
            post: {
              summary: 'Webhook delivery (server → subscriber)',
              description:
                "When any tenant-scoped event matches this subscription's `events` filter, the integration-server POSTs the canonical `WebhookEvent` payload to the URL captured at create time. Each request includes `X-OI-Signature: sha256=<hex>` — verify by HMAC-SHA256-ing the raw request body with the `secret` returned from the 201 response above. Retries follow exponential backoff via the deliveries table; inspect via `GET /admin/webhook-subscriptions/{id}/deliveries`. Subscriber must respond with 2xx within 10s; any other status (or timeout) is retried.",
              requestBody: {
                required: true,
                content: {
                  'application/json': {
                    schema: { $ref: '#/components/schemas/WebhookEvent' },
                  },
                },
              },
              responses: {
                '2XX': {
                  description: 'Subscriber acknowledged receipt — delivery marked succeeded.',
                },
                default: {
                  description:
                    'Any non-2xx response is treated as a delivery failure and queued for retry.',
                },
              },
            },
          },
        },
      },
    },
  },

  '/admin/webhook-subscriptions/{id}': {
    patch: {
      tags: ['Admin'],
      summary: 'Change a webhook subscription label, payload format or headers',
      description:
        'Changes the label, and how deliveries are shaped and authenticated. The URL and event list are immutable — recreate the subscription to change those. Headers are replaced wholesale rather than merged, so a header can be removed; an empty object or null clears them. Header values are never returned.',
      security: [],
      parameters: [
        adminSecretHeader,
        { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
      ],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                format: {
                  type: 'string',
                  enum: ['opensteward', 'slack', 'teams', 'flat'],
                  description: 'New payload shape for this endpoint.',
                  example: 'slack',
                },
                headers: {
                  type: ['object', 'null'],
                  additionalProperties: { type: 'string' },
                  description:
                    'Replaces the custom headers wholesale. An empty object or null removes them all.',
                  example: { 'X-Api-Key': 'k-456' },
                },
                label: {
                  type: ['string', 'null'],
                  maxLength: 200,
                  description:
                    'New human-friendly name. Null or a blank string clears it; omit the field to leave it unchanged.',
                  example: 'Billing service',
                },
              },
            },
          },
        },
      },
      responses: {
        '200': {
          description: 'Updated',
          content: {
            'application/json': {
              schema: singleResponse('#/components/schemas/WebhookSubscription'),
            },
          },
        },
        '400': { description: 'Validation error' },
        '404': { description: 'Not found' },
        '403': { description: 'Forbidden' },
      },
    },
    delete: {
      tags: ['Admin'],
      summary: 'Delete a webhook subscription',
      security: [],
      parameters: [
        adminSecretHeader,
        { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
      ],
      responses: {
        '204': { description: 'Deleted' },
        '404': { description: 'Not found' },
        '403': { description: 'Forbidden' },
      },
    },
  },

  '/admin/webhook-subscriptions/{id}/test': {
    post: {
      tags: ['Admin'],
      summary: 'Send a test event to a webhook subscription',
      description:
        "Sends one synthetic `opensteward.test` event, rendered in the subscription's own format, signed with its own secret and carrying its custom headers — so a destination can be proven to work without creating real data to trigger a real event. Nothing is queued and no delivery row is written, so a failed test is never retried and the delivery history stays a record of real events. A receiver that rejects the payload is reported as `ok: false` with its status; that is the answer to the question, not an API error. Works on a paused subscription.",
      security: [],
      parameters: [
        adminSecretHeader,
        { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
      ],
      responses: {
        '200': {
          description: 'Test attempted — inspect `ok` for the outcome',
          content: {
            'application/json': {
              schema: singleResponse('#/components/schemas/WebhookTestResult'),
            },
          },
        },
        '404': { description: 'Not found' },
        '403': { description: 'Forbidden' },
      },
    },
  },

  '/admin/webhook-subscriptions/{id}/deliveries': {
    get: {
      tags: ['Admin'],
      summary: 'List webhook delivery attempts',
      description:
        'Each row represents one (subscription × event) attempt. Failed deliveries retry with exponential backoff (`5s, 30s, 2m, 10m, 30m, 2h`) and dead-letter after 8 attempts.',
      security: [],
      parameters: [
        adminSecretHeader,
        { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        {
          name: 'status',
          in: 'query',
          schema: { type: 'string', enum: ['pending', 'delivered', 'dead'] },
        },
        { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 200 } },
      ],
      responses: {
        '200': {
          description: 'OK',
          content: {
            'application/json': {
              schema: listResponse('#/components/schemas/WebhookDelivery'),
            },
          },
        },
        '403': { description: 'Forbidden' },
      },
    },
  },

  '/admin/webhook-subscriptions/{id}/deliveries/{deliveryId}/replay': {
    post: {
      tags: ['Admin'],
      summary: 'Replay a dead-lettered delivery',
      description:
        'Resets the delivery to `pending` with `attempts=0` so the next worker tick picks it up. Receivers see the same `X-OI-Event-Id` so they can dedupe.',
      security: [],
      parameters: [
        adminSecretHeader,
        { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        {
          name: 'deliveryId',
          in: 'path',
          required: true,
          schema: { type: 'string', format: 'uuid' },
        },
      ],
      responses: {
        '202': {
          description: 'Replay scheduled',
          content: {
            'application/json': {
              schema: singleResponse('#/components/schemas/WebhookDelivery'),
            },
          },
        },
        '403': { description: 'Forbidden' },
        '404': { description: 'Delivery not found' },
      },
    },
  },

  '/admin/platforms/{vertical}/{slug}/config': {
    get: {
      tags: ['Admin'],
      summary: "Read a platform's config (redacted)",
      description:
        "Returns the platform's stored config with `clientSecret` removed and replaced by a `hasSecret: bool`. Used by the admin UI to prefill non-secret fields without ever re-handling the secret.",
      parameters: [adminSecretHeader, verticalPathParam, slugPathParam],
      responses: {
        '200': {
          description: 'OK',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  data: {
                    type: 'object',
                    properties: {
                      clientId: { type: ['string', 'null'] },
                      redirectUri: { type: ['string', 'null'] },
                      scopes: { type: ['array', 'null'], items: { type: 'string' } },
                      hasSecret: { type: 'boolean' },
                    },
                  },
                },
              },
            },
          },
        },
        '403': { description: 'Forbidden' },
        '404': { description: 'Unknown platform' },
      },
    },
    put: {
      tags: ['Admin'],
      summary: "Replace a platform's config",
      description:
        "Merges the provided config object with the stored config — fields not present in the body are kept. Pass `null` to clear a key. The platform is re-instantiated with the new config if it's currently enabled.",
      parameters: [adminSecretHeader, verticalPathParam, slugPathParam],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['config'],
              properties: { config: { type: 'object', additionalProperties: true } },
            },
          },
        },
      },
      responses: {
        '200': { description: 'OK' },
        '400': { description: 'Body must include a config object' },
        '403': { description: 'Forbidden' },
        '404': { description: 'Unknown platform' },
      },
    },
  },

  // ─── Admin sync-jobs (operator overview) ─────────────────────────────────
  '/admin/sync-jobs': {
    get: {
      tags: ['Admin'],
      summary: 'List sync jobs across every vertical',
      description:
        'Cross-tenant view. Tenant clients should use `GET /v1/{vertical}/sync` instead.',
      parameters: [
        adminSecretHeader,
        {
          name: 'vertical',
          in: 'query',
          description: 'Filter to one vertical.',
          schema: { $ref: '#/components/schemas/Vertical' },
        },
        { name: 'connection_id', in: 'query', schema: { type: 'string', format: 'uuid' } },
        {
          name: 'status',
          in: 'query',
          schema: { type: 'string', enum: ['pending', 'running', 'completed', 'failed'] },
        },
        { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 200 } },
      ],
      responses: {
        '200': {
          description: 'OK',
          content: { 'application/json': { schema: listResponse('#/components/schemas/SyncJob') } },
        },
        '403': { description: 'Forbidden' },
      },
    },
    post: {
      tags: ['Admin'],
      summary: 'Enqueue a sync job (operator)',
      description:
        'Operator alternative to `POST /v1/{vertical}/sync` (which is tenant-scoped). Resolves the vertical from the connection record, so only `connection_id` is required.',
      parameters: [adminSecretHeader],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['connection_id'],
              properties: {
                connection_id: { type: 'string', format: 'uuid' },
                callback_url: {
                  type: 'string',
                  format: 'uri',
                  description: 'Optional URL to POST sync.completed / sync.failed events to.',
                },
              },
            },
          },
        },
      },
      responses: {
        '202': {
          description: 'Job accepted',
          content: {
            'application/json': { schema: singleResponse('#/components/schemas/SyncJob') },
          },
        },
        '400': { description: 'connection_id required.' },
        '403': { description: 'Forbidden' },
        '404': { description: 'Connection not found.' },
        '409': { description: 'A pending or running sync already exists for this connection.' },
      },
    },
  },

  '/admin/sync-jobs/{id}': {
    get: {
      tags: ['Admin'],
      summary: 'Get a sync job by id (operator)',
      parameters: [
        adminSecretHeader,
        { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
      ],
      responses: {
        '200': {
          description: 'OK',
          content: {
            'application/json': { schema: singleResponse('#/components/schemas/SyncJob') },
          },
        },
        '403': { description: 'Forbidden' },
        '404': { description: 'Sync job not found.' },
      },
    },
  },

  '/admin/sync-jobs/{id}/cancel': {
    post: {
      tags: ['Admin'],
      summary: 'Cancel a sync job',
      description:
        'Marks the job failed with reason "cancelled by admin". Running workers see the status flip on next progress write and abort. Already-completed / already-failed jobs return 409.',
      parameters: [
        adminSecretHeader,
        { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
      ],
      responses: {
        '200': {
          description: 'Cancelled',
          content: {
            'application/json': { schema: singleResponse('#/components/schemas/SyncJob') },
          },
        },
        '403': { description: 'Forbidden' },
        '404': { description: 'Sync job not found.' },
        '409': { description: 'Job is already completed or failed.' },
      },
    },
  },

  // ─── Admin end-users (Connect Link customer admin) ───────────────────────
  '/admin/end-users': {
    get: {
      tags: ['Admin'],
      summary: 'List end-users (operator)',
      description:
        'Cross-tenant view of every Connect Link end-user. Tenant-scoped clients use `GET /v1/customers` instead.',
      parameters: [
        adminSecretHeader,
        { name: 'tenantId', in: 'query', schema: { type: 'string' } },
        {
          name: 'q',
          in: 'query',
          schema: { type: 'string' },
          description: 'Free-text search on email / displayName / externalReference.',
        },
        { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 200 } },
        { name: 'offset', in: 'query', schema: { type: 'integer', minimum: 0 } },
      ],
      responses: {
        '200': {
          description: 'OK',
          content: {
            'application/json': { schema: listResponse('#/components/schemas/Customer') },
          },
        },
        '403': { description: 'Forbidden' },
      },
    },
    post: {
      tags: ['Admin'],
      summary: 'Create an end-user (operator)',
      description: 'Cross-tenant admin path. Tenant clients should use `POST /v1/customers`.',
      parameters: [adminSecretHeader],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['tenantId', 'email'],
              properties: {
                tenantId: { type: 'string' },
                email: { type: 'string', format: 'email' },
                displayName: { type: ['string', 'null'] },
                externalReference: { type: ['string', 'null'] },
              },
            },
          },
        },
      },
      responses: {
        '201': {
          description: 'Created',
          content: {
            'application/json': { schema: singleResponse('#/components/schemas/Customer') },
          },
        },
        '400': { description: 'Validation error.' },
        '403': { description: 'Forbidden' },
      },
    },
  },

  '/admin/end-users/{id}': {
    get: {
      tags: ['Admin'],
      summary: 'Get an end-user with linked sessions + connections',
      parameters: [
        adminSecretHeader,
        customerIdPathParam,
        {
          name: 'include_pii',
          in: 'query',
          schema: { type: 'string', enum: ['true', 'false'] },
          description:
            'Decrypt and include PII fields. Each reveal writes a `pii_reveal` audit log line.',
        },
      ],
      responses: {
        '200': {
          description: 'OK',
          content: {
            'application/json': { schema: singleResponse('#/components/schemas/Customer') },
          },
        },
        '403': { description: 'Forbidden' },
        '404': { description: 'Not found' },
      },
    },
    patch: {
      tags: ['Admin'],
      summary: 'Update end-user fields (operator)',
      parameters: [adminSecretHeader, customerIdPathParam],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                displayName: { type: ['string', 'null'] },
                externalReference: { type: ['string', 'null'] },
                pii: { type: 'object', additionalProperties: true },
              },
            },
          },
        },
      },
      responses: {
        '200': {
          description: 'Updated',
          content: {
            'application/json': { schema: singleResponse('#/components/schemas/Customer') },
          },
        },
        '403': { description: 'Forbidden' },
        '404': { description: 'Not found' },
      },
    },
    delete: {
      tags: ['Admin'],
      summary: 'Delete an end-user',
      description:
        'Detaches any linked Connect Link sessions; does NOT delete connections. Operator-only.',
      parameters: [adminSecretHeader, customerIdPathParam],
      responses: {
        '204': { description: 'Deleted' },
        '403': { description: 'Forbidden' },
        '404': { description: 'Not found' },
      },
    },
  },

  // ─── Admin connect-sessions (Connect Link session audit) ─────────────────
  '/admin/connect-sessions': {
    get: {
      tags: ['Admin'],
      summary: 'List Connect Link sessions',
      parameters: [
        adminSecretHeader,
        { name: 'tenantId', in: 'query', schema: { type: 'string' } },
        { name: 'endUserId', in: 'query', schema: { type: 'string', format: 'uuid' } },
        {
          name: 'status',
          in: 'query',
          schema: { type: 'string', enum: ['active', 'consumed', 'revoked', 'expired'] },
        },
        { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 200 } },
        { name: 'offset', in: 'query', schema: { type: 'integer', minimum: 0 } },
      ],
      responses: {
        '200': {
          description: 'OK',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  data: { type: 'array', items: { type: 'object', additionalProperties: true } },
                },
              },
            },
          },
        },
        '403': { description: 'Forbidden' },
      },
    },
    post: {
      tags: ['Admin'],
      summary: 'Create a Connect Link session (operator)',
      description:
        'Operator path; tenant clients should use `POST /v1/customers/{id}/connect-links`. Upserts the customer if `customerEmail` is provided and no `endUserId` is set.',
      parameters: [adminSecretHeader],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['tenantId'],
              properties: {
                tenantId: { type: 'string' },
                endUserId: { type: ['string', 'null'], format: 'uuid' },
                customerEmail: { type: ['string', 'null'], format: 'email' },
                allowedVerticals: {
                  type: 'array',
                  items: { $ref: '#/components/schemas/Vertical' },
                },
                allowedPlatforms: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      vertical: { $ref: '#/components/schemas/Vertical' },
                      slug: {
                        type: 'string',
                        description:
                          'Adapter slug. See the `PlatformSlug` schema for the full list.',
                        example: 'fortnox',
                      },
                    },
                  },
                },
                redirectUrl: { type: ['string', 'null'], format: 'uri' },
                expiresInSeconds: { type: ['integer', 'null'] },
                createdBy: { type: ['string', 'null'] },
              },
            },
          },
        },
      },
      responses: {
        '201': {
          description: 'Created',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: { data: { type: 'object', additionalProperties: true } },
              },
            },
          },
        },
        '400': { description: 'Validation error' },
        '403': { description: 'Forbidden' },
      },
    },
  },

  '/admin/connect-sessions/{id}': {
    get: {
      tags: ['Admin'],
      summary: 'Get a Connect Link session with linked customer + connection',
      parameters: [
        adminSecretHeader,
        { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
      ],
      responses: {
        '200': {
          description: 'OK',
          content: {
            'application/json': { schema: { type: 'object', additionalProperties: true } },
          },
        },
        '403': { description: 'Forbidden' },
        '404': { description: 'Not found' },
      },
    },
    delete: {
      tags: ['Admin'],
      summary: 'Revoke a Connect Link session',
      description:
        'Marks the session revoked; existing connections that landed via the session are unaffected.',
      parameters: [
        adminSecretHeader,
        { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
      ],
      responses: {
        '204': { description: 'Revoked' },
        '403': { description: 'Forbidden' },
        '404': { description: 'Not found' },
      },
    },
  },

  // ─── Admin connection cache invalidation ─────────────────────────────────
  '/admin/connections/{id}/cache-clear': {
    post: {
      tags: ['Admin'],
      summary: 'Drop cached resources for a connection',
      description:
        'Removes the `resources` cache rows owned by this connection without deleting the connection itself. Useful after a manual upstream data fix or to recover from cache drift. The next `/v1/{vertical}/*` GET re-populates from upstream. No-op in `passthrough` mode.',
      parameters: [
        adminSecretHeader,
        { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
      ],
      responses: {
        '200': {
          description: 'Cache cleared',
          content: {
            'application/json': {
              schema: { type: 'object', properties: { ok: { type: 'boolean' } } },
            },
          },
        },
        '403': { description: 'Forbidden' },
        '404': { description: 'Connection not found.' },
        '409': {
          description: 'Connection has no `vertical` set.',
        },
      },
    },
  },

  // ─── Admin connection sync schedule ──────────────────────────────────────
  '/admin/connections/{id}/sync-schedule': {
    put: {
      tags: ['Admin'],
      summary: "Set a connection's sync schedule (operator)",
      description:
        "Replaces how often the connection's data is re-synced. `default` follows the deployment interval (the `data_store.sync.default_interval_minutes` runtime setting, 6 hours out of the box); `custom` syncs every `intervalMinutes` (15 minutes to 30 days, and only with `custom`); `trigger_only` never syncs automatically; `once` gives one automatic sync when connected. The reply carries the connection with its recomputed `sync` state, including the next sync time. In `passthrough` mode the schedule is stored but nothing syncs, and `sync` is null.",
      parameters: [adminSecretHeader, connectionIdPathParam],
      requestBody: {
        required: true,
        content: {
          'application/json': { schema: { $ref: '#/components/schemas/SyncSchedule' } },
        },
      },
      responses: {
        '200': {
          description: 'Updated',
          content: {
            'application/json': { schema: singleResponse('#/components/schemas/AdminConnection') },
          },
        },
        '400': {
          description:
            '`INVALID_SYNC_SCHEDULE` — an unknown mode, a `custom` schedule without `intervalMinutes`, an interval outside 15–43200, or an interval on any other mode.',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
        },
        '403': {
          description: 'Forbidden',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
        },
        '404': {
          description: '`CONNECTION_NOT_FOUND`',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
        },
      },
    },
  },
}

const apiKeySchema = {
  type: 'object',
  required: ['id', 'tenantId', 'prefix', 'scopes', 'createdAt'],
  properties: {
    id: { type: 'string', format: 'uuid', example: 'key_1042' },
    tenantId: { type: 'string', example: 'acme' },
    prefix: {
      type: 'string',
      description:
        'First 12 chars of the plaintext, used for indexed lookup. Display-only — not a credential.',
      example: 'osk_acme_8f3a',
    },
    label: { type: ['string', 'null'], example: 'Production key' },
    scopes: {
      type: 'array',
      items: { type: 'string' },
      example: ['customers:read', 'connections:read'],
    },
    createdAt: { type: 'integer', example: 1768469400000 },
    lastUsedAt: { type: ['integer', 'null'], example: 1769955600000 },
    revokedAt: { type: ['integer', 'null'], example: null },
  },
}

const apiKeyMintSchema = {
  allOf: [
    { $ref: '#/components/schemas/ApiKey' },
    {
      type: 'object',
      required: ['plaintext'],
      properties: {
        plaintext: {
          type: 'string',
          description:
            'The bearer token (`osk_…`). Returned exactly once at mint time and never refetchable — store it now.',
          example: 'osk_acme_8f3a2b9c4d5e6f7a8b9c0d1e2f3a4b5c',
        },
      },
    },
  ],
}

const webhookSubSchema = {
  type: 'object',
  required: ['id', 'tenantId', 'url', 'events', 'createdAt'],
  properties: {
    id: { type: 'string', format: 'uuid', example: 'whs_1042' },
    tenantId: { type: 'string', example: 'acme' },
    url: { type: 'string', format: 'uri', example: 'https://hooks.acme.example/opensteward' },
    label: {
      type: ['string', 'null'],
      description:
        'Human-friendly name for the subscription, or null when it has none. Purely descriptive — nothing routes on it.',
      example: 'Billing service',
    },
    events: {
      type: 'array',
      items: { type: 'string' },
      description: '`*` for all, exact event names, or prefix wildcards like `customer.*`.',
      example: ['customer.created'],
    },
    createdAt: { type: 'integer', example: 1768469400000 },
    lastFiredAt: { type: ['integer', 'null'], example: 1769955600000 },
    lastStatus: {
      type: ['integer', 'null'],
      description:
        'HTTP status code from the most recent delivery, or null if delivery failed at the network layer.',
      example: 200,
    },
    lastError: { type: ['string', 'null'], example: null },
    format: {
      type: 'string',
      enum: ['opensteward', 'slack', 'teams', 'flat'],
      description:
        'Payload shape POSTed to this endpoint. `opensteward` is the signed event envelope, `slack` renders Slack blocks, `teams` renders an Adaptive Card for a Teams Workflows URL, and `flat` is a one-level object with dotted keys.',
      example: 'opensteward',
    },
    headerNames: {
      type: 'array',
      items: { type: 'string' },
      description:
        'Names of the custom headers sent with each delivery. Values are stored encrypted and are never returned by the API.',
      example: ['X-Api-Key'],
    },
  },
}

const webhookTestResultSchema = {
  type: 'object',
  required: ['id', 'ok', 'status', 'format'],
  properties: {
    id: { type: 'string', format: 'uuid', example: 'whs_1042' },
    ok: {
      type: 'boolean',
      description:
        'True when the receiver answered 2xx. False means the destination rejected the payload or could not be reached.',
      example: true,
    },
    status: {
      type: ['integer', 'null'],
      description: 'HTTP status the receiver returned, or null when the request never completed.',
      example: 200,
    },
    format: {
      type: 'string',
      enum: ['opensteward', 'slack', 'teams', 'flat'],
      description: 'Format the test payload was rendered in.',
      example: 'slack',
    },
    sentBody: {
      type: 'string',
      description:
        'The exact bytes sent, so the payload can be inspected. Synthetic, and carries no secret.',
      example: '{"text":"Test event from OpenSteward"}',
    },
    error: {
      type: 'string',
      description: 'Why the request never completed, when it did not.',
      example: 'getaddrinfo ENOTFOUND hooks.example',
    },
  },
}

const webhookDeliverySchema = {
  type: 'object',
  required: [
    'id',
    'subscriptionId',
    'eventId',
    'eventType',
    'url',
    'status',
    'attempts',
    'createdAt',
  ],
  properties: {
    id: { type: 'string', format: 'uuid', example: 'whd_8f3a2b9c4d' },
    subscriptionId: { type: 'string', format: 'uuid', example: 'whs_1042' },
    eventId: {
      type: 'string',
      format: 'uuid',
      description: 'Mirrored in the X-OI-Event-Id header so receivers can dedupe across retries.',
      example: 'evt_8f3a2b9c4d',
    },
    eventType: { type: 'string', example: 'customer.created' },
    url: { type: 'string', format: 'uri', example: 'https://hooks.acme.example/opensteward' },
    status: { type: 'string', enum: ['pending', 'delivered', 'dead'], example: 'delivered' },
    attempts: { type: 'integer', example: 1 },
    nextAttemptAt: { type: 'integer', example: 1769955600000 },
    deliveredAt: { type: ['integer', 'null'], example: 1769955600000 },
    lastStatus: { type: ['integer', 'null'], example: 200 },
    lastError: { type: ['string', 'null'], example: null },
    createdAt: { type: 'integer', example: 1768469400000 },
  },
}

const webhookSubWithSecretSchema = {
  allOf: [
    { $ref: '#/components/schemas/WebhookSubscription' },
    {
      type: 'object',
      required: ['secret'],
      properties: {
        secret: {
          type: 'string',
          description:
            'Shared secret (hex). Returned exactly once on create — used by the receiver to HMAC-verify deliveries.',
          example: 'whsec_8f3a2b9c4d5e6f',
        },
      },
    },
  ],
}

// Vertical-agnostic SyncJob schema referenced by the unified
// `/v1/{vertical}/sync` paths. The per-vertical openapi.ts files also
// merge their own (prefixed) `<Vertical>SyncJob` schemas; we keep one
// un-prefixed copy here so the unified entries resolve.
const syncJobSchema = {
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
    tenantId: { type: ['string', 'null'], example: 'acme' },
    status: {
      type: 'string',
      enum: ['pending', 'running', 'completed', 'failed'],
      example: 'completed',
    },
    progress: {
      type: ['object', 'null'],
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
    error: { type: ['string', 'null'], example: null },
    callbackUrl: {
      type: ['string', 'null'],
      format: 'uri',
      example: 'https://hooks.acme.example/sync',
    },
    createdAt: { type: 'string', format: 'date-time', example: '2026-01-15T09:30:00Z' },
    startedAt: { type: ['string', 'null'], format: 'date-time', example: '2026-01-15T09:30:00Z' },
    completedAt: { type: ['string', 'null'], format: 'date-time', example: '2026-02-01T14:20:00Z' },
  },
  required: ['id', 'vertical', 'connectionId', 'platform', 'status', 'createdAt'],
}

/**
 * A sandbox connection.
 *
 * Shaped like `Connection` deliberately — the sandbox meta router says so in
 * its own comment, "so the same client code reads both" — but it is a strict
 * subset: there is no OAuth grant behind it, so no status, no expiry and no
 * external account. Its `id` is not stored anywhere either; it is derived
 * from (tenant, vertical) as a UUIDv5, which is what lets the sandbox
 * validate a `connection_id` against a whitelist it recomputes from the
 * verified key rather than a lookup.
 */
const sandboxConnectionSchema = {
  type: 'object',
  required: ['id', 'vertical', 'platform', 'label', 'tenantId'],
  properties: {
    id: {
      type: 'string',
      format: 'uuid',
      description:
        'Derived from (tenant, vertical). Stable for a tenant, and the value every sandbox request passes as `connection_id`.',
      example: 'ed57733f-b65b-56fc-93a9-5654d3183944',
    },
    vertical: { $ref: '#/components/schemas/Vertical' },
    platform: {
      type: 'string',
      enum: ['sandbox'],
      description: 'Always `sandbox` — no real adapter is constructed on this path.',
      example: 'sandbox',
    },
    label: { type: 'string', example: 'accounting sandbox' },
    tenantId: { type: 'string', example: 'default' },
  },
} as const

export const controlPlaneSchemas: Record<string, unknown> = {
  Connection: connectionSchema,
  AdminConnection: adminConnectionSchema,
  ConnectionSyncState: connectionSyncStateSchema,
  SyncSchedule: syncScheduleSchema,
  Customer: customerSchema,
  ConnectLink: connectLinkSchema,
  ApiKey: apiKeySchema,
  ApiKeyMint: apiKeyMintSchema,
  WebhookSubscription: webhookSubSchema,
  WebhookTestResult: webhookTestResultSchema,
  WebhookSubscriptionWithSecret: webhookSubWithSecretSchema,
  WebhookDelivery: webhookDeliverySchema,
  Platform: platformSchema,
  AdapterRow: adapterRowSchema,
  SyncJob: syncJobSchema,
  WebhookEvent: webhookEventSchema,
  WebhookForwardEnvelope: webhookForwardEnvelopeSchema,
  InboundEvent: inboundEventSchema,
  SandboxConnection: sandboxConnectionSchema,
  Capabilities: capabilitiesSchema,
}

export const controlPlaneSecuritySchemes: Record<string, unknown> = {
  ApiKeyAuth: {
    type: 'http',
    scheme: 'bearer',
    bearerFormat: 'osk_…',
    description: [
      'Tenant-scoped developer API key. Send as `Authorization: Bearer <key>`.',
      '',
      'Mint a key via the admin UI (Admin → API keys → Mint key) or the CLI:',
      '`pnpm --filter integration-server mint-api-key --tenant <id> [--label <label>]`.',
      '',
      'Each key carries a list of scopes. **Vertical access uses a two-axis model**:',
      '- *Touch axis* (always required): `*`, `vertical:<v>`, `vertical:read`, or `vertical:write` controls **which** verticals the key can see.',
      '- *Verb axis* (only on POST/PATCH/PUT/DELETE): `*` or `vertical:write` controls **whether** the key can mutate vertical data.',
      '',
      'Customers / connections / connect-links use a flat `:read` / `:write` split. Common scopes:',
      '- `*` — full access.',
      '- `customers:read`, `customers:write`, `customers:read_pii` — customer management + PII reveal.',
      '- `connections:read`, `connections:write` — list / mutate connections.',
      '- `connect-links:write` — spawn hosted Connect Link sessions.',
      '- `vertical:read` — GET on every `/v1/{vertical}/*`.',
      '- `vertical:write` — required for any non-GET on `/v1/{vertical}/*`.',
      '- `vertical:accounting` / `vertical:crm` / `vertical:ecommerce` / `vertical:logistics` / `vertical:payments` / `vertical:docsign` / `vertical:projects` / `vertical:customer-support` / `vertical:inventory` — touch-axis access to one specific vertical.',
      '',
      'See [/guides/dev-api.md §3](/guides/dev-api.md#3-scopes) for the full scope reference, examples, and the "safe default" mint preset (everything except `vertical:write`).',
      '',
      'A request without the required scope returns `403 INSUFFICIENT_SCOPE`.',
    ].join('\n'),
  },
  OAuth2Bearer: {
    type: 'http',
    scheme: 'bearer',
    bearerFormat: 'JWT',
    description: [
      'OIDC bearer token issued by an identity provider the operator has registered, accepted on the same `/v1/*` surface as `ApiKeyAuth`. Send as `Authorization: Bearer <jwt>`.',
      '',
      'Off unless the operator has enabled it (`auth.dev_oauth_enabled`) and registered an issuer under Admin → OAuth clients. When it is off, a JWT is refused with `403 OAUTH_DISABLED`; when API keys are off, an `osk_` key is refused with `403 API_KEYS_DISABLED`.',
      '',
      "Get the token from the operator's IdP — Keycloak, Auth0, Okta and Entra ID ship as presets, and any issuer publishing an OpenID discovery document works. OpenSteward only verifies: it never mints these tokens and holds no client secret.",
      '',
      "The token resolves to the **same scope vocabulary** as a dev key — the two-axis vertical model, `customers:*`, `mcp:read` and the rest — so a route requiring `vertical:write` requires it identically here. Where those scopes come from is the operator's choice per issuer: from a registered client row, from the token's own scope claim, or from the row narrowed by the claim.",
      '',
      "Every verification failure answers `401 UNAUTHENTICATED` with the same body, deliberately: distinguishing a bad signature from an unregistered client would enumerate the operator's service accounts. The reason is in the deployment's logs.",
      '',
      'This scheme is not declared with a `tokenUrl`, because the spec is static and deterministic while the token endpoint differs per deployment. Ask the operator for their issuer and audience.',
    ].join('\n'),
  },
  AdminSecret: {
    type: 'apiKey',
    in: 'header',
    name: 'X-Admin-Secret',
    description: [
      'Operator-only secret for `/admin/*` and a small number of platform-management routes. **Distinct from a developer key** — never give the admin secret to an external integrator.',
      '',
      'The value is the `ADMIN_SECRET` env var on the integration-server. Used for: enabling/disabling platforms, setting platform OAuth credentials, listing every adapter across verticals, deleting any connection by UUID. End-user / developer flows should use a Bearer dev key instead.',
    ].join('\n'),
  },
}

export const controlPlaneTags = [
  {
    name: 'Sandbox',
    description:
      'The test-mode control surface. `/test/v1/*` serves synthetic data with an `osk_test_…` key — or a token from the deployment\u2019s own **test issuer** (`/test/oidc`: discovery, JWKS, and `POST /token`, which trades a test key for an OIDC bearer) — and makes no outbound call to any platform. Sandbox-only routes here: self-serve keys (`POST /test/v1/keys`), connection discovery (`GET /test/v1/connections` — start there), data reset (`DELETE /test/v1/reset`), and the **mock OAuth ceremony** (`/test/v1/auth/{vertical}/sandbox/connect` → hosted authorize page or `?outcome=…` → `/callback` granting the derived connection id). The tenant control plane (customers, connections, events, webhook-subscriptions) and a curated platform catalog are served under `/test/v1` too, and every vertical resource route mirrors `/v1/*` — pick the sandbox entry in the Servers dropdown to try one. Sandbox connect links open a hosted mock picker/authorize/done journey (HTML pages, unpublished here — see the dev-api guide).',
  },
  {
    name: 'Platform',
    description:
      "Service health + platform catalog. The unified-backend surface that isn't per-vertical.",
  },
  {
    name: 'Auth',
    description: 'OAuth connect / callback / revoke for every (vertical, platform) pair.',
  },
  {
    name: 'Connections',
    description:
      'Connection management — list / get / rename / delete a single OAuth connection. Tenant-scoped routes (`/v1/connections*`) use a Bearer dev key + `connections:*` scope and are exercisable in test mode (`/test/v1/connections*`); operator-only routes (`/admin/connections*`) require `X-Admin-Secret` and span every tenant.',
  },
  {
    name: 'Customers',
    description:
      'Customer (end-user) management + Connect Link creation. Tenant-scoped developer API.',
  },
  {
    name: 'Events',
    description:
      'Verified inbound platform events, tenant-scoped. Poll `GET /v1/events` with the monotonic `seq` cursor; the same stream is available with synthetic rows in test mode at `/test/v1/events`.',
  },
  {
    name: 'Sync',
    description:
      'Background full-sync jobs across the five verticals. POST `/v1/{vertical}/sync` enqueues; the per-vertical SyncWorker drains. Operator overview via `/admin/sync-jobs`.',
  },
  {
    name: 'Webhooks',
    description:
      'Inbound webhook normalisation. Verifies signatures, fans out across connections, optionally forwards to a callback URL.',
  },
  {
    name: 'Admin',
    description:
      'Operator-only routes gated by `X-Admin-Secret` — platform management, cross-tenant connection inspection, sync-job admin.',
  },
]
