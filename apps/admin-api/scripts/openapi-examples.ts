/**
 * Named whole-body `examples` injection for the admin-api OpenAPI doc.
 *
 * The admin spec is emitted by `fastify-zod-openapi` from the live Zod
 * `schema:` options — that bridge surfaces per-field `example` values but
 * has no way to attach the richer, named *media-type* `examples` maps that
 * Swagger UI / the SDK docs use to show full request/response bodies for
 * concrete scenarios (e.g. "minted key", "locked out", "self-register
 * template"). Those have to be layered on AFTER generation.
 *
 * This module is a pure post-processor: `injectExamples(doc)` walks the
 * emitted document and sets
 *   - `requestBody.content['application/json'].examples`, and/or
 *   - `responses[code].content['application/json'].examples`
 * for a curated, hand-authored map keyed by `path` + HTTP `verb`. It never
 * touches any Zod schema, any component, or any field-level `example` — it
 * only ADDS media-type `examples` maps. The field-example coverage gate
 * (`pnpm check:openapi-examples`) is therefore unaffected.
 *
 * Every `value` below is a FULL body that validates against that
 * operation's real response/request schema (see `routes/_openapi.ts`
 * envelope helpers `dataEnvelope` / `errorBody` and the per-route bodies):
 *   - `auth.login` / `auth.setup` 2xx send a BARE `{ token, user }`
 *     (AuthTokenResponse) — NOT data-enveloped.
 *   - error bodies are BARE `{ error, ... }` (ErrorBody) — NOT enveloped.
 *   - list/get/create resource 2xx are `{ data: … }` (dataEnvelope).
 *   - `audit.list` 200 is `{ data: [...], meta: { page, limit, total } }`.
 *
 * Values reuse a single dictionary of identifiers (operator user
 * `usr_olivia`, end-user `cus_4Qm2Xa9Lr`, tenant `acme`, key `key_1042`,
 * etc.) so the spec reads as one coherent worked example. Admin timestamps
 * are NUMERIC epoch-ms, matching the Zod schemas.
 */

interface MediaTypeObject {
  schema?: unknown
  example?: unknown
  examples?: Record<string, { summary?: string; description?: string; value: unknown }>
  [key: string]: unknown
}

interface RequestBodyObject {
  content?: Record<string, MediaTypeObject>
  [key: string]: unknown
}

interface ResponseObject {
  content?: Record<string, MediaTypeObject>
  [key: string]: unknown
}

interface OperationObject {
  requestBody?: RequestBodyObject
  responses?: Record<string, ResponseObject>
  [key: string]: unknown
}

interface PathItemObject {
  [verb: string]: OperationObject | undefined
}

interface OpenApiDocument {
  paths?: Record<string, PathItemObject>
  [key: string]: unknown
}

type ExampleMap = Record<string, { summary?: string; description?: string; value: unknown }>

/** A single named-example. */
function ex(summary: string, value: unknown): { summary: string; value: unknown } {
  return { summary, value }
}

/**
 * A bare admin-api error body (`ErrorBody`): `{ error, ... }` — NOT enveloped.
 * Most handlers send a terse `error: string`; pass extra fields (e.g. a
 * `code`/`message` object, or `detail`) through `extra` when modelling the
 * structured shape.
 */
export function errorExample(
  message: string,
  extra?: Record<string, unknown>,
): { error: string } & Record<string, unknown> {
  return { error: message, ...(extra ?? {}) }
}

// ── Shared dictionary values ────────────────────────────────────────────────
const CREATED_AT = 1768469400000
const UPDATED_AT = 1769949600000

const ADMIN_USER = { id: 'usr_olivia', username: 'olivia.admin', role: 'admin' as const }
const OPERATOR_USER = { id: 'usr_marco', username: 'marco.ops', role: 'operator' as const }

// ── Per-operation curated maps ──────────────────────────────────────────────

/** requestBody examples, keyed by `${verb} ${path}`. */
const REQUEST_EXAMPLES: Record<string, ExampleMap> = {
  'post /api/users': {
    admin: ex('Create an admin (full access)', {
      username: 'olivia.admin',
      password: 's3cr3t-password',
      role: 'admin',
    }),
    operator: ex('Create an operator (manage resources, no user admin)', {
      username: 'marco.ops',
      password: 's3cr3t-password',
      role: 'operator',
    }),
    viewer: ex('Create a viewer (read-only)', {
      username: 'vera.view',
      password: 's3cr3t-password',
      role: 'viewer',
    }),
  },
  'post /api/connect-link-templates': {
    pinned: ex('Pinned — adapter pre-selected, customer has nothing to pick', {
      tenantId: 'acme',
      name: 'Acme onboarding',
      description: 'Onboarding link for Acme Industries.',
      linkMode: 'pinned',
      allowedVerticals: ['accounting'],
      allowedPlatforms: [{ vertical: 'accounting', slug: 'xero' }],
      scopeGroupId: 7,
      expiryDays: 7,
      oneTimeOnly: false,
      redirectUrl: 'https://app.acme.example/return',
    }),
    'customer-picks': ex('Customer-picks — customer chooses from an allow-list', {
      tenantId: 'acme',
      name: 'Acme onboarding',
      description: 'Customer chooses which accounting platform to connect.',
      linkMode: 'customer-picks-adapter',
      allowedVerticals: ['accounting'],
      allowedPlatforms: [
        { vertical: 'accounting', slug: 'xero' },
        { vertical: 'accounting', slug: 'quickbooks' },
      ],
      scopeGroupId: 7,
      expiryDays: 7,
      oneTimeOnly: false,
      redirectUrl: 'https://app.acme.example/return',
    }),
    'self-register': ex('Self-register — open onboarding, no allow-list', {
      tenantId: 'acme',
      name: 'Acme onboarding',
      description: 'Open self-registration link.',
      linkMode: 'self-register',
      allowedVerticals: [],
      allowedPlatforms: [],
      expiryDays: 7,
      oneTimeOnly: false,
      redirectUrl: 'https://app.acme.example/return',
    }),
  },
  'post /api/api-keys': {
    minted: ex('Mint a scoped tenant key', {
      tenantId: 'acme',
      label: 'Production key',
      scopes: ['customers:read', 'connections:read'],
    }),
  },
}

// A connect-link-template response body for a given mode (full ConnectLinkTemplate).
function connectLinkTemplate(
  linkMode: 'pinned' | 'customer-picks-adapter' | 'self-register',
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id: 7,
    tenantId: 'acme',
    name: 'Acme onboarding',
    description: 'Onboarding link for Acme Industries.',
    linkMode,
    allowedPlatforms: [{ vertical: 'accounting', slug: 'xero' }],
    allowedVerticals: ['accounting'],
    scopeGroupId: 7,
    expiryDays: 7,
    oneTimeOnly: false,
    redirectUrl: 'https://app.acme.example/return',
    createdAt: CREATED_AT,
    createdBy: 'usr_olivia',
    ...overrides,
  }
}

// A connect-session row (full ConnectSession) in a given lifecycle state.
function connectSession(
  status: 'active' | 'consumed' | 'expired',
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id: 'cs_8f3a2b9c4d',
    token: 'cl_8f3a2b9c4d',
    tenantId: 'acme',
    endUserId: 'cus_4Qm2Xa9Lr',
    label: 'Acme onboarding',
    allowedVerticals: ['accounting'],
    allowedPlatforms: [{ vertical: 'accounting', slug: 'xero' }],
    redirectUrl: 'https://app.acme.example/return',
    expiresAt: UPDATED_AT,
    consumedAt: null,
    connectionId: null,
    createdAt: CREATED_AT,
    createdBy: 'usr_olivia',
    status,
    oneTimeOnly: false,
    url: 'https://connect.northwind.example/cl_8f3a2b9c4d',
    ...overrides,
  }
}

/** A masked API-key row (`ApiKey`) — prefix only, never the plaintext. */
function apiKeyRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'key_1042',
    tenantId: 'acme',
    prefix: 'osk_acme_8f3a',
    label: 'Production key',
    scopes: ['customers:read', 'connections:read'],
    createdAt: CREATED_AT,
    lastUsedAt: UPDATED_AT,
    revokedAt: null,
    ...overrides,
  }
}

/** response examples, keyed by `${verb} ${path}` → `${statusCode}` → map. */
const RESPONSE_EXAMPLES: Record<string, Record<string, ExampleMap>> = {
  'post /api/auth/login': {
    '200': {
      admin: ex('Admin signs in', { token: 'eyJhbGciOiJIUzI1NiJ9.olivia', user: ADMIN_USER }),
      operator: ex('Operator signs in', {
        token: 'eyJhbGciOiJIUzI1NiJ9.marco',
        user: OPERATOR_USER,
      }),
    },
    '401': {
      'invalid-credentials': ex('Wrong username or password', errorExample('Invalid credentials')),
    },
    '429': {
      'locked-out': ex(
        'Too many failed attempts — temporarily locked',
        errorExample('Too many failed attempts — retry in 30s.'),
      ),
    },
    '403': {
      'sso-only': ex(
        'Local password login disabled — SSO required',
        errorExample(
          'Local password login is disabled. Please sign in with your organization (SSO).',
        ),
      ),
    },
  },
  'post /api/auth/setup': {
    '201': {
      created: ex('First-run admin created', {
        token: 'eyJhbGciOiJIUzI1NiJ9.olivia',
        user: ADMIN_USER,
      }),
    },
    '409': {
      'already-completed': ex(
        'Setup already ran — users exist',
        errorExample('Setup already completed — users exist'),
      ),
    },
  },
  'post /api/api-keys': {
    '201': {
      minted: ex('Key minted — plaintext shown once', {
        data: {
          ...apiKeyRow({ lastUsedAt: null }),
          plaintext: 'osk_acme_8f3a2b9c4d5e6f7a8b9c0d1e2f3a4b5c',
        },
      }),
    },
  },
  'get /api/api-keys': {
    '200': {
      'masked-list': ex('Active + revoked keys, prefix only (no plaintext)', {
        data: [
          apiKeyRow(),
          apiKeyRow({
            id: 'key_0987',
            prefix: 'osk_acme_2c4e',
            label: 'Rotated key',
            lastUsedAt: null,
            revokedAt: UPDATED_AT,
          }),
        ],
      }),
    },
  },
  'post /api/connect-link-templates': {
    '201': {
      pinned: ex('Pinned template created', { data: connectLinkTemplate('pinned') }),
      'customer-picks': ex('Customer-picks template created', {
        data: connectLinkTemplate('customer-picks-adapter', {
          description: 'Customer chooses which accounting platform to connect.',
          allowedPlatforms: [
            { vertical: 'accounting', slug: 'xero' },
            { vertical: 'accounting', slug: 'quickbooks' },
          ],
        }),
      }),
      'self-register': ex('Self-register template created', {
        data: connectLinkTemplate('self-register', {
          description: 'Open self-registration link.',
          allowedPlatforms: [],
          allowedVerticals: [],
        }),
      }),
    },
  },
  'get /api/connect-sessions': {
    '200': {
      mixed: ex('Sessions across the lifecycle: active, consumed, expired', {
        data: [
          connectSession('active'),
          connectSession('consumed', {
            id: 'cs_1b2c3d4e5f',
            token: 'cl_1b2c3d4e5f',
            consumedAt: UPDATED_AT,
            connectionId: 'conn_1042',
            url: 'https://connect.northwind.example/cl_1b2c3d4e5f',
          }),
          connectSession('expired', {
            id: 'cs_9z8y7x6w5v',
            token: 'cl_9z8y7x6w5v',
            endUserId: null,
            expiresAt: CREATED_AT,
            url: 'https://connect.northwind.example/cl_9z8y7x6w5v',
          }),
        ],
      }),
    },
  },
  'get /api/audit': {
    '200': {
      mixed: ex('Recent entries mixing mint, login, and connection actions', {
        data: [
          {
            id: 1042,
            user_id: 'usr_olivia',
            action: 'api_key.mint',
            vertical: null,
            target_id: 'key_1042',
            detail: { action: 'api_key.mint' },
            created_at: UPDATED_AT,
          },
          {
            id: 1041,
            user_id: 'usr_olivia',
            action: 'user.login',
            vertical: null,
            target_id: null,
            detail: { action: 'user.login' },
            created_at: CREATED_AT,
          },
          {
            id: 1040,
            user_id: 'usr_marco',
            action: 'connection.create',
            vertical: 'accounting',
            target_id: 'conn_1042',
            detail: { action: 'connection.create' },
            created_at: CREATED_AT,
          },
        ],
        meta: { page: 1, limit: 50, total: 1042 },
      }),
    },
  },
  'post /api/users': {
    '201': {
      admin: ex('Admin created', { data: { id: 'usr_olivia', username: 'olivia.admin', role: 'admin' } }),
      operator: ex('Operator created', {
        data: { id: 'usr_marco', username: 'marco.ops', role: 'operator' },
      }),
      viewer: ex('Viewer created', { data: { id: 'usr_vera', username: 'vera.view', role: 'viewer' } }),
    },
    '409': {
      duplicate: ex('Username already taken', errorExample('Username already exists')),
    },
  },
}

// Representative common error envelopes to attach where the operation
// declares the status but we have no scenario-specific body above. Bare
// `ErrorBody` shapes, matching what the handlers actually send.
const COMMON_ERRORS: Record<string, { summary: string; value: unknown }> = {
  '400': ex('Validation failed', errorExample('Request validation failed.', {
    code: 'invalid_request',
  })),
  '401': ex('Missing or invalid token', errorExample('Unauthorized')),
  '403': ex('Insufficient role', errorExample('Forbidden')),
  '404': ex('Resource not found', errorExample('Not found')),
  '409': ex('Conflict', errorExample('Already exists')),
}

// Which (path, verb) operations should receive the generic COMMON_ERRORS
// fallback for any declared 4xx that doesn't already have a curated body.
const COMMON_ERROR_OPS = new Set<string>([
  'post /api/api-keys',
  'get /api/api-keys',
  'post /api/connect-link-templates',
  'get /api/connect-sessions',
  'get /api/audit',
  'post /api/users',
])

const JSON_MEDIA = 'application/json'

function setMediaExamples(content: Record<string, MediaTypeObject> | undefined, examples: ExampleMap): void {
  if (!content) return
  const media = content[JSON_MEDIA]
  if (!media) return
  media.examples = { ...(media.examples ?? {}), ...examples }
}

/**
 * Walk the emitted OpenAPI document and attach the curated named-body
 * `examples` maps onto request bodies and responses. Mutates `doc` in
 * place (and returns it for convenience). Pure ADD — never removes or
 * rewrites schemas or field-level examples.
 */
export function injectExamples(doc: OpenApiDocument): OpenApiDocument {
  const paths = doc.paths ?? {}
  for (const [pathKey, pathItem] of Object.entries(paths)) {
    if (!pathItem || typeof pathItem !== 'object') continue
    for (const [verb, op] of Object.entries(pathItem)) {
      if (!op || typeof op !== 'object') continue
      const key = `${verb.toLowerCase()} ${pathKey}`

      // Request body examples.
      const reqMap = REQUEST_EXAMPLES[key]
      if (reqMap) setMediaExamples(op.requestBody?.content, reqMap)

      // Response examples (curated, per status code).
      const respMap = RESPONSE_EXAMPLES[key]
      if (respMap && op.responses) {
        for (const [code, examples] of Object.entries(respMap)) {
          setMediaExamples(op.responses[code]?.content, examples)
        }
      }

      // Generic error-envelope fallback for declared 4xx codes without a
      // curated body, on the representative operations.
      if (COMMON_ERROR_OPS.has(key) && op.responses) {
        for (const [code, response] of Object.entries(op.responses)) {
          const fallback = COMMON_ERRORS[code]
          if (!fallback) continue
          const media = response?.content?.[JSON_MEDIA]
          if (!media) continue
          // Don't clobber a curated scenario already set for this code.
          if (media.examples && Object.keys(media.examples).length > 0) continue
          media.examples = { default: fallback }
        }
      }
    }
  }
  return doc
}
