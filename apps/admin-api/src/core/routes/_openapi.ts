/**
 * Shared Zod building blocks used across every admin-api route file.
 *
 * The schemas in this module are the source of truth for both runtime
 * validation (via `fastify-zod-openapi`'s validator compiler) AND the
 * generated `docs/openapi/admin-api.openapi.json` snapshot. Nothing
 * here is hand-written OpenAPI — it's plain Zod that the bridge turns
 * into JSON Schema.
 *
 * Component registration: every schema that appears in two or more
 * routes is tagged with `.meta({ id: '<Name>' })`. `zod-openapi`
 * (under `fastify-zod-openapi`) hoists those schemas into
 * `components/schemas/<Name>` and rewrites every inline use into a
 * `$ref`. The resulting spec is dramatically smaller AND every
 * downstream consumer (SDK, CLI, Postman) gets a real named type
 * instead of an anonymous `additionalProp1/2/3` blob.
 *
 * Common return shapes:
 *   - `dataEnvelope(schema)`  → `{ data: <schema> }`             (200 list/get/create)
 *   - `dataNullable(schema)`  → `{ data: <schema> | null }`      (200 get-one-or-null)
 *   - `okEnvelope()`          → `{ ok: true }`                    (200 ack)
 *   - `errorBody()`           → `{ error: string | object, ... }` (4xx/5xx)
 *
 * The error body union covers both shapes handlers send —
 * `error: string` for terse messages, `error: { code, message, ... }`
 * for the SCIM / runtime-settings handlers that nest a code. The admin
 * frontend accepts both.
 */
import { z } from 'zod'
// `fastify-zod-openapi` re-exports `zod-openapi` and pulls in the
// `declare module 'zod/v4' { interface GlobalMeta extends
// ZodOpenApiMetadata {} }` augmentation at compile-time, so the `id` /
// `param` / `header` keys on `.meta()` resolve without us importing
// `zod-openapi` directly here (it's a transitive dep, not in
// admin-api's package.json).
import 'fastify-zod-openapi'
import { OidcConfigSchema, SamlConfigSchema, LdapConfigSchema } from '../auth/idp/types'
import { CompanyInfoSchema, PERMISSIONS, SYNC_MODES, SyncScheduleSchema } from '@opensteward/shared'
// Top-level so module init order is deterministic — the audit registry
// is the source of truth for the `AuditEntry.detail` discriminated union
// and must be evaluated before `AuditEntry` is constructed below.
import { AuditDetailDoc } from '../db/audit-actions'

// ── Envelopes ─────────────────────────────────────────────────────────────

/** `{ data: <schema> }` — the canonical 2xx envelope across admin-api. */
export function dataEnvelope<T extends z.ZodTypeAny>(schema: T) {
  return z.object({ data: schema })
}

/** `{ data: <schema> | null }` — used by getter routes that 200 with null. */
export function dataNullable<T extends z.ZodTypeAny>(schema: T) {
  return z.object({ data: schema.nullable() })
}

/**
 * `{ data: [<schema>], meta: PaginationMeta }` — the canonical list envelope.
 *
 * `PaginationMeta` is declared further down this module (next to the audit
 * schemas), so it's referenced lazily inside the function body — which is
 * only evaluated at call time, after the whole module has initialised — to
 * avoid a use-before-define on the const.
 */
export function listEnvelope<T extends z.ZodTypeAny>(schema: T) {
  return z.object({ data: z.array(schema), meta: PaginationMeta })
}

/** Some POST routes that don't return a resource send `{ ok: true }`. */
export const okEnvelope = z.object({ ok: z.literal(true) })

/**
 * Generic error body. Both the terse-string and the structured-object
 * shapes are produced by the existing handlers; this union documents
 * that reality. Detail / issues / code are optional passthroughs.
 */
export const errorBody = z
  .object({
    error: z
      .union([
        z.string(),
        z
          .object({
            code: z.string().optional().meta({
              description: 'Machine-readable error code, e.g. `invalid_request`.',
              example: 'invalid_request',
            }),
            message: z.string().optional().meta({
              description: 'Human-readable error message.',
              example: 'Request validation failed.',
            }),
          })
          .loose(),
      ])
      .meta({
        description:
          'Error payload: either a terse string message or a structured object with `code`/`message`.',
        example: 'Not found',
      }),
    // Coarse category + correlation id, attached by the central error handler.
    type: z.string().optional().meta({
      description:
        'Coarse error category: `validation`, `auth`, `not_found`, `conflict`, `rate_limit`, or `internal`.',
      example: 'not_found',
    }),
    requestId: z.string().optional().meta({
      description:
        'Correlation id for the request; also returned in the `X-Request-Id` response header. Quote it when reporting an issue.',
      example: 'req-8f3a2b9c',
    }),
    // Some handlers attach issue arrays from Zod or detail strings from
    // upstream errors. Documented as optional passthroughs so consumers
    // know they can appear without making them required on every route.
    issues: z.array(z.unknown()).optional().meta({
      description:
        'Validation issues (e.g. from Zod) when the error stems from request validation.',
      example: [],
    }),
    detail: z.string().optional().meta({
      description: 'Additional detail, often forwarded from an upstream error.',
      example: 'Upstream returned 404.',
    }),
  })
  .loose()
  .meta({
    id: 'ErrorBody',
    description:
      'Standard error response. `error` is a string for terse messages or an object for structured codes; every response also carries an `X-Request-Id` header for correlation.',
  })

/**
 * Empty response — for 204 No Content. Modelled as `z.null()` with a
 * `noContent` description; `fastify-zod-openapi` refuses `z.void()` and
 * Fastify's default serializer happily handles a null/empty body when
 * the handler calls `reply.status(204).send()`.
 */
export const noContent = z.null().meta({ description: 'No content' })

// ── Shared primitives ─────────────────────────────────────────────────────

/** ISO 8601 timestamp with timezone offset — what every admin-api timestamp
 *  surface SHOULD emit. Internal storage stays integer epoch-ms; the route
 *  layer normalises with `toIsoTimestamp` at the boundary. */
export const IsoTimestamp = z
  .string()
  .meta({ format: 'date-time', description: 'ISO 8601 date-time (e.g. 2026-04-21T22:00:00.000Z).' })

/** Some handlers pass through raw epoch-millis or a mix of number / string.
 *  `LegacyTimestamp` documents that union. Prefer `IsoTimestamp` wherever
 *  possible. */
export const LegacyTimestamp = z.union([z.number(), z.string()])

/**
 * Response fields that carry a timestamp. The `preSerialization` hook
 * (see `core/server.ts`) walks every response body and rewrites any value
 * under one of these keys from epoch-millis to a strict ISO 8601 string, so
 * the whole admin-api surface emits ISO uniformly without each handler having
 * to convert. Conversion is idempotent — an already-ISO string passes through
 * unchanged — so proxied upstream payloads that are already ISO are safe.
 */
export const TIMESTAMP_RESPONSE_KEYS: ReadonlySet<string> = new Set([
  'createdAt',
  'updatedAt',
  'lastUsedAt',
  'lastVerifiedAt',
  'lastFiredAt',
  'lastRefreshAt',
  'revokedAt',
  'expiresAt',
  'consumedAt',
  'nextAttemptAt',
  'deliveredAt',
  'startedAt',
  'completedAt',
  'appliedAt',
  'heartbeatAt',
  'fetchedAt',
  'lastFetchedAt',
  // snake_case variants emitted by some handlers
  'created_at',
  'updated_at',
  'applied_at',
  'last_used_at',
])

/**
 * Recursively rewrite every timestamp-keyed value in a response payload to an
 * ISO 8601 string. Non-timestamp values are untouched. Used by the
 * `preSerialization` hook so the conversion is centralised and total — no
 * handler can forget to convert and leak an epoch-millis integer.
 */
export function isoifyTimestamps(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(isoifyTimestamps)
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
      out[key] = TIMESTAMP_RESPONSE_KEYS.has(key)
        ? typeof v === 'number' || v instanceof Date
          ? toIsoTimestamp(v)
          : v
        : isoifyTimestamps(v)
    }
    return out
  }
  return value
}

/** Map an HTTP status code to the coarse `type` category surfaced on errors. */
export function errorCategory(code: number): string {
  if (code === 401 || code === 403) return 'auth'
  if (code === 404) return 'not_found'
  if (code === 409) return 'conflict'
  if (code === 429) return 'rate_limit'
  if (code >= 500) return 'internal'
  if (code >= 400) return 'validation'
  return 'error'
}

/**
 * Attach `type` (coarse category) + `requestId` (correlation id, mirrors the
 * `X-Request-Id` header) to error response bodies, uniformly — many handlers
 * `reply.send({ error })` directly and bypass the central error handler, so we
 * enrich at the `preSerialization` boundary instead. Only touches 4xx/5xx
 * object bodies that carry an `error` key; idempotent (won't overwrite values a
 * handler already set).
 */
export function enrichErrorBody(payload: unknown, statusCode: number, requestId: string): unknown {
  if (statusCode < 400) return payload
  if (payload && typeof payload === 'object' && !Array.isArray(payload) && 'error' in payload) {
    const p = payload as Record<string, unknown>
    return { ...p, type: p.type ?? errorCategory(statusCode), requestId: p.requestId ?? requestId }
  }
  return payload
}

/** Convert an arbitrary timestamp (epoch ms, Date, ISO string, undefined)
 *  to a strict ISO 8601 string. Used by handlers that read from int-epoch
 *  DB columns and need to emit ISO over the wire. */
export function toIsoTimestamp(input: number | string | Date | null | undefined): string | null {
  if (input === null || input === undefined) return null
  if (input instanceof Date) {
    const t = input.getTime()
    return Number.isNaN(t) ? null : input.toISOString()
  }
  if (typeof input === 'number') {
    const d = new Date(input)
    return Number.isNaN(d.getTime()) ? null : d.toISOString()
  }
  if (typeof input === 'string') {
    if (!input) return null
    if (/^\d+$/.test(input)) {
      const d = new Date(Number(input))
      return Number.isNaN(d.getTime()) ? null : d.toISOString()
    }
    const d = new Date(input)
    return Number.isNaN(d.getTime()) ? null : d.toISOString()
  }
  return null
}

// ── Role / user ──────────────────────────────────────────────────────────

/**
 * The nine verticals. A closed set, so every `vertical` parameter is a
 * dropdown in the API console rather than a free-text box — matching the
 * public spec, where `#/components/schemas/Vertical` plays the same role.
 *
 * Adapter slugs deliberately stay `z.string()`: the CLI generator turns
 * query/body enums into `choices`, and there are ~1,500 slugs.
 */
export const VERTICAL_NAMES = [
  'accounting',
  'crm',
  'ecommerce',
  'logistics',
  'payments',
  'docsign',
  'projects',
  'customer-support',
  'inventory',
] as const

/**
 * A vertical in a PATH position: documented as an enum, validated as a string.
 *
 * Deliberate. These routes answer `404 Unknown vertical` from the handler
 * (`aggregator.knownVertical()`), which their `description` and `responses`
 * both promise. A `z.enum` would reject at validation with a `400` instead —
 * a contract change for every client, as a side effect of a docs improvement.
 * The API console still renders a dropdown, because the emitted schema carries
 * the enum either way.
 */
export const VerticalPathSchema = z.string().meta({
  enum: [...VERTICAL_NAMES],
  description: 'One of the nine verticals OpenSteward maps to a canonical API.',
  example: 'accounting',
})

export const VerticalEnum = z
  .enum([
    'accounting',
    'crm',
    'ecommerce',
    'logistics',
    'payments',
    'docsign',
    'projects',
    'customer-support',
    'inventory',
  ])
  .meta({
    id: 'Vertical',
    description: 'One of the nine verticals OpenSteward maps to a canonical API.',
    example: 'accounting',
  })
export type Vertical = z.infer<typeof VerticalEnum>

/** A platform adapter slug. Free text by design — see VerticalEnum's note. */
export const PlatformSlugSchema = z.string().meta({
  description:
    'Adapter slug identifying an upstream platform, e.g. `fortnox`. See GET /api/platforms.',
  example: 'fortnox',
})

/** Role discriminator used by users + SSO routes. */
export const RoleEnum = z.enum(['admin', 'operator', 'viewer']).meta({ id: 'Role' })
export type Role = z.infer<typeof RoleEnum>

// ── Permissions, roles and scope ──────────────────────────────────────────

/** One fine-grained permission from the catalog in `@opensteward/shared`. */
export const PermissionEnum = z.enum(PERMISSIONS).meta({
  id: 'Permission',
  description: 'A fine-grained operator permission. See `GET /api/permissions` for the catalog.',
  example: 'data:read',
})

/** One tenant a restricted user may see. */
export const ScopeGrant = z
  .object({
    tenantId: z.string().min(1).max(64).meta({
      description: 'Tenant the grant covers.',
      example: 'acme',
    }),
    verticals: z
      .union([z.literal('*'), z.array(z.string().min(1).max(64))])
      .meta({
        description: 'Verticals within the tenant: `*` for every vertical, or a list.',
        example: '*',
      }),
  })
  .meta({ id: 'ScopeGrant', description: 'Tenant (and optionally verticals) a scoped user may see.' })

export const ScopeMode = z.enum(['all', 'restricted']).meta({
  id: 'ScopeMode',
  description: '`all` sees every tenant; `restricted` only the granted ones.',
  example: 'all',
})

/** A user's tenant scope as the API reports it. */
export const AccessScope = z
  .object({
    mode: ScopeMode.meta({
      description: '`all` sees every tenant; `restricted` only the tenants in `grants`.',
      example: 'restricted',
    }),
    grants: z.array(ScopeGrant).meta({
      description: 'Tenants granted. Empty when `mode` is `all`; a restricted user with none sees nothing.',
      example: [{ tenantId: 'acme', verticals: '*' }],
    }),
  })
  .meta({ id: 'AccessScope', description: 'Which tenants a console user may see.' })

/** A role — built-in or custom — with its effective permissions. */
export const RoleDefinition = z
  .object({
    id: z.string().meta({
      description: 'Role id: `admin`, `operator` or `viewer` for built-ins, a UUID for custom roles.',
      example: 'operator',
    }),
    name: z.string().meta({ description: 'Display name; unique, case-insensitively.', example: 'Support lead' }),
    description: z.string().nullable().meta({
      description: 'What the role is for; null when unset.',
      example: 'Reads data for the accounts they support.',
    }),
    baseRole: RoleEnum.meta({
      description: 'Built-in level a holder is treated as by role-gated routes (and in the JWT).',
      example: 'operator',
    }),
    permissions: z.array(PermissionEnum).meta({
      description: 'Effective permissions. For built-ins these are defined in code.',
      example: ['connections:read', 'data:read'],
    }),
    isBuiltin: z.boolean().meta({ description: 'True for the three immutable built-in roles.', example: false }),
    createdAt: IsoTimestamp.meta({ description: 'When the role was created (ISO 8601).', example: '2026-01-15T09:30:00Z' }),
    updatedAt: IsoTimestamp.meta({ description: 'When the role was last changed (ISO 8601).', example: '2026-02-01T14:20:00Z' }),
    updatedBy: z.string().nullable().meta({ description: 'User who last changed it; null for seeded built-ins.', example: 'usr_olivia' }),
  })
  .meta({ id: 'RoleDefinition', description: 'A built-in or custom role and the permissions it grants.' })

/** One entry of the permission catalog. */
export const PermissionInfo = z
  .object({
    id: PermissionEnum.meta({ description: 'Permission identifier.', example: 'data:read_pii' }),
    description: z.string().meta({
      description: 'What holding the permission allows.',
      example: 'Reveal masked PII fields in synced records (every reveal is audited).',
    }),
    builtinRoles: z.array(RoleEnum).meta({
      description: 'Built-in roles that hold this permission.',
      example: ['admin'],
    }),
  })
  .meta({ id: 'PermissionInfo', description: 'A permission from the catalog and which built-in roles hold it.' })

/**
 * A console user's profile fields (admin_store v7), shared by `User`,
 * `UserDetail` and `MePayload`. Optional on the wire so older responses
 * (and the handful of handlers that build a narrower user view) still
 * validate.
 */
const ProfileViewFields = {
  email: z.string().nullable().optional().meta({
    description:
      'Email address, or null when none is set. Set by an admin, or copied from the identity provider (OIDC `email`, SAML email attribute, SCIM `emails`).',
    example: 'olivia@northwind.example',
  }),
  avatarUrl: z.string().nullable().optional().meta({
    description:
      'Path of the profile picture on this API (`GET /api/users/{id}/avatar`), versioned with `?v=` so it changes whenever the picture does; null when the user has none.',
    example: '/api/users/usr_olivia/avatar?v=9f86d081884c7d65',
  }),
  avatarVersion: z.string().nullable().optional().meta({
    description:
      'Short content hash of the profile picture, for cache-busting a proxied copy; null when the user has none.',
    example: '9f86d081884c7d65',
  }),
}

/** The user shape returned by /api/users etc. — id, username, role, and the
 *  audit columns. `createdAt` accepts the legacy number-or-string union
 *  because the existing handlers vary; new code should prefer ISO. */
export const User = z
  .object({
    id: z.string().meta({
      description: 'Stable identifier for the admin user (prefix `usr_`).',
      example: 'usr_olivia',
    }),
    username: z.string().meta({
      description:
        'Login name used for local (password) authentication; unique within the deployment.',
      example: 'olivia.admin',
    }),
    ...ProfileViewFields,
    role: RoleEnum.meta({
      description:
        'Access level: `admin` (full control), `operator` (manage resources), or `viewer` (read-only).',
      example: 'admin',
    }),
    roleId: z.string().optional().meta({
      description:
        'Effective role id: a custom role id, or the built-in id when no custom role is assigned.',
      example: 'operator',
    }),
    roleName: z.string().optional().meta({
      description: 'Display name of the effective role.',
      example: 'operator',
    }),
    scopeMode: ScopeMode.optional().meta({
      description: '`restricted` when the account only sees some tenants.',
      example: 'all',
    }),
    createdAt: IsoTimestamp.nullable().optional().meta({
      description: 'When the user account was created (ISO 8601); null when not recorded.',
      example: '2026-01-15T09:30:00Z',
    }),
    updatedAt: IsoTimestamp.nullable().optional().meta({
      description: 'When the user account was last modified (ISO 8601); null if never updated.',
      example: '2026-02-01T14:20:00Z',
    }),
  })
  .loose()
  .meta({
    id: 'User',
    description: 'An admin-console user account (id, login, role, and audit timestamps).',
  })
export type User = z.infer<typeof User>

/** /api/auth/me payload shape — narrower than User; reflects the JWT claim. */
export const MePayload = z
  .object({
    id: z.string().meta({
      description: 'Identifier of the authenticated user (prefix `usr_`).',
      example: 'usr_olivia',
    }),
    username: z
      .string()
      .meta({ description: 'Login name of the authenticated user.', example: 'olivia.admin' }),
    ...ProfileViewFields,
    role: RoleEnum.meta({
      description: 'Access level granted to the authenticated user.',
      example: 'admin',
    }),
    roleId: z.string().optional().meta({
      description:
        'Effective role (custom role id, or the built-in id). Present on `GET /api/auth/me`; read from the database, so it reflects a change made since the token was issued.',
      example: 'operator',
    }),
    roleName: z.string().optional().meta({
      description: 'Display name of the effective role. Present on `GET /api/auth/me`.',
      example: 'operator',
    }),
    permissions: z.array(PermissionEnum).optional().meta({
      description: 'Effective permissions. Present on `GET /api/auth/me`.',
      example: ['connections:read', 'dashboards:view'],
    }),
    scope: AccessScope.optional().meta({
      description: 'Tenant scope. Present on `GET /api/auth/me`.',
    }),
  })
  .loose()
  .meta({
    id: 'MePayload',
    description: 'Identity of the currently authenticated user, derived from the JWT claims.',
  })

/** Auth-token response from /api/auth/login, /api/auth/setup, /api/sso/*. */
export const AuthTokenResponse = z
  .object({
    token: z.string().meta({
      description:
        'Signed JWT bearer token; send as `Authorization: Bearer <token>` on subsequent requests.',
      example: 'eyJhbGciOiJIUzI1NiJ9.olivia',
    }),
    user: MePayload.meta({ description: 'Identity of the user the token was issued for.' }),
  })
  .meta({
    id: 'AuthTokenResponse',
    description: 'Successful authentication result: a bearer token plus the authenticated user.',
  })

/** /api/auth/me response shape (raw — auth exception, not data-envelope). */
export const MeResponse = z
  .object({
    user: MePayload.nullable().meta({
      description: 'The authenticated user, or null if the request is unauthenticated.',
    }),
  })
  .meta({
    id: 'MeResponse',
    description:
      'Response of `GET /api/auth/me` describing the current session, or null when not signed in.',
  })

// Back-compat alias — kept so older imports keep compiling.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export const UserSummary = User

// ── Connection ────────────────────────────────────────────────────────────

export const ConnectionStatus = z
  .enum(['valid', 'expiring_soon', 'expired', 'platform_error'])
  .meta({ id: 'ConnectionStatus' })

// The shared schema is the validator, so its bounds and its two refinements
// are the ones integration-server applies too. `safeExtend` (not `extend`,
// which refuses a refined object) re-declares the same two fields only to
// attach their docs: `check:openapi-examples` needs an example on each.
export const ConnectionSyncSchedule = SyncScheduleSchema.safeExtend({
  mode: SyncScheduleSchema.shape.mode.meta({
    description:
      '`default` (the deployment interval), `custom` (every `intervalMinutes`), `trigger_only` (only when a sync is requested) or `once` (one sync when connected).',
    example: 'custom',
  }),
  intervalMinutes: SyncScheduleSchema.shape.intervalMinutes.meta({
    description:
      'Minutes between syncs, 15–43200 (30 days). Required for `custom`; refused with any other mode.',
    example: 120,
  }),
}).meta({
  id: 'ConnectionSyncSchedule',
  description:
    "How often a connection's data is re-synced. `default` follows the deployment interval (runtime setting `data_store.sync.default_interval_minutes`); `custom` uses `intervalMinutes` (15–43200); `trigger_only` never syncs automatically, not even when connected; `once` syncs once when connected.",
})

export const ConnectionSyncState = z
  .object({
    mode: z.enum(SYNC_MODES).meta({ description: 'The schedule in force.', example: 'default' }),
    intervalMinutes: z.number().int().nullable().meta({
      description: 'The connection’s own interval; null unless `mode` is `custom`.',
      example: null,
    }),
    effectiveIntervalMinutes: z.number().int().nullable().meta({
      description:
        'The interval that applies — the custom one or the deployment’s; null for `trigger_only` and `once`.',
      example: 360,
    }),
    defaultIntervalMinutes: z.number().int().meta({
      description: 'The deployment interval, for labelling the default choice.',
      example: 360,
    }),
    lastSyncedAt: z.number().int().nullable().meta({
      description: 'When the last successful sync finished (epoch ms); null if never.',
      example: 1769949600000,
    }),
    lastAttemptAt: z.number().int().nullable().meta({
      description: 'When the last sync of any outcome finished (epoch ms).',
      example: 1769949600000,
    }),
    lastStatus: z.enum(['completed', 'failed']).nullable().meta({
      description: 'Outcome of the last finished sync.',
      example: 'completed',
    }),
    consecutiveFailures: z.number().int().meta({
      description: 'Failed syncs since the last success; retries back off from 15 minutes.',
      example: 0,
    }),
    active: z.boolean().meta({ description: 'A sync is pending or running now.', example: false }),
    nextSyncAt: z.number().int().nullable().meta({
      description:
        'When the scheduler will next queue a sync (epoch ms); null when it will not on its own — trigger only, a spent one-time sync, a sync in flight, or paused.',
      example: 1769971200000,
    }),
    pausedReason: z.enum(['needs_reauthorization', 'platform_error']).nullable().meta({
      description: 'Why an automatic schedule is on hold.',
      example: null,
    }),
  })
  .meta({
    id: 'ConnectionSyncState',
    description: 'A connection’s sync schedule as the scheduler sees it right now.',
  })

/** Connection row as surfaced by /api/connections — pass-through of the
 *  unified backend's shape with `vertical` tagged onto each entry. */
export const Connection = z
  .object({
    id: z.string().meta({
      description: 'Identifier of the connection (prefix `conn_`).',
      example: 'conn_1042',
    }),
    platform: z.string().meta({
      description: 'Slug of the connected platform/adapter, e.g. `xero`.',
      example: 'xero',
    }),
    vertical: z.string().meta({
      description: 'Vertical the platform belongs to, e.g. `accounting`.',
      example: 'accounting',
    }),
    tenantId: z.string().nullable().optional().meta({
      description:
        'Tenant (operator customer) that owns this connection; null when the connection is not scoped to a tenant.',
      example: 'acme',
    }),
    label: z.string().nullable().optional().meta({
      description: 'Human-friendly name for the connection; null if unset.',
      example: 'Acme onboarding',
    }),
    status: ConnectionStatus.meta({
      description:
        'Credential health: `valid`, `expiring_soon`, `expired` (customer must re-authorize), or `platform_error` (the platform OAuth client credentials were rejected — operator must fix the client id/secret).',
      example: 'valid',
    }),
    expiresAt: z.string().nullable().optional().meta({
      description: 'When the connection credentials expire (ISO 8601); null if they do not expire.',
      example: '2026-03-01T09:30:00.000Z',
    }),
    createdAt: z.string().meta({
      description: 'When the connection was first established (ISO 8601).',
      example: '2026-01-15T09:30:00.000Z',
    }),
    updatedAt: z.string().meta({
      description: 'When the connection was last modified (ISO 8601).',
      example: '2026-02-01T10:00:00.000Z',
    }),
    lastRefreshAt: IsoTimestamp.nullable().optional().meta({
      description:
        'When the connection token was last refreshed (ISO 8601); null if never refreshed.',
      example: '2026-02-01T14:20:00Z',
    }),
    lastRefreshStatus: z.enum(['ok', 'failed', 'expired', 'platform_error']).nullable().optional().meta({
      description: 'Outcome of the most recent token refresh attempt; null if never refreshed.',
      example: 'ok',
    }),
    lastRefreshError: z.string().nullable().optional().meta({
      description:
        'Why the most recent refresh attempt failed — the OAuth error code, its description and the HTTP status. Null when the last attempt succeeded. Never contains the response body or request headers.',
      example: 'invalid_grant — Refresh token has expired — HTTP 400',
    }),
    syncMode: z.enum(SYNC_MODES).optional().meta({
      description:
        'How often the connection is re-synced: `default`, `custom`, `trigger_only` or `once`. See `ConnectionSyncSchedule`.',
      example: 'default',
    }),
    syncIntervalMinutes: z.number().int().nullable().optional().meta({
      description: 'Minutes between syncs for a `custom` schedule; null otherwise.',
      example: null,
    }),
    sync: ConnectionSyncState.nullable().optional().meta({
      description:
        'Last and next sync as the scheduler sees them; null when the deployment runs in passthrough mode and syncs nothing.',
    }),
  })
  .loose()
  .meta({
    id: 'Connection',
    description:
      'A live platform connection (OAuth/credential link) owned by a tenant, with its credential health.',
  })

// ── Platform catalog + config ────────────────────────────────────────────

/** Present on a `Platform` / `PlatformOperatorRow` when the platform is
 *  listed and viewable but cannot be enabled or connected — e.g. its OAuth
 *  client must be registered inside each customer's own instance, or no
 *  public API exists. Enabling and connecting are refused upstream with
 *  `400 PLATFORM_UNSUPPORTED` (carrying this same `reason`/`issueUrl`);
 *  existing connections keep working. Absent when the platform is fully
 *  supported. */
export const PlatformUnsupported = z
  .object({
    reason: z.string().meta({
      description: 'Why the platform cannot be connected today.',
      example: "OAuth client must be registered inside each customer's own instance.",
    }),
    issueUrl: z.string().url().optional().meta({
      description: 'Tracking issue for adding support, when one exists.',
      example: 'https://example.com/issues/123',
    }),
  })
  .meta({
    id: 'PlatformUnsupported',
    description:
      'Present when a platform is listed and viewable but cannot be enabled or connected.',
  })

/** Catalog metadata (logos, name, auth_type). Returned by /api/platforms. */
export const Platform = z
  .object({
    slug: z.string().meta({
      description: 'Stable machine identifier for the platform/adapter, e.g. `xero`.',
      example: 'xero',
    }),
    name: z
      .string()
      .meta({ description: 'Human-readable display name of the platform.', example: 'Xero' }),
    vertical: z.string().meta({
      description: 'Vertical the platform belongs to, e.g. `accounting`.',
      example: 'accounting',
    }),
    authType: z.string().optional().meta({
      description: 'Authentication scheme the platform uses, e.g. `oauth2`, `api_key`, `basic`.',
      example: 'oauth2',
    }),
    category: z.string().optional().meta({
      description: 'Catalog category used for grouping in the UI.',
      example: 'accounting',
    }),
    website: z.string().optional().meta({
      description: 'Marketing/landing URL for the platform.',
      example: 'https://www.xero.com',
    }),
    unsupported: PlatformUnsupported.optional(),
  })
  .loose()
  .meta({
    id: 'Platform',
    description: 'Catalog metadata for an available platform/adapter (name, vertical, auth type).',
  })

/** Operator-config row: which platforms are enabled / configured in one
 *  vertical. Returned by /api/verticals/{vertical}/platforms. */
export const PlatformOperatorRow = z
  .object({
    slug: z
      .string()
      .meta({ description: 'Platform slug this operator-config row applies to.', example: 'xero' }),
    vertical: z
      .string()
      .optional()
      .meta({ description: 'Vertical the platform belongs to.', example: 'accounting' }),
    enabled: z.boolean().meta({
      description: 'Whether the operator has enabled this platform for the vertical.',
      example: true,
    }),
    hasConfig: z.boolean().meta({
      description: 'Whether operator credentials/config have been saved for this platform.',
      example: true,
    }),
    unsupported: PlatformUnsupported.optional(),
  })
  .loose()
  .meta({
    id: 'PlatformOperatorRow',
    description:
      'Per-platform enablement/config status within one vertical, as set by the operator.',
  })

/** Redacted operator-set config returned by GET
 *  /api/verticals/{vertical}/platforms/{slug}/config. Secrets are not
 *  returned; only `hasSecret` flags presence. */
export const PlatformConfigRedacted = z
  .object({
    clientId: z.string().nullable().meta({
      description: 'OAuth client ID configured for the platform; null if unset.',
      example: 'opensteward',
    }),
    redirectUri: z.string().nullable().meta({
      description: 'OAuth redirect/callback URI configured for the platform; null if unset.',
      example: 'https://app.acme.example/return',
    }),
    scopes: z
      .array(z.string())
      .nullable()
      .meta({
        description: 'Scopes the operator has configured to request; null if defaults apply.',
        example: ['accounting.transactions.read'],
      }),
    hasSecret: z.boolean().meta({
      description: 'Whether a client secret is stored; the secret itself is never returned.',
      example: true,
    }),
    recommendedScopes: z
      .array(z.string())
      .nullable()
      .meta({
        description: 'Scopes the adapter recommends for this platform; null if none defined.',
        example: ['accounting.transactions.read'],
      }),
    supportsScopeOverride: z.boolean().optional().meta({
      description: 'Whether the operator may override the default scope set for this platform.',
      example: true,
    }),
  })
  .meta({
    id: 'PlatformConfigRedacted',
    description:
      'Operator platform configuration with secrets redacted; `hasSecret` flags whether a secret exists.',
  })

/**
 * PlatformConfig — discriminated union of the per-`authType` shapes
 * required by the adapter registry. Wired into the body of
 * `POST /api/verticals/{vertical}/platforms/{slug}/enable` and the
 * `PUT .../config` route so Swagger UI surfaces the real required
 * fields (clientId/clientSecret for OAuth2 etc.) instead of an opaque
 * `Record<string, unknown>`.
 */
export const PlatformConfigOauth2 = z.object({
  authType: z.literal('oauth2').meta({
    description: 'Discriminator selecting the standard authorization-code OAuth2 flow.',
    example: 'oauth2',
  }),
  clientId: z
    .string()
    .min(1)
    .meta({ description: 'OAuth client ID issued by the platform.', example: 'opensteward' }),
  clientSecret: z.string().min(1).meta({
    description: 'OAuth client secret; write-only and never returned in responses.',
    example: 's3cr3t-client-value',
  }),
  redirectUri: z.string().url().optional().meta({
    description:
      'Redirect/callback URI registered with the platform; defaults to the deployment callback if omitted.',
    example: 'https://app.acme.example/return',
  }),
  scopes: z
    .array(z.string())
    .optional()
    .meta({
      description: 'OAuth scopes to request; defaults to the adapter recommendation if omitted.',
      example: ['accounting.transactions.read'],
    }),
})

export const PlatformConfigOauth2Cc = z.object({
  authType: z.literal('oauth2_cc').meta({
    description: 'Discriminator selecting the OAuth2 client-credentials (machine-to-machine) flow.',
    example: 'oauth2_cc',
  }),
  clientId: z
    .string()
    .min(1)
    .meta({ description: 'OAuth client ID issued by the platform.', example: 'opensteward' }),
  clientSecret: z.string().min(1).meta({
    description: 'OAuth client secret; write-only and never returned in responses.',
    example: 's3cr3t-client-value',
  }),
  tokenUrl: z.string().url().meta({
    description: 'Token endpoint to exchange client credentials for an access token.',
    example: 'https://idp.northwind.example/oauth/token',
  }),
  scopes: z
    .array(z.string())
    .optional()
    .meta({
      description: 'OAuth scopes to request; defaults to the adapter recommendation if omitted.',
      example: ['accounting.transactions.read'],
    }),
})

export const PlatformConfigApiKey = z.object({
  authType: z.literal('api_key').meta({
    description: 'Discriminator selecting static API-key authentication.',
    example: 'api_key',
  }),
  apiKey: z.string().min(1).meta({
    description: 'API key used to authenticate to the platform; write-only and never returned.',
    example: 'osk_acme_8f3a',
  }),
})

export const PlatformConfigBasic = z.object({
  authType: z
    .literal('basic')
    .meta({ description: 'Discriminator selecting HTTP Basic authentication.', example: 'basic' }),
  username: z.string().min(1).meta({
    description: 'Username for HTTP Basic auth to the platform.',
    example: 'olivia.admin',
  }),
  password: z.string().min(1).meta({
    description: 'Password for HTTP Basic auth; write-only and never returned.',
    example: 's3cr3t-password',
  }),
})

export const PlatformConfigSession = z.object({
  authType: z.literal('session').meta({
    description: 'Discriminator selecting cookie/session-based authentication.',
    example: 'session',
  }),
  config: z.record(z.string(), z.string()).meta({
    description:
      'Free-form session parameters (e.g. cookies) required by the platform; write-only.',
    example: { cookie: 'session=abc123' },
  }),
})

export const PlatformConfig = z
  .discriminatedUnion('authType', [
    PlatformConfigOauth2.meta({ id: 'PlatformConfigOauth2' }),
    PlatformConfigOauth2Cc.meta({ id: 'PlatformConfigOauth2Cc' }),
    PlatformConfigApiKey.meta({ id: 'PlatformConfigApiKey' }),
    PlatformConfigBasic.meta({ id: 'PlatformConfigBasic' }),
    PlatformConfigSession.meta({ id: 'PlatformConfigSession' }),
  ])
  .meta({
    id: 'PlatformConfig',
    description: 'Operator-supplied platform configuration, keyed by `authType`.',
    // Add the OAS `discriminator` object so Swagger UI picks the right
    // branch in the Try-it-out form based on the `authType` field.
    override: ({ jsonSchema }) => {
      jsonSchema.discriminator = {
        propertyName: 'authType',
        mapping: {
          oauth2: '#/components/schemas/PlatformConfigOauth2',
          oauth2_cc: '#/components/schemas/PlatformConfigOauth2Cc',
          api_key: '#/components/schemas/PlatformConfigApiKey',
          basic: '#/components/schemas/PlatformConfigBasic',
          session: '#/components/schemas/PlatformConfigSession',
        },
      }
    },
  })

/**
 * PlatformConfigPatch — body of `PUT .../platforms/{slug}/config`.
 *
 * That route is a PATCH in everything but name: integration-server's
 * `registry.setConfig()` merges the submitted keys into the stored config,
 * keeps the ones the caller omitted, and treats `null` as "clear this key".
 * The merge is load-bearing for the admin UI, which re-saves a platform with
 * the secret field blank so a working credential is never wiped.
 *
 * `PlatformConfig` (above) cannot describe that body: it is a discriminated
 * union requiring `authType` plus every field of the matching branch. The
 * admin UI sends neither — `authType` is adapter metadata, not operator
 * input — so requiring the discriminated union here would reject every
 * credential save through the UI with `config.authType: Invalid
 * discriminator value`. Use the union where a complete config is genuinely
 * supplied (`/enable`), this patch where keys are merged.
 *
 * The named fields exist to document the common OAuth2/api-key/basic shapes
 * in Swagger UI. The catchall is not laziness: config keys vary across 1,546
 * adapters (`subdomain`, `companyId`, `apiUrl`, …) and Zod strips unknown
 * keys by default, which would silently drop them on the way through.
 */
export const PlatformConfigPatch = z
  .object({
    authType: z
      .enum(['oauth2', 'oauth2_cc', 'api_key', 'basic', 'session'])
      .nullable()
      .optional()
      .meta({
        description:
          'Accepted for symmetry with `PlatformConfig` and stored as-is; the effective auth type comes from adapter metadata, not from this body. Nullable like every other key, so a stored value can be cleared.',
        example: 'oauth2',
      }),
    clientId: z
      .string()
      .nullable()
      .optional()
      .meta({ description: 'OAuth client ID issued by the platform.', example: 'opensteward' }),
    clientSecret: z.string().nullable().optional().meta({
      description:
        'OAuth client secret; write-only and never returned. Omit to keep the stored secret.',
      example: 's3cr3t-client-value',
    }),
    redirectUri: z
      .union([z.string().url(), z.literal('')])
      .nullable()
      .optional()
      .meta({
        description:
          'Redirect/callback URI registered with the platform. Empty string or `null` clears it.',
        example: 'https://app.acme.example/return',
      }),
    tokenUrl: z
      .union([z.string().url(), z.literal('')])
      .nullable()
      .optional()
      .meta({
        description: 'Token endpoint for the client-credentials flow.',
        example: 'https://idp.northwind.example/oauth/token',
      }),
    scopes: z
      .array(z.string())
      .nullable()
      .optional()
      .meta({
        description: 'OAuth scopes to request; defaults to the adapter recommendation if omitted.',
        example: ['accounting.transactions.read'],
      }),
    apiKey: z.string().nullable().optional().meta({
      description: 'API key used to authenticate to the platform; write-only and never returned.',
      example: 'osk_acme_8f3a',
    }),
    username: z.string().nullable().optional().meta({
      description: 'Username for HTTP Basic auth to the platform.',
      example: 'olivia.admin',
    }),
    password: z.string().nullable().optional().meta({
      description: 'Password for HTTP Basic auth; write-only and never returned.',
      example: 's3cr3t-password',
    }),
  })
  .catchall(z.unknown())
  .meta({
    id: 'PlatformConfigPatch',
    description:
      'Partial operator platform configuration. Submitted keys overwrite stored ones, omitted keys are preserved, and `null` clears a key. Adapter-specific keys beyond those named here are accepted and stored verbatim.',
  })

// ── Scope groups ──────────────────────────────────────────────────────────

export const ScopeGroup = z
  .object({
    id: z.number().meta({ description: 'Numeric identifier of the scope group.', example: 7 }),
    vertical: z
      .string()
      .meta({ description: 'Vertical the scope group applies to.', example: 'accounting' }),
    platform: z
      .string()
      .meta({ description: 'Platform slug the scope group applies to.', example: 'xero' }),
    name: z.string().meta({
      description: 'Human-friendly label for the named bundle of scopes.',
      example: 'Accounting read',
    }),
    scopes: z.array(z.string()).meta({
      description: 'Platform scopes/permissions included in this group.',
      example: ['accounting.transactions.read'],
    }),
    createdAt: IsoTimestamp.meta({
      description: 'When the scope group was created (ISO 8601).',
      example: '2026-01-15T09:30:00Z',
    }),
  })
  .meta({
    id: 'ScopeGroup',
    description:
      'A reusable, named bundle of platform scopes that can be attached to connect links.',
  })

// ── Connect Link templates ────────────────────────────────────────────────

export const ConnectLinkMode = z
  .enum(['pinned', 'customer-picks-adapter', 'self-register'])
  .meta({ id: 'ConnectLinkMode' })

export const AllowedPlatform = z
  .object({
    vertical: z
      .string()
      .min(1)
      .meta({ description: 'Vertical the allowed platform belongs to.', example: 'accounting' }),
    slug: z.string().min(1).meta({
      description: 'Slug of the platform the customer is allowed to connect.',
      example: 'xero',
    }),
  })
  .meta({
    id: 'AllowedPlatform',
    description:
      'A specific vertical+platform the customer is permitted to connect through a link.',
  })

/**
 * ConnectLinkTemplate — discriminated by `linkMode`. `pinned` requires
 * at least one allowed platform; `customer-picks-adapter` requires at
 * least one allowed vertical OR platform; `self-register` requires
 * neither and exposes the same shared fields.
 */
const ConnectLinkTemplateSharedShape = {
  id: z
    .number()
    .meta({ description: 'Numeric identifier of the connect-link template.', example: 7 }),
  tenantId: z
    .string()
    .meta({ description: 'Tenant (operator customer) that owns this template.', example: 'acme' }),
  name: z.string().meta({
    description: 'Human-friendly name for the template, shown in the admin UI.',
    example: 'Acme onboarding',
  }),
  description: z.string().nullable().meta({
    description: 'Optional longer description of the template; null if unset.',
    example: 'Onboarding link for Acme Industries.',
  }),
  scopeGroupId: z.number().nullable().meta({
    description:
      'Scope group whose scopes are requested by links from this template; null for defaults.',
    example: 7,
  }),
  expiryDays: z.number().meta({
    description: 'Number of days a generated connect link remains valid before expiring.',
    example: 7,
  }),
  oneTimeOnly: z.boolean().meta({
    description:
      'When true, links from this template are consumed after a single successful connection.',
    example: false,
  }),
  redirectUrl: z.string().nullable().meta({
    description:
      'URL the customer is sent to after completing the connection; null to use the default.',
    example: 'https://app.acme.example/return',
  }),
  createdAt: IsoTimestamp.meta({
    description: 'When the template was created (ISO 8601).',
    example: '2026-01-15T09:30:00Z',
  }),
  createdBy: z.string().nullable().meta({
    description: 'Admin user who created the template; null if created by the system.',
    example: 'usr_olivia',
  }),
}

export const ConnectLinkTemplatePinned = z.object({
  ...ConnectLinkTemplateSharedShape,
  linkMode: z.literal('pinned').meta({
    description:
      'Pinned mode: the adapter is pre-selected, so the customer connects exactly one platform with no choice.',
    example: 'pinned',
  }),
  // Pinned mode pre-selects the adapter; the customer has nothing to pick.
  allowedPlatforms: z.array(AllowedPlatform).meta({
    description: 'The single pinned platform the customer will connect.',
    example: [{ vertical: 'accounting', slug: 'xero' }],
  }),
  allowedVerticals: z
    .array(z.string())
    .meta({ description: 'Verticals implied by the pinned platform(s).', example: ['accounting'] }),
})

export const ConnectLinkTemplatePicks = z.object({
  ...ConnectLinkTemplateSharedShape,
  linkMode: z.literal('customer-picks-adapter').meta({
    description:
      'Picks mode: the customer chooses which of the allowed platforms/verticals to connect.',
    example: 'customer-picks-adapter',
  }),
  allowedPlatforms: z.array(AllowedPlatform).meta({
    description: 'Platforms the customer may choose from.',
    example: [{ vertical: 'accounting', slug: 'xero' }],
  }),
  allowedVerticals: z
    .array(z.string())
    .meta({ description: 'Verticals the customer may choose from.', example: ['accounting'] }),
})

export const ConnectLinkTemplateSelfRegister = z.object({
  ...ConnectLinkTemplateSharedShape,
  linkMode: z.literal('self-register').meta({
    description:
      'Self-register mode: the customer self-identifies and connects without a pre-defined platform restriction.',
    example: 'self-register',
  }),
  allowedPlatforms: z.array(AllowedPlatform).meta({
    description: 'Optional platform allow-list; empty means any supported platform.',
    example: [{ vertical: 'accounting', slug: 'xero' }],
  }),
  allowedVerticals: z.array(z.string()).meta({
    description: 'Optional vertical allow-list; empty means any supported vertical.',
    example: ['accounting'],
  }),
})

export const ConnectLinkTemplate = z
  .discriminatedUnion('linkMode', [
    // Tag each branch with an `id` (as PlatformConfig does) so the emitted
    // schema carries a proper OpenAPI `discriminator` + `mapping` and tooling
    // can narrow the variant by `linkMode`.
    ConnectLinkTemplatePinned.meta({ id: 'ConnectLinkTemplatePinned' }),
    ConnectLinkTemplatePicks.meta({ id: 'ConnectLinkTemplatePicks' }),
    ConnectLinkTemplateSelfRegister.meta({ id: 'ConnectLinkTemplateSelfRegister' }),
  ])
  .meta({ id: 'ConnectLinkTemplate', description: 'Connect Link template, keyed by `linkMode`.' })

// ── Connect sessions ──────────────────────────────────────────────────────

export const ConnectSessionStatus = z
  .enum(['active', 'consumed', 'expired'])
  .meta({ id: 'ConnectSessionStatus' })

export const ConnectSession = z
  .object({
    id: z.string().meta({
      description: 'Identifier of the connect session (prefix `cs_`).',
      example: 'cs_8f3a2b9c4d',
    }),
    token: z.string().meta({
      description: 'Public link token embedded in the shareable connect URL (prefix `cl_`).',
      example: 'cl_8f3a2b9c4d',
    }),
    tenantId: z
      .string()
      .meta({ description: 'Tenant (operator customer) the session belongs to.', example: 'acme' }),
    endUserId: z.string().nullable().meta({
      description:
        'End-user this session is bound to; null for self-register links not yet claimed.',
      example: 'cus_4Qm2Xa9Lr',
    }),
    label: z.string().meta({
      description: 'Human-friendly label for the session, shown in the admin UI.',
      example: 'Acme onboarding',
    }),
    allowedVerticals: z.array(z.string()).meta({
      description: 'Verticals the customer may connect within this session.',
      example: ['accounting'],
    }),
    allowedPlatforms: z.array(AllowedPlatform).meta({
      description: 'Specific platforms the customer may connect within this session.',
      example: [{ vertical: 'accounting', slug: 'xero' }],
    }),
    redirectUrl: z.string().nullable().meta({
      description: 'URL the customer returns to after connecting; null to use the default.',
      example: 'https://app.acme.example/return',
    }),
    expiresAt: IsoTimestamp.meta({
      description: 'When the connect link expires and can no longer be used (ISO 8601).',
      example: '2026-02-08T09:30:00Z',
    }),
    consumedAt: IsoTimestamp.nullable().meta({
      description:
        'When the link was consumed by a successful connection; null while still active.',
      example: null,
    }),
    connectionId: z.string().nullable().meta({
      description: 'Connection created when the session was completed; null if not yet connected.',
      example: 'conn_1042',
    }),
    createdAt: IsoTimestamp.meta({
      description: 'When the session was created (ISO 8601).',
      example: '2026-01-15T09:30:00Z',
    }),
    createdBy: z.string().nullable().meta({
      description: 'Admin user who created the session; null if system-generated.',
      example: 'usr_olivia',
    }),
    status: ConnectSessionStatus.meta({
      description: 'Lifecycle state: `active`, `consumed`, or `expired`.',
      example: 'active',
    }),
    oneTimeOnly: z.boolean().optional().meta({
      description: 'When true, the link is consumed after a single successful connection.',
      example: false,
    }),
    url: z.string().optional().meta({
      description: 'Full shareable connect URL the customer opens to start connecting.',
      example: 'https://connect.northwind.example/cl_8f3a2b9c4d',
    }),
  })
  .loose()
  .meta({
    id: 'ConnectSession',
    description:
      'A connect session: a shareable, time-limited link through which an end-user connects a platform.',
  })

export const CreateConnectSessionBody = z
  .object({
    tenantId: z.string().min(1).meta({
      description: 'Tenant (operator customer) the new session belongs to.',
      example: 'acme',
    }),
    label: z
      .string()
      .min(1)
      .max(200)
      .meta({ description: 'Human-friendly label for the session.', example: 'Acme onboarding' }),
    endUserId: z.string().optional().meta({
      description:
        'Existing end-user to bind the session to; omit to create/resolve one from the customer fields.',
      example: 'cus_4Qm2Xa9Lr',
    }),
    customerEmail: z.string().email().optional().meta({
      description: 'Email used to create or match the end-user when `endUserId` is not supplied.',
      example: 'jane.doe@acme.example',
    }),
    customerDisplayName: z.string().max(200).optional().meta({
      description: 'Display name for the end-user when creating one from this request.',
      example: 'Jane Doe',
    }),
    allowedVerticals: z
      .array(z.string().min(1))
      .optional()
      .meta({
        description: 'Restrict the session to these verticals; omit for all enabled verticals.',
        example: ['accounting'],
      }),
    allowedPlatforms: z
      .array(AllowedPlatform)
      .optional()
      .meta({
        description: 'Restrict the session to these specific platforms.',
        example: [{ vertical: 'accounting', slug: 'xero' }],
      }),
    redirectUrl: z.string().url().optional().meta({
      description: 'URL the customer returns to after connecting; omit to use the default.',
      example: 'https://app.acme.example/return',
    }),
    expiresAt: z.number().int().optional().meta({
      description: 'Expiry as an epoch-millis timestamp; omit to apply the default expiry window.',
      example: 1769949600000,
    }),
    oneTimeOnly: z.boolean().optional().meta({
      description:
        'When true, the generated link is consumed after a single successful connection.',
      example: false,
    }),
    syncSchedule: ConnectionSyncSchedule.optional().meta({
      description:
        'The sync schedule the connection made through this link starts with; omit for the deployment default. A one-time link always makes a `once` connection and refuses any other mode.',
    }),
    scopes: z
      .array(z.string().min(1))
      .optional()
      .meta({
        description: 'Explicit scopes to request when `scopePolicy` is `custom`; omit otherwise.',
        example: ['accounting.transactions.read'],
      }),
    scopePolicy: z.enum(['read_only', 'platform_default', 'custom']).optional().meta({
      description:
        "How scopes are decided, resolved per-platform at OAuth-start: 'read_only' (default for new links — read scopes, falling back to platform default), 'platform_default' (no override), or 'custom' (use `scopes`).",
      example: 'read_only',
    }),
    allowSelfRegister: z.boolean().optional().meta({
      description:
        'When true, the link allows a not-yet-known customer to self-identify during connect.',
      example: false,
    }),
  })
  .loose()
  .meta({
    id: 'CreateConnectSessionBody',
    description: 'Request body to create a connect session / shareable connect link.',
  })

// ── End-users ─────────────────────────────────────────────────────────────

export const EndUserAddress = z
  .object({
    line1: z
      .string()
      .optional()
      .meta({ description: 'First line of the street address.', example: '2500 Market Street' }),
    line2: z
      .string()
      .optional()
      .meta({ description: 'Second address line (suite, unit, etc.).', example: 'Suite 300' }),
    city: z
      .string()
      .optional()
      .meta({ description: 'City or locality.', example: 'San Francisco' }),
    region: z
      .string()
      .optional()
      .meta({ description: 'State, province, or region.', example: 'CA' }),
    postalCode: z
      .string()
      .optional()
      .meta({ description: 'Postal or ZIP code.', example: '94114' }),
    country: z
      .string()
      .optional()
      .meta({ description: 'Country, typically an ISO 3166-1 alpha-2 code.', example: 'US' }),
  })
  .meta({
    id: 'EndUserAddress',
    description: 'Postal address for an end-user, stored as part of their PII.',
  })

export const EndUserPii = z
  .object({
    firstName: z
      .string()
      .optional()
      .meta({ description: "End-user's given name.", example: 'Jane' }),
    lastName: z
      .string()
      .optional()
      .meta({ description: "End-user's family name.", example: 'Doe' }),
    personalIdNumber: z.string().optional().meta({
      description: 'National/tax identifier; typically masked in responses.',
      example: '***-**-1234',
    }),
    phone: z.string().optional().meta({
      description: 'Contact phone number in E.164 or local format.',
      example: '+1-415-555-0142',
    }),
    address: EndUserAddress.optional().meta({ description: "End-user's postal address." }),
  })
  .meta({
    id: 'EndUserPii',
    description:
      'Personally identifiable information for an end-user; only returned when explicitly requested.',
  })

export const EndUserSummary = z
  .object({
    id: z.string().meta({
      description: 'Identifier of the end-user (prefix `cus_`).',
      example: 'cus_4Qm2Xa9Lr',
    }),
    tenantId: z.string().meta({
      description: 'Tenant (operator customer) the end-user belongs to.',
      example: 'acme',
    }),
    email: z.string().meta({
      description: 'Primary email address of the end-user.',
      example: 'jane.doe@acme.example',
    }),
    displayName: z
      .string()
      .nullable()
      .optional()
      .meta({ description: 'Friendly display name; null if not set.', example: 'Jane Doe' }),
    externalReference: z.string().nullable().optional().meta({
      description: "Operator's own identifier for this end-user in their system; null if unset.",
      example: 'acme-industries',
    }),
    createdAt: IsoTimestamp.meta({
      description: 'When the end-user record was created (ISO 8601).',
      example: '2026-01-15T09:30:00Z',
    }),
    updatedAt: IsoTimestamp.meta({
      description: 'When the end-user record was last modified (ISO 8601).',
      example: '2026-02-01T14:20:00Z',
    }),
  })
  .loose()
  .meta({
    id: 'EndUserSummary',
    description:
      "An end-user (the operator's customer) in summary form, without PII or related records.",
  })

export const EndUserDetail = z
  .object({
    id: z.string().meta({
      description: 'Identifier of the end-user (prefix `cus_`).',
      example: 'cus_4Qm2Xa9Lr',
    }),
    tenantId: z.string().meta({
      description: 'Tenant (operator customer) the end-user belongs to.',
      example: 'acme',
    }),
    email: z.string().meta({
      description: 'Primary email address of the end-user.',
      example: 'jane.doe@acme.example',
    }),
    displayName: z
      .string()
      .nullable()
      .optional()
      .meta({ description: 'Friendly display name; null if not set.', example: 'Jane Doe' }),
    externalReference: z.string().nullable().optional().meta({
      description: "Operator's own identifier for this end-user; null if unset.",
      example: 'acme-industries',
    }),
    createdAt: IsoTimestamp.meta({
      description: 'When the end-user record was created (ISO 8601).',
      example: '2026-01-15T09:30:00Z',
    }),
    updatedAt: IsoTimestamp.meta({
      description: 'When the end-user record was last modified (ISO 8601).',
      example: '2026-02-01T14:20:00Z',
    }),
    pii: EndUserPii.nullable()
      .optional()
      .meta({ description: 'PII for the end-user; present only when requested and available.' }),
    sessions: z
      .array(ConnectSession)
      .optional()
      .meta({ description: "The end-user's connect sessions." }),
    connections: z
      .array(
        z
          .object({
            id: z.string().meta({
              description: 'Identifier of the connection (prefix `conn_`).',
              example: 'conn_1042',
            }),
            vertical: z.string().nullable().optional().meta({
              description: 'Vertical of the connected platform; null if unknown.',
              example: 'accounting',
            }),
            platform: z
              .string()
              .meta({ description: 'Slug of the connected platform.', example: 'xero' }),
            createdAt: IsoTimestamp.meta({
              description: 'When the connection was established (ISO 8601).',
              example: '2026-01-15T09:30:00Z',
            }),
          })
          .loose(),
      )
      .optional()
      .meta({ description: "The end-user's active platform connections." }),
  })
  .loose()
  .meta({
    id: 'EndUserDetail',
    description: 'Full end-user record including optional PII, connect sessions, and connections.',
  })

export const CreateEndUserBody = z
  .object({
    tenantId: z.string().min(1).meta({
      description: 'Tenant (operator customer) the new end-user belongs to.',
      example: 'acme',
    }),
    email: z.string().email().meta({
      description: 'Primary email address of the end-user.',
      example: 'jane.doe@acme.example',
    }),
    displayName: z
      .string()
      .optional()
      .meta({ description: 'Friendly display name for the end-user.', example: 'Jane Doe' }),
    externalReference: z.string().optional().meta({
      description: "Operator's own identifier for this end-user.",
      example: 'acme-industries',
    }),
    // Nullable as well as optional. PII is genuinely optional on this form:
    // the admin sends `pii: null` for "the operator filled none of it in",
    // matching UpdateEndUserBody; the store takes `pii?: EndUserPii | null`
    // and encryptPii(null) returns null.
    pii: EndUserPii.nullable()
      .optional()
      .meta({ description: 'Optional PII to attach to the new end-user.' }),
  })
  .meta({ id: 'CreateEndUserBody', description: 'Request body to create an end-user.' })

export const UpdateEndUserBody = z
  .object({
    displayName: z
      .string()
      .nullable()
      .optional()
      .meta({ description: 'New display name; pass null to clear it.', example: 'Jane Doe' }),
    externalReference: z.string().nullable().optional().meta({
      description: 'New external reference; pass null to clear it.',
      example: 'acme-industries',
    }),
    pii: EndUserPii.nullable()
      .optional()
      .meta({ description: 'New PII to set; pass null to clear stored PII.' }),
  })
  .meta({
    id: 'UpdateEndUserBody',
    description: 'Request body to update an end-user; omitted fields are left unchanged.',
  })

// ── API keys + end-user tokens ───────────────────────────────────────────

/** An external identity provider whose OIDC bearer tokens this deployment accepts. */
export const OAuthIssuer = z
  .object({
    id: z.string().meta({ description: 'Identifier of the issuer record.', example: 'a3f1…' }),
    name: z.string().meta({ description: 'Operator-facing label.', example: 'Corp Keycloak' }),
    preset: z.string().meta({
      description: 'Vendor preset the claim names were seeded from, or `generic`.',
      example: 'keycloak',
    }),
    issuer: z.string().meta({
      description: 'The exact `iss` value tokens must carry.',
      example: 'https://idp.corp.example/realms/main',
    }),
    jwksUri: z.string().meta({
      description:
        'Where the issuer publishes its signing keys; resolved from its discovery document.',
      example: 'https://idp.corp.example/realms/main/protocol/openid-connect/certs',
    }),
    audience: z.string().meta({
      description:
        'The exact `aud` value tokens must carry. Never blank — without it every token the issuer ever minted would be accepted.',
      example: 'https://opensteward.corp.internal',
    }),
    subjectClaim: z.string().meta({
      description: 'Which claim names the calling client.',
      example: 'azp',
    }),
    scopeClaim: z.string().meta({
      description: 'Which claim carries the token scopes. Dotted paths are read.',
      example: 'realm_access.roles',
    }),
    algorithms: z.array(z.string()).meta({
      description: 'Signature algorithms accepted. Asymmetric only.',
      example: ['RS256', 'ES256'],
    }),
    authorityMode: z.enum(['registry', 'intersect', 'external']).meta({
      description:
        'Where tenant and scopes come from. `registry`: the client row decides, and deleting it cuts off a live token. `intersect`: the row is the ceiling and the token may narrow it. `external`: the token decides both, and nothing can revoke it before it expires.',
      example: 'registry',
    }),
    tenantClaim: z.string().nullable().meta({
      description: 'External mode only: which claim names the tenant. Null otherwise.',
      example: 'https://opensteward/tenant',
    }),
    allowedTenants: z.array(z.string()).meta({
      description:
        'External mode only: tenant values this issuer may assert. Empty admits nobody, never everybody.',
      example: ['acme'],
    }),
    maxTokenLifetimeS: z.number().meta({
      description:
        'External mode only: refuse a token whose `exp - iat` exceeds this. The only lever over a credential nothing can revoke.',
      example: 3600,
    }),
    enabled: z
      .boolean()
      .meta({ description: 'Whether tokens from it are accepted.', example: true }),
    lastVerifiedAt: IsoTimestamp.nullable().meta({
      description:
        'When a real token from this issuer last verified. Null means it has never admitted anybody, which is what blocks disabling API keys.',
      example: '2026-08-29T10:00:00Z',
    }),
    createdAt: IsoTimestamp.meta({
      description: 'When the issuer was registered.',
      example: '2026-08-01T09:00:00Z',
    }),
    updatedAt: IsoTimestamp.meta({
      description: 'When it was last changed.',
      example: '2026-08-20T09:00:00Z',
    }),
  })
  .meta({
    id: 'OAuthIssuer',
    description: 'An identity provider whose tokens the developer API accepts.',
  })

/** A registered service account: (issuer, subject) -> tenant + scopes. */
export const OAuthClient = z
  .object({
    id: z.string().meta({ description: 'Identifier of the client record.', example: 'c7b2…' }),
    issuerId: z.string().meta({ description: 'Issuer this client belongs to.', example: 'a3f1…' }),
    subject: z.string().meta({
      description: "Value of the issuer's subject claim identifying this client.",
      example: 'billing-service',
    }),
    tenantId: z
      .string()
      .meta({ description: 'Tenant the client authenticates as.', example: 'acme' }),
    label: z
      .string()
      .nullable()
      .meta({ description: 'Human-friendly label.', example: 'Billing service' }),
    scopes: z.array(z.string()).meta({
      description: 'Scopes granted — the same vocabulary developer API keys use.',
      example: ['customers:read', 'vertical:read'],
    }),
    createdAt: IsoTimestamp.meta({
      description: 'When it was registered.',
      example: '2026-08-01T09:00:00Z',
    }),
    lastUsedAt: IsoTimestamp.nullable().meta({
      description: 'When a token from it last verified.',
      example: '2026-08-29T10:00:00Z',
    }),
    revokedAt: IsoTimestamp.nullable().meta({
      description: 'When it was revoked. A revoked client stops working immediately, mid-token.',
      example: null,
    }),
  })
  .meta({
    id: 'OAuthClient',
    description: 'A registered service account authenticating with OIDC tokens.',
  })

/** Maps one of the IdP's own scope values onto an OpenSteward scope. */
export const OAuthScopeRule = z
  .object({
    id: z.string().meta({ description: 'Identifier of the rule.', example: 'r5c9…' }),
    issuerId: z.string().meta({ description: 'Issuer the rule belongs to.', example: 'a3f1…' }),
    priority: z.number().meta({ description: 'Evaluation order, ascending.', example: 0 }),
    claimValue: z.string().meta({
      description: "A value as it appears in the token's scope claim.",
      example: 'read:ledger',
    }),
    grantedScope: z.string().meta({
      description: 'The OpenSteward scope it grants.',
      example: 'vertical:accounting',
    }),
  })
  .meta({
    id: 'OAuthScopeRule',
    description:
      "Maps the IdP's scope vocabulary onto OpenSteward's. With no rules the claim passes through verbatim; with rules, an unmapped value is dropped.",
  })

export const OAuthIssuerDetail = z
  .object({
    issuer: OAuthIssuer,
    clients: z.array(OAuthClient).meta({ description: 'Service accounts registered against it.' }),
    rules: z
      .array(OAuthScopeRule)
      .meta({ description: 'Scope mapping rules, ascending priority.' }),
  })
  .meta({ id: 'OAuthIssuerDetail', description: 'One issuer with its clients and scope rules.' })

export const OAuthReadiness = z
  .object({
    ready: z.boolean().meta({
      description: 'Whether an OIDC token could actually admit somebody right now.',
      example: true,
    }),
    reason: z.string().meta({
      description: 'Why, in words — shown to the operator when disabling API keys is refused.',
      example: 'Corp Keycloak is configured and has verified a token.',
    }),
  })
  .meta({
    id: 'OAuthReadiness',
    description:
      'Whether OIDC bearer auth is usable. Checked before allowing an operator to disable API keys, so that switch cannot lock every developer out.',
  })

export const OAuthDiscovery = z
  .object({
    issuer: z.string().meta({
      description: 'The issuer the document reports.',
      example: 'https://idp.corp.example/realms/main',
    }),
    jwksUri: z.string().meta({
      description: 'Where its signing keys are published.',
      example: 'https://idp.corp.example/realms/main/protocol/openid-connect/certs',
    }),
  })
  .meta({
    id: 'OAuthDiscovery',
    description: "Result of reading an issuer's OpenID discovery document.",
  })

export const OAuthPreset = z
  .object({
    id: z.string().meta({ description: 'Preset identifier.', example: 'keycloak' }),
    label: z.string().meta({ description: 'Vendor name.', example: 'Keycloak' }),
    issuerHint: z.string().meta({
      description: "Shape of that vendor's issuer URL.",
      example: 'https://{host}/realms/{realm}',
    }),
    subjectClaim: z
      .string()
      .meta({ description: 'Default subject claim for this vendor.', example: 'azp' }),
    scopeClaim: z
      .string()
      .meta({ description: 'Default scope claim for this vendor.', example: 'realm_access.roles' }),
    note: z.string().optional().meta({
      description: 'Vendor-specific caveat worth reading before saving.',
      example:
        'A v1.0 token carries iss=https://sts.windows.net/{tenantId}/ even when the v2.0 endpoint is configured, and will be rejected.',
    }),
  })
  .meta({ id: 'OAuthPreset', description: 'Claim-name defaults for a known identity provider.' })

export const ApiKey = z
  .object({
    id: z.string().meta({
      description: 'Identifier of the API key record (prefix `key_`).',
      example: 'key_1042',
    }),
    tenantId: z.string().meta({
      description: 'Tenant (operator customer) the key authenticates as.',
      example: 'acme',
    }),
    prefix: z.string().meta({
      description:
        'Public, non-secret key prefix shown in listings; the full secret is returned only once, at creation.',
      example: 'osk_acme_8f3a',
    }),
    label: z.string().nullable().meta({
      description: 'Human-friendly label for the key; null if unlabeled.',
      example: 'Production key',
    }),
    scopes: z.array(z.string()).meta({
      description: 'Permission scopes granted to this key.',
      example: ['customers:read', 'connections:read'],
    }),
    mode: z.enum(['live', 'test']).meta({
      description:
        'Which surface the key addresses. `live` keys authenticate `/v1/*`; `test` keys ' +
        'authenticate the `/test/v1/*` sandbox. A key without a recorded mode reads as `live`.',
      example: 'live',
    }),
    createdAt: IsoTimestamp.meta({
      description: 'When the key was created (ISO 8601).',
      example: '2026-01-15T09:30:00Z',
    }),
    lastUsedAt: IsoTimestamp.nullable().meta({
      description: 'When the key was last used to authenticate a request; null if never used.',
      example: '2026-02-01T14:20:00Z',
    }),
    revokedAt: IsoTimestamp.nullable().meta({
      description: 'When the key was revoked; null while the key is active.',
      example: null,
    }),
    expiresAt: IsoTimestamp.nullable().optional().meta({
      description: 'Hard expiry; past it the key no longer authenticates. Null = never expires.',
      example: null,
    }),
    revokeAt: IsoTimestamp.nullable().optional().meta({
      description:
        'Scheduled revocation from a rotation grace window; the key keeps working until then. ' +
        'Null unless the key has been rotated.',
      example: null,
    }),
    rotatedFrom: z.string().nullable().optional().meta({
      description: 'Id of the key this one replaced, when minted by a rotation.',
      example: null,
    }),
  })
  .loose()
  .meta({
    id: 'ApiKey',
    description:
      'A tenant-scoped API key for authenticating to the public/dev API. The secret is shown only at mint time.',
  })

export const ApiKeyMint = ApiKey.extend({
  plaintext: z.string().meta({
    description:
      'The full plaintext API key; shown only once at mint time and never retrievable again.',
    example: 'osk_acme_8f3a2b9c4d5e6f7a8b9c0d1e',
  }),
}).meta({
  id: 'ApiKeyMint',
  description: 'API key with the plaintext value (returned once at mint time).',
})

export const ApiKeyRotate = ApiKeyMint.extend({
  oldKeyRevokeAt: z.number().meta({
    description:
      'Epoch ms when the replaced key stops verifying — the end of the rotation grace ' +
      'window in which both keys work.',
    example: 1774137600000,
  }),
}).meta({
  id: 'ApiKeyRotate',
  description:
    'The replacement key minted by a rotation (plaintext returned once) plus when the old key dies.',
})

export const EndUserToken = z
  .object({
    id: z.string().meta({
      description: 'Identifier of the end-user token record (prefix `eut_`).',
      example: 'eut_1042',
    }),
    endUserId: z.string().meta({
      description: 'End-user this token authenticates as (prefix `cus_`).',
      example: 'cus_4Qm2Xa9Lr',
    }),
    tenantId: z.string().meta({ description: 'Tenant the end-user belongs to.', example: 'acme' }),
    prefix: z.string().meta({
      description:
        'Public, non-secret token prefix shown in listings; the full secret is returned only once, at creation.',
      example: 'osk_acme_8f3a',
    }),
    label: z.string().nullable().meta({
      description: 'Human-friendly label for the token; null if unlabeled.',
      example: 'Production key',
    }),
    scopes: z.array(z.string()).meta({
      description: 'Permission scopes granted to this token.',
      example: ['customers:read', 'connections:read'],
    }),
    createdAt: IsoTimestamp.meta({
      description: 'When the token was created (ISO 8601).',
      example: '2026-01-15T09:30:00Z',
    }),
    createdBy: z.string().nullable().meta({
      description: 'Admin user who minted the token; null if system-generated.',
      example: 'usr_olivia',
    }),
    lastUsedAt: IsoTimestamp.nullable().meta({
      description: 'When the token was last used to authenticate a request; null if never used.',
      example: '2026-02-01T14:20:00Z',
    }),
    revokedAt: IsoTimestamp.nullable().meta({
      description: 'When the token was revoked; null while the token is active.',
      example: null,
    }),
  })
  .loose()
  .meta({
    id: 'EndUserToken',
    description:
      'An API token scoped to a single end-user, letting them act on their own connections.',
  })

export const EndUserTokenMint = EndUserToken.extend({
  plaintext: z.string().meta({
    description:
      'The full plaintext token; shown only once at mint time and never retrievable again.',
    example: 'osk_acme_8f3a2b9c4d5e6f7a8b9c0d1e',
  }),
}).meta({
  id: 'EndUserTokenMint',
  description: 'End-user token with the plaintext value (returned once at mint time).',
})

// ── Webhook subscriptions + deliveries ───────────────────────────────────

export const WebhookSubscription = z
  .object({
    id: z.string().meta({
      description: 'Identifier of the webhook subscription (prefix `whs_`).',
      example: 'whs_1042',
    }),
    tenantId: z.string().meta({
      description: 'Tenant (operator customer) that owns the subscription.',
      example: 'acme',
    }),
    url: z.string().meta({
      description: 'HTTPS endpoint that receives event deliveries.',
      example: 'https://hooks.acme.example/opensteward',
    }),
    label: z.string().nullable().optional().meta({
      description:
        'Human-friendly name for the subscription, or null when it has none. Purely descriptive — nothing routes on it — and what the admin list searches.',
      example: 'Billing service',
    }),
    events: z.array(z.string()).meta({
      description: 'Event types this subscription is subscribed to, e.g. `customer.created`.',
      example: ['customer.created'],
    }),
    paused: z.boolean().optional().meta({
      description:
        'Whether deliveries are suspended. A paused subscription is retained and still accepts a test send, but receives no event deliveries. Toggle with `POST /api/webhook-subscriptions/{id}/paused`.',
      example: false,
    }),
    createdAt: IsoTimestamp.meta({
      description: 'When the subscription was created (ISO 8601).',
      example: '2026-01-15T09:30:00Z',
    }),
    lastFiredAt: IsoTimestamp.nullable().optional().meta({
      description: 'When an event was last delivered to this endpoint; null if never fired.',
      example: '2026-02-01T14:20:00Z',
    }),
    lastStatus: z.number().nullable().optional().meta({
      description: 'HTTP status code of the most recent delivery attempt; null if never fired.',
      example: 200,
    }),
    lastError: z.string().nullable().optional().meta({
      description:
        'Error from the most recent failed delivery; null if the last attempt succeeded.',
      example: null,
    }),
    format: z.enum(['opensteward', 'slack', 'teams', 'flat']).meta({
      description:
        'Payload shape sent to this endpoint. `opensteward` is the signed event envelope; `slack` renders Slack blocks; `teams` renders an Adaptive Card for a Teams Workflows URL; `flat` is a one-level object with dotted keys.',
      example: 'opensteward',
    }),
    headerNames: z.array(z.string()).meta({
      description:
        'Names of the custom headers sent with each delivery. Values are stored encrypted and are never returned by the API.',
      example: ['X-Api-Key'],
    }),
  })
  .loose()
  .meta({
    id: 'WebhookSubscription',
    description:
      'A tenant webhook subscription that receives event deliveries at an HTTPS endpoint.',
  })

export const WebhookSubscriptionWithSecret = WebhookSubscription.extend({
  secret: z.string().meta({
    description:
      'Shared signing secret used to verify delivery signatures; returned only once at create time.',
    example: 'whsec_8f3a2b9c4d5e6f7a8b9c0d1e',
  }),
}).meta({
  id: 'WebhookSubscriptionWithSecret',
  description:
    'Webhook subscription with the plaintext shared secret (returned once at create time).',
})

export const WebhookTestResult = z
  .object({
    id: z.string().meta({ description: 'Subscription the test was sent to.', example: 'whs_1042' }),
    ok: z.boolean().meta({
      description:
        'True when the receiver answered 2xx. False means the destination rejected or could not be reached — the answer to the diagnostic, not an API error.',
      example: true,
    }),
    status: z.number().nullable().meta({
      description: 'HTTP status the receiver returned, or null when the request never completed.',
      example: 200,
    }),
    format: z
      .enum(['opensteward', 'slack', 'teams', 'flat'])
      .meta({ description: 'Format the test payload was rendered in.', example: 'slack' }),
    sentBody: z.string().optional().meta({
      description:
        'The exact bytes sent, so the payload can be inspected. Synthetic and carries no secret.',
      example: '{"text":"Test event from OpenSteward"}',
    }),
    error: z.string().optional().meta({
      description:
        'Why the request never completed, when it did not (DNS failure, timeout, blocked address).',
      example: 'getaddrinfo ENOTFOUND hooks.example',
    }),
  })
  .loose()
  .meta({
    id: 'WebhookTestResult',
    description: 'Outcome of sending one synthetic test event to a webhook subscription.',
  })

export const WebhookDeliveryStatus = z
  .enum(['pending', 'delivered', 'dead'])
  .meta({ id: 'WebhookDeliveryStatus' })

export const WebhookDelivery = z
  .object({
    id: z.string().meta({
      description: 'Identifier of the delivery attempt record (prefix `whd_`).',
      example: 'whd_1042',
    }),
    subscriptionId: z.string().meta({
      description: 'Subscription this delivery belongs to (prefix `whs_`).',
      example: 'whs_1042',
    }),
    eventId: z.string().meta({
      description: 'Identifier of the source event being delivered (prefix `evt_`).',
      example: 'evt_4Qm2Xa9Lr',
    }),
    eventType: z.string().meta({
      description: 'Type of the event being delivered, e.g. `customer.created`.',
      example: 'customer.created',
    }),
    url: z.string().meta({
      description: 'Destination endpoint the event was delivered to.',
      example: 'https://hooks.acme.example/opensteward',
    }),
    status: WebhookDeliveryStatus.meta({
      description: 'Delivery state: `pending` (will retry), `delivered`, or `dead` (gave up).',
      example: 'delivered',
    }),
    attempts: z
      .number()
      .meta({ description: 'Number of delivery attempts made so far.', example: 1 }),
    nextAttemptAt: IsoTimestamp.meta({
      description: 'When the next delivery retry is scheduled (for pending/failed deliveries).',
      example: '2026-02-01T14:25:00Z',
    }),
    deliveredAt: IsoTimestamp.nullable().meta({
      description: 'When the event was successfully delivered; null if not yet delivered.',
      example: '2026-02-01T14:20:00Z',
    }),
    lastStatus: z.number().nullable().meta({
      description:
        'HTTP status code returned by the most recent attempt; null if not yet attempted.',
      example: 200,
    }),
    lastError: z.string().nullable().meta({
      description: 'Error message from the most recent failed attempt; null on success.',
      example: null,
    }),
    createdAt: IsoTimestamp.meta({
      description: 'When this delivery record was created (ISO 8601).',
      example: '2026-01-15T09:30:00Z',
    }),
  })
  .loose()
  .meta({
    id: 'WebhookDelivery',
    description:
      'A single webhook delivery attempt for one event to one subscription, with retry state.',
  })

// ── Sync jobs + data-store ───────────────────────────────────────────────

export const SyncJobStatus = z
  .enum(['pending', 'running', 'completed', 'failed'])
  .meta({ id: 'SyncJobStatus' })

export const SyncJob = z
  .object({
    id: z
      .string()
      .meta({ description: 'Identifier of the sync job (prefix `job_`).', example: 'job_1042' }),
    vertical: z
      .string()
      .meta({ description: 'Vertical the sync runs against.', example: 'accounting' }),
    connectionId: z.string().meta({
      description: 'Connection whose data is being synced (prefix `conn_`).',
      example: 'conn_1042',
    }),
    platform: z
      .string()
      .meta({ description: 'Slug of the platform being synced.', example: 'xero' }),
    tenantId: z.string().nullable().optional().meta({
      description:
        'Tenant that owns the connection; null for jobs on connections not scoped to a tenant.',
      example: 'acme',
    }),
    status: SyncJobStatus.meta({
      description: 'Job lifecycle state: `pending`, `running`, `completed`, or `failed`.',
      example: 'completed',
    }),
    progress: z
      .record(
        z.string(),
        z
          .object({
            synced: z.number().meta({
              description: 'Number of records synced for this resource so far.',
              example: 128,
            }),
            status: z
              .string()
              .meta({ description: 'Per-resource sync status.', example: 'completed' }),
            error: z.string().optional().meta({
              description: 'Error encountered syncing this resource, if any.',
              example: 'rate limited',
            }),
          })
          .loose(),
      )
      .nullable()
      .optional()
      .meta({
        description:
          'Per-resource progress keyed by resource name (e.g. `transactions`); null before the job starts.',
        example: { transactions: { synced: 128, status: 'completed' } },
      }),
    error: z.string().nullable().optional().meta({
      description: 'Top-level failure reason; null unless the job failed.',
      example: null,
    }),
    callbackUrl: z.string().nullable().optional().meta({
      description: 'URL notified when the job completes; null if no callback was requested.',
      example: 'https://app.acme.example/sync-callback',
    }),
    createdAt: z.string().meta({
      description: 'When the job was created/enqueued (ISO 8601).',
      example: '2026-01-15T09:30:00.000Z',
    }),
    startedAt: z.string().nullable().optional().meta({
      description: 'When the job began running; null while still pending.',
      example: '2026-01-15T09:30:05.000Z',
    }),
    completedAt: z.string().nullable().optional().meta({
      description: 'When the job finished (success or failure); null while still running.',
      example: '2026-01-15T09:31:00.000Z',
    }),
    origin: z.enum(['manual', 'api', 'connect', 'boot', 'schedule']).nullable().optional().meta({
      description:
        "Why the job was queued: `manual` (Sync now), `api` (POST /v1/{vertical}/sync), `connect` (after a Connect Link), `boot` (DATA_STORE_AUTO_SYNC_ON_BOOT) or `schedule` (the connection's sync schedule). Null on older jobs.",
      example: 'schedule',
    }),
  })
  .loose()
  .meta({
    id: 'SyncJob',
    description:
      'A background data-sync job for one connection, with per-resource progress and lifecycle timestamps.',
  })

export const DataStoreMetrics = z
  .object({
    mode: z.string().meta({
      description: 'Backing store driver in use, e.g. `sqlite` or `postgres`.',
      example: 'sqlite',
    }),
    path: z.string().meta({
      description: 'Filesystem path or connection target of the data store.',
      example: '/var/lib/opensteward/data.db',
    }),
    rows: z
      .object({
        total: z.number().meta({
          description: 'Total number of synced data rows across all verticals.',
          example: 1280,
        }),
        per_vertical: z
          .record(z.string(), z.number())
          .meta({ description: 'Row counts keyed by vertical.', example: { accounting: 1280 } }),
        oldest_age_ms: z.number().nullable().meta({
          description: 'Age of the oldest stored row in milliseconds; null if the store is empty.',
          example: 1480200000,
        }),
      })
      .loose()
      .meta({ description: 'Aggregate counts of stored data rows.' }),
    sync_jobs: z
      .object({
        pending: z.number().meta({
          description: 'Number of sync jobs currently queued but not started.',
          example: 0,
        }),
        running: z
          .number()
          .meta({ description: 'Number of sync jobs currently executing.', example: 1 }),
        failed_recent: z
          .number()
          .meta({ description: 'Number of jobs that failed in the recent window.', example: 0 }),
        per_vertical: z.record(z.string(), z.record(z.string(), z.number())).meta({
          description: 'Job counts keyed by vertical, then by status.',
          example: { accounting: { completed: 12 } },
        }),
      })
      .loose()
      .meta({ description: 'Sync-job counts by state and vertical.' }),
    db_size_bytes: z.number().nullable().meta({
      description: 'On-disk size of the data store in bytes; null if not measurable.',
      example: 2097152,
    }),
    db_size_mb: z.number().nullable().meta({
      description: 'On-disk size of the data store in megabytes; null if not measurable.',
      example: 2,
    }),
    timestamp: z.string().meta({
      description: 'When these metrics were sampled (ISO 8601).',
      example: '2026-01-15T09:30:00.000Z',
    }),
  })
  .loose()
  .meta({
    id: 'DataStoreMetrics',
    description:
      'Operational metrics for the synced-data store: row counts, sync-job counts, and storage size.',
  })

// ── Runtime settings ─────────────────────────────────────────────────────

export const RuntimeSettingValueType = z
  .enum(['number', 'boolean', 'string', 'json'])
  .meta({ id: 'RuntimeSettingValueType' })

export const RuntimeSetting = z
  .object({
    key: z.string().meta({
      description:
        'Dotted setting key identifying the runtime configuration value, e.g. `rateLimit.apiKey.perMinute`.',
      example: 'rateLimit.apiKey.perMinute',
    }),
    value: z.unknown().meta({
      description:
        'Current value of the setting; type depends on the setting key (see `valueType`).',
      example: 600,
    }),
    valueType: RuntimeSettingValueType.meta({
      description: 'Type of the value: `number`, `boolean`, `string`, or `json`.',
      example: 'number',
    }),
    defaultValue: z
      .unknown()
      .meta({ description: 'Built-in default applied when no override is set.', example: 300 }),
    description: z.string().meta({
      description: 'Human-readable explanation of what the setting controls.',
      example: 'Maximum API-key requests allowed per minute.',
    }),
    category: z.string().meta({
      description: 'Grouping category used to organise settings in the UI.',
      example: 'rateLimit',
    }),
    updatedAt: IsoTimestamp.meta({
      description: 'When the setting was last changed (ISO 8601).',
      example: '2026-02-01T14:20:00Z',
    }),
    updatedBy: z.string().nullable().meta({
      description: 'Admin user who last changed the setting; null if still at default.',
      example: 'usr_olivia',
    }),
    isDefault: z.boolean().meta({
      description: 'True when the value equals the built-in default (no override has been set).',
      example: false,
    }),
    enumValues: z
      .array(z.string())
      .nullable()
      .meta({
        description:
          'Closed set of legal values for a string setting, or null when it is free-form. ' +
          'Render it as a dropdown; the PATCH body schema enforces the same set.',
        example: ['none', 'cdn', 'local'],
      }),
    warning: z
      .string()
      .nullable()
      .meta({
        description:
          'Confirmation text to show before saving, for a setting whose consequence is not ' +
          'obvious from its label. Null when the setting needs no confirmation.',
        example: 'Stores and returns the complete unmodified upstream payload for this vertical.',
      }),
    warnOn: z
      .enum(['enable', 'disable'])
      .nullable()
      .optional()
      .meta({
        description:
          'Which direction of a boolean flip the warning guards: `enable` confirms switching ' +
          'to true, `disable` confirms switching to false (kill switches). Null when there is ' +
          'no warning.',
        example: 'enable',
      }),
  })
  .meta({
    id: 'RuntimeSetting',
    description: 'A runtime-configurable setting with its current value, default, and metadata.',
  })

export const IdentityLinkView = z
  .object({
    providerId: z
      .string()
      .meta({ description: 'Identity provider this link belongs to.', example: 'idp_okta' }),
    providerName: z.string().nullable().meta({
      description: 'Display name of the provider, or null if it has since been removed.',
      example: 'Okta',
    }),
    externalId: z.string().nullable().meta({
      description:
        "The subject this account maps to in the identity provider — for SCIM the client's `externalId` or `userName`, for JIT the email the account was provisioned from. Identifying data: present only when the caller passed `include_identity=true`, which writes a `user.pii_reveal` audit entry. Null otherwise.",
      example: 'olivia@northwind.example',
    }),
    lastLoginAt: IsoTimestamp.nullable().meta({
      description: 'When this identity last signed in (ISO 8601), or null if never.',
      example: '2026-08-27T09:14:00.000Z',
    }),
    scimManaged: z.boolean().meta({
      description: 'True when the provider provisions this account over SCIM.',
      example: true,
    }),
  })
  .meta({
    id: 'IdentityLink',
    description: 'A link between a console account and an identity-provider subject.',
  })

export const UserDetail = z
  .object({
    id: z.string().meta({ description: 'Stable account identifier.', example: 'usr_olivia' }),
    username: z.string().meta({ description: 'Login name.', example: 'olivia.admin' }),
    ...ProfileViewFields,
    emailSource: z.enum(['manual', 'idp']).nullable().optional().meta({
      description:
        '`manual` when an admin set the email (SSO never overwrites it); `idp` when it is copied from the identity provider and refreshed at every SSO sign-in or SCIM update; null without an email.',
      example: 'manual',
    }),
    avatarSource: z.enum(['upload', 'idp']).nullable().optional().meta({
      description:
        '`upload` when a person uploaded the picture (SSO never replaces it); `idp` when it was fetched from the identity provider’s picture URL; null without a picture.',
      example: 'upload',
    }),
    role: z.string().meta({ description: 'Access level.', example: 'admin' }),
    roleId: z.string().optional().meta({
      description: 'Effective role: a custom role id, or the built-in id when none is assigned.',
      example: 'admin',
    }),
    roleName: z.string().optional().meta({ description: 'Display name of the effective role.', example: 'admin' }),
    scope: AccessScope.optional().meta({ description: 'Which tenants the account may see.' }),
    scopeSource: z.enum(['manual', 'idp']).optional().meta({
      description: '`idp` when the scope is re-derived from IdP scope rules on every SSO login; `manual` when an admin set it.',
      example: 'manual',
    }),
    createdAt: IsoTimestamp.meta({
      description: 'When the account was created (ISO 8601).',
      example: '2026-01-04T10:00:00.000Z',
    }),
    updatedAt: IsoTimestamp.meta({
      description: 'When the account was last modified (ISO 8601).',
      example: '2026-02-11T16:30:00.000Z',
    }),
    links: z.array(IdentityLinkView).meta({
      description: 'Identity-provider links for this account; empty for a local password account.',
      example: [],
    }),
    ssoOnly: z.boolean().meta({
      description:
        'True when the account signs in only through an identity provider. SCIM- and JIT-provisioned accounts are given an unusable random password, so this is derived from the presence of links rather than from the stored hash.',
      example: false,
    }),
    isLocalAdmin: z.boolean().meta({
      description:
        'True when this is a password-usable local admin (role `admin` with no identity links) — the set `assertBreakGlassPreserved` refuses to empty.',
      example: true,
    }),
    isPinnedBreakGlass: z.boolean().meta({
      description:
        'True when `auth.break_glass_user_id` names this account, which lets it sign in with a password even while local login is disabled.',
      example: false,
    }),
  })
  .meta({
    id: 'UserDetail',
    description: 'One console account with its identity links and break-glass status.',
  })

// ── Audit + notifications ────────────────────────────────────────────────

// Re-export so route files and the audit handler import `AuditDetailUnion`
// from a single barrel alongside the rest of the OpenAPI building blocks.
// (The import itself lives at the top of this file to avoid a circular
// init order.)
export { AuditDetailUnion } from '../db/audit-actions'
export type { AuditAction, AuditDetail } from '../db/audit-actions'

/**
 * Audit-log entry as surfaced by `GET /api/audit`. The `detail` field is
 * the typed discriminated union from `audit-actions.ts` — Swagger UI
 * renders the per-action branch based on the `action` discriminator, so
 * SDK consumers see the real shape instead of an opaque string.
 *
 * Note: the underlying `audit_log.detail` column still stores a JSON
 * string; the audit-list handler parses it before responding and rebuilds
 * each variant by merging the row's `action` value with the parsed
 * payload. Writers still call `writeAudit` (typed) — the parse step is
 * only on read.
 *
 * `detail` is nullable on the wire to cover two cases that legitimately
 * carry no payload:
 *   - actions whose registry variant has no extra fields beyond `action`,
 *   - rows whose `action` literal isn't in the registry union (e.g.
 *     written by a different writer version) — those round-trip as
 *     `null` rather than 500-ing the read.
 */
export const AuditEntry = z
  .object({
    id: z
      .number()
      .meta({ description: 'Monotonic numeric identifier of the audit-log entry.', example: 1042 }),
    userId: z.string().meta({
      description: 'User who performed the action (prefix `usr_`).',
      example: 'usr_olivia',
    }),
    username: z.string().meta({
      description:
        'Username of the operator who performed the action, resolved at read time. Falls back to the raw user id when the account has since been deleted, and is the literal `system` for actions taken by a background worker.',
      example: 'olivia',
    }),
    action: z.string().meta({
      description: 'Machine-readable action code, e.g. `api_key.mint`, `user.login`.',
      example: 'api_key.mint',
    }),
    vertical: z.string().nullable().meta({
      description: 'Vertical the action targeted, if applicable; null otherwise.',
      example: 'accounting',
    }),
    targetId: z.string().nullable().meta({
      description: 'Identifier of the resource acted upon; null when not resource-specific.',
      example: 'key_1042',
    }),
    // The shape-grouped view, not the per-action writer union: same values,
    // a quarter of the components. See audit-actions.ts.
    detail: AuditDetailDoc.nullable().meta({
      description:
        'Typed per-action payload (discriminated by `action`, grouped by shape); null when the action carries no extra detail.',
      example: { action: 'api_key.mint' },
    }),
    createdAt: IsoTimestamp.meta({
      description: 'When the action occurred (ISO 8601).',
      example: '2026-01-15T09:30:00Z',
    }),
  })
  .meta({
    id: 'AuditEntry',
    description: 'A single audit-log entry recording who did what, to which resource, and when.',
  })

export const PaginationMeta = z
  .object({
    page: z
      .number()
      .meta({ description: '1-based page number of the returned results.', example: 1 }),
    limit: z.number().meta({ description: 'Maximum number of items per page.', example: 50 }),
    total: z.number().meta({ description: 'Total number of items across all pages.', example: 1 }),
  })
  .meta({
    id: 'PaginationMeta',
    description: 'Pagination metadata describing the current page and page size.',
  })

export const Notification = z
  .object({
    id: z.number().meta({ description: 'Numeric identifier of the notification.', example: 1042 }),
    type: z.string().meta({
      description:
        'Notification type code: `vertical_down`, `platform_credentials_invalid`, `credential_expired` or `credential_expiring`.',
      example: 'credential_expiring',
    }),
    vertical: z.string().nullable().meta({
      description: 'Vertical the notification relates to; null if not vertical-specific.',
      example: 'accounting',
    }),
    connectionId: z.string().nullable().meta({
      description: 'Connection the notification concerns; null if not connection-specific.',
      example: 'conn_1042',
    }),
    platform: z.string().nullable().meta({
      description: 'Platform the notification concerns; null if not platform-specific.',
      example: 'xero',
    }),
    message: z.string().meta({
      description: 'Human-readable notification text shown in the admin UI.',
      example: 'Connection conn_1042 expires in 3 days.',
    }),
    acknowledged: z.number().meta({
      description: 'Whether the notification has been acknowledged: 0 = unread, 1 = acknowledged.',
      example: 0,
    }),
    createdAt: IsoTimestamp.meta({
      description: 'When the notification was raised (ISO 8601).',
      example: '2026-01-15T09:30:00Z',
    }),
  })
  .meta({
    id: 'Notification',
    description:
      'An operator-facing notification, e.g. an alert that a connection is expiring soon.',
  })

export const UnreadNotificationCount = z
  .object({
    count: z.number().int().min(0).meta({
      description:
        'Unacknowledged notifications, excluding `credential_expiring` (which auto-heals within a poll and would keep the badge from ever reaching zero).',
      example: 2,
    }),
  })
  .meta({
    id: 'UnreadNotificationCount',
    description: 'The number the admin UI shows on the header bell.',
  })

export const DashboardDismissal = z
  .object({
    key: z.string().meta({
      description:
        'Task key: `conn:expired:<connectionId>`, `platform:creds:<vertical>/<platform>`, `sync:failed:<jobId>`, `refresh:failing:<connectionId>` or `wizard:<step>`.',
      example: 'conn:expired:conn_1042',
    }),
    fingerprint: z.string().meta({
      description:
        'Fingerprint the task was cleared at (ISO 8601 for timestamps, empty when the key alone identifies the condition). The dashboard hides the task only while its live fingerprint equals this.',
      example: '2026-09-01T00:00:00.000Z',
    }),
    by: z.string().meta({ description: 'Id of the user who cleared the task.', example: 'usr_olivia' }),
    createdAt: IsoTimestamp.meta({
      description: 'When the task was cleared (ISO 8601).',
      example: '2026-09-02T09:30:00.000Z',
    }),
  })
  .meta({
    id: 'DashboardDismissal',
    description: 'A dashboard task an operator cleared, and the fingerprint it was cleared at.',
  })

// ── Identity providers + SSO ─────────────────────────────────────────────

export const IdpProtocol = z.enum(['saml', 'oidc', 'ldap']).meta({ id: 'IdpProtocol' })

export const RoleMatchType = z.enum(['equals', 'contains', 'regex']).meta({ id: 'RoleMatchType' })

/** IdP config schemas — re-exported with stable component ids so Swagger
 *  UI displays the per-protocol shape rather than an opaque `Record`. */
export const OidcConfig = OidcConfigSchema.meta({ id: 'OidcConfig' })
export const SamlConfig = SamlConfigSchema.meta({ id: 'SamlConfig' })
export const LdapConfig = LdapConfigSchema.meta({ id: 'LdapConfig' })

/**
 * IdpConfigByProtocol — discriminated union of the protocol-specific
 * config shapes. Used as the body of `POST /api/identity-providers` and
 * `PUT /api/identity-providers/{id}` so Swagger UI surfaces the
 * per-protocol required fields (issuer for OIDC, entryPoint+idpIssuer
 * for SAML, url+bindDn for LDAP) instead of an opaque
 * `Record<string, unknown>`.
 */
export const IdpConfigByProtocolOidc = z
  .object({
    protocol: z.literal('oidc').meta({
      description: 'Discriminator selecting the OpenID Connect (OIDC) config shape.',
      example: 'oidc',
    }),
    config: OidcConfig.meta({
      description: 'OIDC non-secret configuration (issuer, client ID, scopes, etc.).',
    }),
  })
  .meta({
    id: 'IdpConfigByProtocolOidc',
    description: 'OIDC variant of the protocol-keyed identity-provider config.',
  })

export const IdpConfigByProtocolSaml = z
  .object({
    protocol: z
      .literal('saml')
      .meta({ description: 'Discriminator selecting the SAML config shape.', example: 'saml' }),
    config: SamlConfig.meta({
      description: 'SAML non-secret configuration (entry point, issuer, attribute mapping).',
    }),
  })
  .meta({
    id: 'IdpConfigByProtocolSaml',
    description: 'SAML variant of the protocol-keyed identity-provider config.',
  })

export const IdpConfigByProtocolLdap = z
  .object({
    protocol: z
      .literal('ldap')
      .meta({ description: 'Discriminator selecting the LDAP config shape.', example: 'ldap' }),
    config: LdapConfig.meta({
      description: 'LDAP non-secret configuration (URL, bind DN, search base, attribute mapping).',
    }),
  })
  .meta({
    id: 'IdpConfigByProtocolLdap',
    description: 'LDAP variant of the protocol-keyed identity-provider config.',
  })

export const IdpConfigByProtocol = z
  .discriminatedUnion('protocol', [
    IdpConfigByProtocolOidc,
    IdpConfigByProtocolSaml,
    IdpConfigByProtocolLdap,
  ])
  .meta({
    id: 'IdpConfigByProtocol',
    description:
      'Identity-provider non-secret config keyed by `protocol`. OIDC requires `issuer` + `clientId`; SAML requires `entryPoint` + `idpIssuer`; LDAP requires `url` + `bindDn` + `searchBase`.',
    override: ({ jsonSchema }) => {
      jsonSchema.discriminator = {
        propertyName: 'protocol',
        mapping: {
          oidc: '#/components/schemas/IdpConfigByProtocolOidc',
          saml: '#/components/schemas/IdpConfigByProtocolSaml',
          ldap: '#/components/schemas/IdpConfigByProtocolLdap',
        },
      }
    },
  })

export const IdpSecretBundle = z
  .object({
    clientSecret: z
      .string()
      .optional()
      .meta({ description: 'OIDC client secret; write-only.', example: 's3cr3t-client-value' }),
    ldapBindPassword: z.string().optional().meta({
      description: 'Password for the LDAP service-account bind DN; write-only.',
      example: 's3cr3t-bind-password',
    }),
    spPrivateKey: z.string().optional().meta({
      description: 'SAML service-provider private key (PEM) used to sign requests; write-only.',
      example: '-----BEGIN PRIVATE KEY-----\n...',
    }),
    spCertificate: z.string().optional().meta({
      description: 'SAML service-provider certificate (PEM); write-only.',
      example: '-----BEGIN CERTIFICATE-----\n...',
    }),
    idpCert: z.string().optional().meta({
      description: 'SAML IdP signing certificate (PEM) used to verify assertions; write-only.',
      example: '-----BEGIN CERTIFICATE-----\n...',
    }),
  })
  .meta({
    id: 'IdpSecretBundle',
    description: 'IdP secret bundle. Write-only — never returned over the API.',
  })

export const IdentityProvider = z
  .object({
    id: z.string().meta({
      description: 'Identifier of the identity provider (prefix `idp_`).',
      example: 'idp_northwind',
    }),
    name: z
      .string()
      .meta({ description: 'Human-friendly display name for the IdP.', example: 'Northwind SSO' }),
    slug: z.string().meta({
      description: 'URL-safe identifier used in SSO routes, e.g. `/api/sso/{slug}/...`.',
      example: 'northwind',
    }),
    protocol: IdpProtocol.meta({
      description: 'Authentication protocol: `saml`, `oidc`, or `ldap`.',
      example: 'oidc',
    }),
    enabled: z.boolean().meta({
      description: 'Whether this IdP is active and offered as a login option.',
      example: true,
    }),
    config: z.record(z.string(), z.unknown()).meta({
      description:
        'Non-secret protocol configuration; shape depends on `protocol` (secrets are never included).',
      example: { issuer: 'https://idp.northwind.example', clientId: 'opensteward' },
    }),
    jitEnabled: z.boolean().meta({
      description: 'When true, users are just-in-time provisioned on first successful SSO login.',
      example: true,
    }),
    defaultRole: RoleEnum.meta({
      description: 'Role assigned to JIT-provisioned users when no role-mapping rule matches.',
      example: 'viewer',
    }),
    defaultScopeMode: ScopeMode.optional().meta({
      description: 'Scope applied when no scope rule matches: `all` tenants, or `restricted` to `defaultTenantIds`.',
      example: 'all',
    }),
    defaultTenantIds: z.array(z.string()).optional().meta({
      description: 'Tenants granted by the default scope when it is `restricted` (empty = none).',
      example: [],
    }),
    createdAt: IsoTimestamp.meta({
      description: 'When the IdP was created (ISO 8601).',
      example: '2026-01-15T09:30:00Z',
    }),
    updatedAt: IsoTimestamp.meta({
      description: 'When the IdP was last modified (ISO 8601).',
      example: '2026-02-01T14:20:00Z',
    }),
    createdBy: z.string().nullable().meta({
      description: 'Admin user who created the IdP; null if system-seeded.',
      example: 'usr_olivia',
    }),
    hasSecret: z.boolean().meta({
      description: 'Whether secret material (client secret, keys, etc.) is stored for this IdP.',
      example: true,
    }),
  })
  .loose()
  .meta({
    id: 'IdentityProvider',
    description:
      'A configured SSO identity provider (SAML, OIDC, or LDAP) with its non-secret config and JIT settings.',
  })

export const RoleMappingRule = z
  .object({
    id: z
      .number()
      .meta({ description: 'Numeric identifier of the role-mapping rule.', example: 7 }),
    providerId: z.string().meta({
      description: 'Identity provider this rule belongs to (prefix `idp_`).',
      example: 'idp_northwind',
    }),
    priority: z.number().meta({
      description: 'Evaluation order; lower numbers are checked first and the first match wins.',
      example: 10,
    }),
    claimPath: z.string().meta({
      description: 'Path to the IdP claim/attribute to test, e.g. `groups`.',
      example: 'groups',
    }),
    matchType: RoleMatchType.meta({
      description: 'How `matchValue` is compared to the claim: `equals`, `contains`, or `regex`.',
      example: 'contains',
    }),
    matchValue: z.string().meta({
      description: 'Value to compare against the claim using `matchType`.',
      example: 'opensteward-admins',
    }),
    role: RoleEnum.meta({
      description: 'Role granted to the user when this rule matches (the base role, for a custom-role rule).',
      example: 'admin',
    }),
    roleId: z.string().nullable().optional().meta({
      description: 'Custom role granted when this rule matches; null when the rule grants the built-in `role`.',
      example: null,
    }),
    createdAt: IsoTimestamp.meta({
      description: 'When the rule was created (ISO 8601).',
      example: '2026-01-15T09:30:00Z',
    }),
  })
  .meta({
    id: 'RoleMappingRule',
    description: 'A rule that maps an IdP claim value to an admin role during SSO login.',
  })

export const ScopeMappingRule = z
  .object({
    id: z.number().meta({ description: 'Numeric identifier of the scope rule.', example: 3 }),
    providerId: z.string().meta({
      description: 'Identity provider this rule belongs to (prefix `idp_`).',
      example: 'idp_northwind',
    }),
    priority: z.number().meta({
      description: 'Display order. Every matching scope rule applies — the tenants are unioned.',
      example: 100,
    }),
    claimPath: z.string().meta({ description: 'Path to the IdP claim/attribute to test.', example: 'groups' }),
    matchType: RoleMatchType.meta({
      description: 'How `matchValue` is compared to the claim: `equals`, `contains`, or `regex`.',
      example: 'equals',
    }),
    matchValue: z.string().meta({ description: 'Value to compare against the claim.', example: 'acme-support' }),
    tenantIds: z.array(z.string()).meta({
      description: 'Tenants granted when the rule matches. `["*"]` grants every tenant.',
      example: ['acme'],
    }),
    verticals: z.union([z.literal('*'), z.array(z.string())]).meta({
      description: 'Verticals within those tenants: `*` for every vertical, or a list.',
      example: '*',
    }),
    createdAt: IsoTimestamp.meta({ description: 'When the rule was created (ISO 8601).', example: '2026-01-15T09:30:00Z' }),
  })
  .meta({
    id: 'ScopeMappingRule',
    description: 'A rule that grants tenant scope to users whose IdP claim matches, re-applied on every SSO login.',
  })

export const ScimToken = z
  .object({
    id: z.string().meta({
      description: 'Identifier of the SCIM token record (prefix `scim_`).',
      example: 'scim_1042',
    }),
    providerId: z.string().meta({
      description: 'Identity provider this SCIM token authorizes provisioning for (prefix `idp_`).',
      example: 'idp_northwind',
    }),
    prefix: z.string().meta({
      description:
        'Public, non-secret token prefix shown in listings; the full secret is returned only once, at creation.',
      example: 'osk_acme_8f3a',
    }),
    label: z.string().nullable().meta({
      description: 'Human-friendly label for the token; null if unlabeled.',
      example: 'Production key',
    }),
    createdAt: IsoTimestamp.meta({
      description: 'When the token was created (ISO 8601).',
      example: '2026-01-15T09:30:00Z',
    }),
    createdBy: z.string().nullable().meta({
      description: 'Admin user who minted the token; null if system-generated.',
      example: 'usr_olivia',
    }),
    lastUsedAt: IsoTimestamp.nullable().meta({
      description:
        'When the token was last used by the IdP for SCIM provisioning; null if never used.',
      example: '2026-02-01T14:20:00Z',
    }),
    revokedAt: IsoTimestamp.nullable().meta({
      description: 'When the token was revoked; null while the token is active.',
      example: null,
    }),
  })
  .loose()
  .meta({
    id: 'ScimToken',
    description: 'A bearer token an IdP uses to provision users/groups via the SCIM endpoints.',
  })

export const ScimTokenMint = ScimToken.extend({
  plaintext: z.string().meta({
    description:
      'The full plaintext SCIM token; shown only once at mint time and never retrievable again.',
    example: 'osk_acme_8f3a2b9c4d5e6f7a8b9c0d1e',
  }),
}).meta({
  id: 'ScimTokenMint',
  description: 'SCIM token with the plaintext value (returned once at mint time).',
})

export const PublicIdentityProvider = z
  .object({
    slug: z.string().meta({
      description: 'URL-safe identifier used to initiate SSO for this provider.',
      example: 'northwind',
    }),
    name: z
      .string()
      .meta({ description: 'Display name shown on the login screen.', example: 'Northwind SSO' }),
    protocol: IdpProtocol.meta({
      description: 'Authentication protocol used by the provider.',
      example: 'oidc',
    }),
  })
  .meta({
    id: 'PublicIdentityProvider',
    description: 'Minimal, non-sensitive IdP info exposed on the public login screen.',
  })

export const LoginOptions = z
  .object({
    providers: z
      .array(PublicIdentityProvider)
      .meta({ description: 'Enabled SSO providers offered as login options.' }),
    localLoginEnabled: z.boolean().meta({
      description: 'Whether local username/password login is available alongside SSO.',
      example: true,
    }),
  })
  .meta({
    id: 'LoginOptions',
    description:
      'Login options surfaced to the unauthenticated login screen (SSO providers and local-login flag).',
  })

// ── Verticals + schema-status ────────────────────────────────────────────

export const VerticalHealth = z
  .object({
    name: z
      .string()
      .meta({ description: 'Name of the vertical, e.g. `accounting`.', example: 'accounting' }),
    status: z.enum(['up', 'down']).meta({
      description: 'Health of the vertical service: `up` (reachable) or `down`.',
      example: 'up',
    }),
    adapterCount: z.number().meta({
      description: 'Number of platform adapters registered for this vertical.',
      example: 4,
    }),
    error: z.string().optional().meta({
      description: 'Error detail when the vertical is `down`; absent when healthy.',
      example: 'adapter timeout',
    }),
  })
  .loose()
  .meta({
    id: 'VerticalHealth',
    description: 'Health summary for a single vertical service and its registered adapters.',
  })

export const SchemaMigrationRow = z
  .object({
    namespace: z.string().meta({
      description: 'Migration namespace, typically the vertical/database the migration belongs to.',
      example: 'accounting',
    }),
    version: z
      .number()
      .meta({ description: 'Applied schema version number for this namespace.', example: 12 }),
    appliedAt: IsoTimestamp.meta({
      description: 'When this migration version was applied (ISO 8601).',
      example: '2026-01-15T09:30:00Z',
    }),
  })
  .meta({
    id: 'SchemaMigrationRow',
    description: 'One applied schema-migration record for a database namespace.',
  })

export const SchemaStatusEntry = z
  .object({
    db: z.string().meta({ description: 'Logical database/namespace name.', example: 'accounting' }),
    path: z.string().meta({
      description: 'Filesystem path of the database file.',
      example: '/var/lib/opensteward/accounting.db',
    }),
    rows: z
      .array(SchemaMigrationRow)
      .meta({ description: 'Applied migration rows for this database, in version order.' }),
    exists: z
      .boolean()
      .meta({ description: 'Whether the database file exists on disk.', example: true }),
  })
  .meta({
    id: 'SchemaStatusEntry',
    description:
      'Migration status for one database: its path, existence, and applied migration versions.',
  })

// ── License ──────────────────────────────────────────────────────────────

const LICENSE_STATES = ['VALID', 'EXPIRING', 'GRACE', 'DEGRADED', 'INVALID', 'MISSING'] as const

const UsageConnections = z.number().int().min(0).nullable().meta({
  description:
    'Connections integration-server holds (what `limits.connections` is checked against); null when it could not count them.',
  example: 3,
})

/**
 * integration-server's `GET /admin/license` body (`LicenseStatusDTO` in
 * @opensteward/shared/licensing), as admin-api parses it. A plain `z.object`:
 * unknown keys are STRIPPED, so a newer integration-server's extra fields — or
 * anything it should never have sent, such as a token — cannot pass through.
 * Never make this `.loose()` or passthrough. `core/license/status-cache.ts` holds
 * the compile-time checks that `LicenseStatusDTO` stays assignable to this type
 * and that both declare the same keys, optional ones included.
 */
export const LicenseStatusUpstream = z.object({
  state: z.enum(LICENSE_STATES).meta({
    description:
      'License state. EXPIRING: within 30 days of expiry. GRACE: up to 30 days past it, everything still works. DEGRADED, INVALID, MISSING: community mode.',
    example: 'VALID',
  }),
  reason: z.string().optional().meta({
    description:
      'Why the state is INVALID (e.g. `BAD_SIGNATURE`, `UNKNOWN_KID`, `REVOKED`, `FILE_UNREADABLE`) or DEGRADED (`EXPIRED`).',
    example: 'BAD_SIGNATURE',
  }),
  source: z.enum(['env', 'file', 'none']).meta({
    description:
      'Where integration-server read the license: `OPENSTEWARD_LICENSE` (env), a file, or nowhere.',
    example: 'file',
  }),
  filePath: z.string().optional().meta({
    description:
      'The license file integration-server read or looked for, as a path inside its container.',
    example: '/etc/opensteward/license/license.key',
  }),
  shadowedFile: z.string().optional().meta({
    description:
      'The license file integration-server is ignoring because OPENSTEWARD_LICENSE is set (the env value wins). Renewing that file changes nothing until the env value is removed.',
    example: '/etc/opensteward/license/license.key',
  }),
  licenseId: z.string().optional().meta({ description: 'License ID.', example: 'lic_8f3k2a9x' }),
  org: z
    .string()
    .optional()
    .meta({ description: 'Organisation the license is issued to.', example: 'Acme Forsakring AB' }),
  tier: z.string().optional().meta({
    description: 'Plan name, for display only: what is enabled comes from `features` and `limits`.',
    example: 'free',
  }),
  label: z
    .string()
    .optional()
    .meta({
      description: 'Install label chosen when the license was issued.',
      example: 'production',
    }),
  env: z.string().optional().meta({
    description:
      'Licensed environment. `dev` marks a development license, which production builds refuse.',
    example: 'prod',
  }),
  kid: z
    .string()
    .optional()
    .meta({ description: 'ID of the key that signed the license.', example: 'k2026a' }),
  features: z.array(z.string()).meta({
    description: 'Enabled features: `mcp` and `vertical:<name>`.',
    example: ['mcp', 'vertical:accounting', 'vertical:crm'],
  }),
  limits: z
    .object({
      connections: z
        .number()
        .int()
        .min(0)
        .meta({ description: 'Maximum connections.', example: 5 }),
      tenants: z
        .number()
        .int()
        .min(0)
        .meta({ description: "Maximum registered tenants, counting 'default'.", example: 1 }),
    })
    .meta({
      description: 'Limits in force (the community limits outside VALID, EXPIRING and GRACE).',
    }),
  issuedAt: IsoTimestamp.optional().meta({
    description: 'When the license was issued.',
    example: '2026-10-06T17:00:00.000Z',
  }),
  expiresAt: IsoTimestamp.optional().meta({
    description: 'When the license expires.',
    example: '2027-10-06T17:00:00.000Z',
  }),
  daysRemaining: z.number().int().optional().meta({
    description: 'Whole days until expiry; negative after it.',
    example: 362,
  }),
  entitlementSource: z.enum(['license', 'community']).meta({
    description:
      '`license` while the license grants what is enabled; `community` in community mode.',
    example: 'license',
  }),
  clockRollbackDetected: z.boolean().meta({
    description: 'True when the host clock is behind the latest time licensing has seen.',
    example: false,
  }),
  revocationList: z.enum(['ok', 'missing', 'invalid']).meta({
    description: 'State of the license revocation list shipped with this build.',
    example: 'ok',
  }),
  evaluatedAt: IsoTimestamp.meta({
    description: 'When integration-server last evaluated the license.',
    example: '2026-10-09T12:00:00.000Z',
  }),
  renewalUrl: z
    .string()
    .meta({
      description: 'Where to get or renew a license.',
      example: 'https://opensteward.dev/license',
    }),
  usage: z
    .object({ connections: UsageConnections })
    .meta({ description: 'What integration-server counts against the limits.' }),
})
export type LicenseStatusUpstream = z.infer<typeof LicenseStatusUpstream>

/** `GET /api/license`: the upstream status plus what admin-api adds. */
export const LicenseStatus = LicenseStatusUpstream.extend({
  usage: z
    .object({
      connections: UsageConnections,
      tenants: z.number().int().min(0).meta({
        description:
          "Tenants registered in admin-api, counting 'default' — what `limits.tenants` is checked against.",
        example: 1,
      }),
    })
    .meta({ description: 'Usage counted against the limits.' }),
  graceEndsAt: IsoTimestamp.optional().meta({
    description:
      'End of the 30-day grace period after `expiresAt`; after it the deployment runs in community mode.',
    example: '2027-11-05T17:00:00.000Z',
  }),
  stale: z.boolean().meta({
    description:
      'True when integration-server is not answering and this is the last status it gave.',
    example: false,
  }),
  fetchedAt: IsoTimestamp.meta({
    description: 'When admin-api last read this status from integration-server.',
    example: '2026-10-09T12:00:00.000Z',
  }),
}).meta({
  id: 'LicenseStatus',
  description:
    "The deployment's license as integration-server evaluates it, as admin-api last read it. Never contains the license token.",
})
export type LicenseStatusWire = z.infer<typeof LicenseStatus>

// ── Company info ─────────────────────────────────────────────────────────

/** Full record returned by /api/company-info — the shared shape plus the
 *  two audit columns. Optional fields stay optional so the record is
 *  always representable even before an operator fills the form in. */
export const CompanyInfoRecord = CompanyInfoSchema.extend({
  updatedAt: IsoTimestamp.meta({
    description: 'When the company info was last modified (ISO 8601).',
    example: '2026-02-01T14:20:00Z',
  }),
  updatedBy: z.string().meta({
    description: 'Admin user who last modified the company info (prefix `usr_`).',
    example: 'usr_olivia',
  }),
}).meta({
  id: 'CompanyInfoRecord',
  description: 'Stored company/branding info plus audit columns for who last changed it and when.',
})

/** The shared input schema needs a stable id too so PUT bodies render by
 *  name and not as an anonymous reuse. */
export const CompanyInfoInput = CompanyInfoSchema.meta({
  id: 'CompanyInfoInput',
  description: 'Editable company/branding fields accepted when updating company info.',
})

export const PublicCompanyInfo = z
  .object({
    name: z.string().nullable().meta({
      description: 'Company display name shown on public pages; null if unset.',
      example: 'Northwind Traders',
    }),
    logoDataUrl: z.string().nullable().meta({
      description: 'Inline data-URL of the company logo; null if unset.',
      example: 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=',
    }),
    primaryColor: z
      .string()
      .nullable()
      .meta({ description: 'Primary brand color (CSS hex); null if unset.', example: '#1d4ed8' }),
    secondaryColor: z
      .string()
      .nullable()
      .meta({ description: 'Secondary brand color (CSS hex); null if unset.', example: '#0f172a' }),
    fontFamily: z.string().nullable().meta({
      description: 'CSS font-family stack for branded pages; null if unset.',
      example: 'Inter, sans-serif',
    }),
    fontDataUrl: z.string().nullable().meta({
      description: 'Inline data-URL of a custom web font; null if unset.',
      example: 'data:font/woff2;base64,d09GMgABAAAAAA==',
    }),
    fontUrl: z.string().nullable().meta({
      description: 'External stylesheet URL for the brand font; null if unset.',
      example: 'https://fonts.acme.example/inter.css',
    }),
    faviconDataUrl: z.string().nullable().meta({
      description: 'Inline data-URL of the favicon; null if unset.',
      example: 'data:image/png;base64,iVBORw0KGgo=',
    }),
    hideAttribution: z.boolean().meta({
      description: 'When true, the platform "powered by" attribution is hidden on public pages.',
      example: false,
    }),
    supportEmail: z.string().nullable().meta({
      description: 'Support contact email shown to customers; null if unset.',
      example: 'support@northwind.example',
    }),
    privacyPolicyUrl: z.string().nullable().meta({
      description: 'Link to the company privacy policy; null if unset.',
      example: 'https://acme.example/privacy',
    }),
    termsOfServiceUrl: z.string().nullable().meta({
      description: 'Link to the company terms of service; null if unset.',
      example: 'https://acme.example/terms',
    }),
    baseUrl: z.string().nullable().meta({
      description: 'Public base URL of the branded application; null if unset.',
      example: 'https://acme.example',
    }),
  })
  .meta({
    id: 'PublicCompanyInfo',
    description:
      'Public, non-sensitive company branding (logo, colors, fonts, support links) for customer-facing pages.',
  })

// ── Tenants & custom domains ──────────────────────────────────────────────

export const Tenant = z
  .object({
    id: z.string().meta({
      description:
        'Stable tenant identifier (slug); the value stored on `tenant_id` / `owner_tenant_id` columns.',
      example: 'acme',
    }),
    name: z.string().meta({
      description: 'Human-friendly tenant name shown in the admin console.',
      example: 'Acme Industries',
    }),
    createdAt: IsoTimestamp.meta({
      description: 'When the tenant was registered (ISO 8601).',
      example: '2026-01-15T09:30:00Z',
    }),
    updatedAt: IsoTimestamp.meta({
      description: 'When the tenant was last modified (ISO 8601).',
      example: '2026-02-01T14:20:00Z',
    }),
  })
  .meta({
    id: 'Tenant',
    description: 'A tenant (operator customer / internal department) that data is scoped to.',
  })

export const TenantDomain = z
  .object({
    domain: z.string().meta({
      description:
        'Custom domain mapped to the tenant; lower-cased, no scheme (e.g. `dept-a.acme.com`).',
      example: 'dept-a.acme.com',
    }),
    tenantId: z.string().meta({ description: 'Tenant this domain resolves to.', example: 'acme' }),
    createdAt: IsoTimestamp.meta({
      description: 'When the domain was attached (ISO 8601).',
      example: '2026-01-15T09:30:00Z',
    }),
  })
  .meta({
    id: 'TenantDomain',
    description:
      'A custom domain → tenant mapping. Requests arriving on this host resolve to the tenant.',
  })

/** One entry of the unauthenticated domain→tenant resolver map. */
export const TenantDomainMapEntry = z
  .object({
    domain: z
      .string()
      .meta({ description: 'Custom domain (lower-cased, no scheme).', example: 'dept-a.acme.com' }),
    tenantId: z.string().meta({ description: 'Tenant the domain resolves to.', example: 'acme' }),
  })
  .meta({
    id: 'TenantDomainMapEntry',
    description: 'One domain→tenant pair from the unauthenticated resolver map.',
  })

// ── Generic helpers ──────────────────────────────────────────────────────

/** Generic record — used for opaque-but-typed proxied payloads. Avoid in
 *  new code; prefer a named component instead. */
export const Anything = z.unknown()
