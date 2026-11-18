/**
 * Canonical OpenAPI schemas shared across every vertical.
 *
 * The unified generator merges these BEFORE the per-vertical loop and adds
 * their names to SHARED_SCHEMA_NAMES so `$ref` lookups skip vertical
 * prefixing. To add a new shared schema: define it here, and reference it
 * from per-vertical openapi.ts via `{ $ref: '#/components/schemas/<Name>' }`.
 */

import { ISO_3166_1_ALPHA2_CODES } from '@opensteward/shared'

const errorSchema = {
  type: 'object',
  required: ['code', 'description'],
  properties: {
    code: {
      type: 'string',
      description:
        'Machine-readable error code (e.g. `invalid_request`, `not_found`, `upstream_unavailable`).',
      example: 'not_found',
    },
    description: {
      type: 'string',
      description: 'Human-readable explanation of what went wrong.',
      example: 'No connection found for the given id.',
    },
    type: {
      type: 'string',
      description: 'Error category (e.g. `validation`, `auth`, `upstream`, `internal`).',
      example: 'upstream',
    },
    correlationId: {
      type: 'string',
      description: 'Request trace id; quote this when contacting support.',
      example: '1b9d6bcd-bf5c-4a3e-9b2a-2f4e8c7d1a90',
    },
    details: {
      type: 'object',
      additionalProperties: true,
      description:
        'Structured per-error context (e.g. failing field name). MUST include the full upstream error verbatim under `details.upstream` when the failure originated from an upstream platform call — preserves status code, body, headers, and any provider-specific error envelope so callers can debug without re-fetching.',
      example: { upstream: { status: 404, body: 'Not Found' } },
      properties: {
        upstream: {
          description:
            'Verbatim upstream error payload (raw provider response). Present when the failure came from an upstream platform call; omitted otherwise.',
          example: { status: 404, body: 'Not Found' },
          oneOf: [
            { type: 'object', additionalProperties: true },
            { type: 'string' },
            { type: 'null' },
          ],
        },
      },
    },
  },
}

// Active ISO 4217 currency codes (alphabetic codes only — includes precious
// metals XAU/XAG/XPT/XPD, bond market unit XBA-XBD, fund codes XDR/XSU, and
// the test/no-currency placeholders XTS/XXX). Sourced from ISO 4217:2015 +
// SNB Maintenance Agency updates through 2024.
const ISO_4217_CODES = [
  'AED', 'AFN', 'ALL', 'AMD', 'ANG', 'AOA', 'ARS', 'AUD', 'AWG', 'AZN',
  'BAM', 'BBD', 'BDT', 'BGN', 'BHD', 'BIF', 'BMD', 'BND', 'BOB', 'BOV',
  'BRL', 'BSD', 'BTN', 'BWP', 'BYN', 'BZD', 'CAD', 'CDF', 'CHE', 'CHF',
  'CHW', 'CLF', 'CLP', 'CNY', 'COP', 'COU', 'CRC', 'CUC', 'CUP', 'CVE',
  'CZK', 'DJF', 'DKK', 'DOP', 'DZD', 'EGP', 'ERN', 'ETB', 'EUR', 'FJD',
  'FKP', 'GBP', 'GEL', 'GHS', 'GIP', 'GMD', 'GNF', 'GTQ', 'GYD', 'HKD',
  'HNL', 'HTG', 'HUF', 'IDR', 'ILS', 'INR', 'IQD', 'IRR', 'ISK', 'JMD',
  'JOD', 'JPY', 'KES', 'KGS', 'KHR', 'KMF', 'KPW', 'KRW', 'KWD', 'KYD',
  'KZT', 'LAK', 'LBP', 'LKR', 'LRD', 'LSL', 'LYD', 'MAD', 'MDL', 'MGA',
  'MKD', 'MMK', 'MNT', 'MOP', 'MRU', 'MUR', 'MVR', 'MWK', 'MXN', 'MXV',
  'MYR', 'MZN', 'NAD', 'NGN', 'NIO', 'NOK', 'NPR', 'NZD', 'OMR', 'PAB',
  'PEN', 'PGK', 'PHP', 'PKR', 'PLN', 'PYG', 'QAR', 'RON', 'RSD', 'RUB',
  'RWF', 'SAR', 'SBD', 'SCR', 'SDG', 'SEK', 'SGD', 'SHP', 'SLE', 'SOS',
  'SRD', 'SSP', 'STN', 'SVC', 'SYP', 'SZL', 'THB', 'TJS', 'TMT', 'TND',
  'TOP', 'TRY', 'TTD', 'TWD', 'TZS', 'UAH', 'UGX', 'USD', 'USN', 'UYI',
  'UYU', 'UYW', 'UZS', 'VED', 'VES', 'VND', 'VUV', 'WST', 'XAF', 'XAG',
  'XAU', 'XBA', 'XBB', 'XBC', 'XBD', 'XCD', 'XDR', 'XOF', 'XPD', 'XPF',
  'XPT', 'XSU', 'XTS', 'XUA', 'XXX', 'YER', 'ZAR', 'ZMW', 'ZWL',
]

const e164Schema = {
  type: 'string',
  pattern: '^\\+[1-9]\\d{1,14}$',
  description:
    'ITU-T E.164 international phone number — leading `+`, country code, subscriber number; 15 digits max, no spaces or formatting (e.g. `+14155552671`).',
  example: '+14155550123',
}

const hexColorSchema = {
  type: 'string',
  pattern: '^#[0-9A-Fa-f]{6}$',
  description: 'CSS3 six-digit hex RGB colour (e.g. `#FF7A59`).',
  example: '#1D4ED8',
}

const mimeSchema = {
  type: 'string',
  pattern: '^[a-z]+/[a-zA-Z0-9.+_-]+$',
  description:
    'RFC 6838 media type identifier — lowercase top-level type, slash, subtype (e.g. `application/pdf`, `image/png`, `text/csv`).',
  example: 'application/pdf',
}

const iso8601Schema = {
  type: 'string',
  format: 'date-time',
  description:
    'ISO 8601 date-time with timezone offset (e.g. `2026-05-24T22:00:00.000Z`). Adapters normalize all timestamps to this format at the edge.',
  example: '2026-01-15T09:30:00Z',
}

const calendarDateSchema = {
  type: 'string',
  format: 'date',
  description:
    'Calendar date (`YYYY-MM-DD`) with no time component, because the source has none. ' +
    'Fields typed as a date-or-date-time carry this form when the platform states a date ' +
    'rather than an instant — Xero reports an invoice date as `2026-09-01`, and rendering ' +
    'that as `2026-09-01T00:00:00Z` invents a time and a zone, which shows the previous ' +
    'day to any consumer east of UTC.',
  example: '2026-02-01',
}

/**
 * The nine verticals. A closed set that only changes with a release, so it is
 * an enum everywhere it appears — a bare `type: string` gives the API console a
 * free-text box for nine known values, and invites hand-maintained copies of
 * this list that drift around the spec.
 */
const verticalSchema = {
  type: 'string',
  enum: [
    'accounting',
    'crm',
    'ecommerce',
    'logistics',
    'payments',
    'docsign',
    'projects',
    'customer-support',
    'inventory',
  ],
  description:
    'One of the nine verticals OpenSteward maps to a canonical API. Determines which adapters, resources and webhook events apply.',
  example: 'accounting',
}

const iso4217Schema = {
  type: 'string',
  pattern: '^[A-Z]{3}$',
  enum: ISO_4217_CODES,
  description: 'ISO 4217 three-letter currency code (e.g. `USD`, `EUR`, `JPY`).',
  example: 'USD',
}

const currencySchema = {
  $ref: '#/components/schemas/ISO4217',
  description: 'A currency, identified by its ISO 4217 three-letter code. Thin alias over `ISO4217` — kept as a named schema so `Money.currency` reads naturally and the layer can grow later if display metadata (symbol, name) is ever needed.',
  example: 'USD',
}

const moneySchema = {
  type: 'object',
  required: ['amount', 'currency'],
  description:
    "Monetary value with explicit currency. `amount` is a decimal number in the currency's major unit; integer-minor-unit conversions happen at the edge of the application.",
  properties: {
    amount: {
      type: 'number',
      minimum: 0,
      description: "Amount in the currency's major unit, non-negative.",
      example: 1250.0,
    },
    currency: { $ref: '#/components/schemas/Currency' },
  },
}

// Active ISO 3166-1 alpha-2 codes — the 249 officially assigned codes,
// imported from `@opensteward/shared` (the same list `Iso3166Alpha2`
// validates against at runtime) rather than re-hardcoded here, so the
// published OpenAPI spec can't drift from what the API actually accepts.
const iso3166Schema = {
  type: 'string',
  pattern: '^[A-Z]{2}$',
  enum: [...ISO_3166_1_ALPHA2_CODES],
  description: 'ISO 3166-1 alpha-2 country code (e.g. `US`, `GB`, `JP`).',
  example: 'US',
}

const addressSchema = {
  type: 'object',
  description:
    'Postal address. All fields optional; populated as the upstream platform provides them.',
  properties: {
    line1: { type: 'string', description: 'Street address, line 1.', example: '2500 Market Street' },
    line2: { type: 'string', description: 'Street address, line 2 (unit, suite).', example: 'Suite 300' },
    city: { type: 'string', description: 'City or locality.', example: 'San Francisco' },
    region: { type: 'string', description: 'State, province, or region.', example: 'CA' },
    postalCode: { type: 'string', description: 'ZIP or postal code.', example: '94114' },
    country: { $ref: '#/components/schemas/ISO3166' },
  },
}

const emailSchema = {
  type: 'object',
  required: ['email'],
  description: 'Email address with an optional usage label.',
  properties: {
    email: { type: 'string', format: 'email', description: 'RFC 5322 email address.', example: 'jane.doe@acme.example' },
    type: { type: 'string', enum: ['WORK', 'HOME', 'OTHER'], example: 'WORK' },
  },
}

const phoneSchema = {
  type: 'object',
  required: ['telephone'],
  description: 'Phone number with an optional usage label.',
  properties: {
    telephone: { $ref: '#/components/schemas/E164' },
    type: { type: 'string', enum: ['WORK', 'HOME', 'MOBILE', 'FAX', 'OTHER'], example: 'WORK' },
  },
}

const attachmentSchema = {
  type: 'object',
  description: 'File attachment metadata.',
  properties: {
    id: { type: 'string', example: 'att_8Hn2Kq' },
    filename: { type: 'string', example: 'invoice-2026-01.pdf' },
    url: { type: 'string', format: 'uri', description: 'Hosted file URL.', example: 'https://files.acme.example/invoice-2026-01.pdf' },
    mimeType: { $ref: '#/components/schemas/MIME' },
  },
}

const listMetaSchema = {
  type: 'object',
  // Every field is required. They were optional, and eight of the nine
  // verticals answered with no `meta` at all while this document promised one
  // on "every /v1/* list response" — so a client could not tell an endpoint
  // that reports pagination from one that does not. Nullable-but-present says
  // "we asked and the platform does not tell us"; absent said nothing.
  required: ['platform', 'totalCount', 'page', 'limit', 'hasMore', 'fetchedAt'],
  description:
    'Pagination + provenance metadata returned alongside every `/v1/*` list response.',
  properties: {
    platform: { type: 'string', description: 'Source platform slug.', example: 'stripe' },
    totalCount: {
      type: 'integer',
      nullable: true,
      description:
        'Total records upstream reports for this collection, or `null` when the platform ' +
        'reports no count. Most platforms report none, so `null` is the common answer.',
      example: 42,
    },
    page: {
      type: 'integer',
      description:
        'The 1-based page served. A missing `?page`, or one that is not a decimal number of ' +
        'at least 1, is page 1.',
      example: 1,
    },
    limit: {
      type: 'integer',
      description:
        'Page size the server asked the platform for: the requested `limit` capped at 500 ' +
        "and at the platform's declared page maximum, or the smaller size one endpoint of the " +
        'platform takes. `data` never exceeds it — the server truncates and logs if an ' +
        'adapter over-returns, so this always describes the payload.',
      example: 25,
    },
    hasMore: {
      type: 'boolean',
      nullable: true,
      description:
        'Whether another page exists, from an upstream count, the platform\'s own next-page ' +
        'signal, or a page shorter than `limit`. A page can be shorter than `limit` and ' +
        'still report `true`, so page by this rather than by the row count. `null` when it ' +
        'is genuinely undecidable — a full page with no upstream count is indistinguishable ' +
        'from a collection that is an exact multiple of the page size. Never guessed.',
      example: true,
    },
    fetchedAt: { type: 'string', format: 'date-time', example: '2026-02-01T14:20:00Z' },
  },
}

const singleMetaSchema = {
  type: 'object',
  required: ['platform', 'fetchedAt'],
  description: 'Provenance metadata returned alongside every `/v1/*` single-resource response.',
  properties: {
    platform: { type: 'string', description: 'Source platform slug.', example: 'stripe' },
    fetchedAt: { type: 'string', format: 'date-time', example: '2026-02-01T14:20:00Z' },
  },
}

/**
 * Build an error-response `content` block: the canonical `Error` schema plus a
 * set of named whole-body `examples` showing the distinct `code`s a caller can
 * realistically hit for that status. These are media-type examples (separate
 * from the schema's own field examples) so Swagger renders a scenario dropdown.
 */
function errorContent(examples: Record<string, { summary: string; value: unknown }>) {
  return { 'application/json': { schema: { $ref: '#/components/schemas/Error' }, examples } }
}

const ex = (code: string, description: string, type: string, summary: string) => ({
  summary,
  value: { code, description, type },
})

export const sharedHeaders = {
  XRequestId: {
    description:
      'Per-request trace id. Echoes the inbound `X-Request-Id` when supplied; otherwise the server generates one. Quote this when contacting support — every log line carries the same id under `requestId`.',
    schema: { type: 'string' },
  },
  XRateLimitLimit: {
    description: 'Rate-limit ceiling for the current window (requests).',
    schema: { type: 'integer' },
  },
  XRateLimitRemaining: {
    description: 'Requests remaining in the current rate-limit window.',
    schema: { type: 'integer' },
  },
  XRateLimitReset: {
    description: 'Seconds until the rate-limit window resets.',
    schema: { type: 'integer' },
  },
  IdempotencyReplayed: {
    description:
      'Present on cached replays of an `Idempotency-Key`-bearing request — value is always `true`. Absent on first execution.',
    schema: { type: 'string', enum: ['true'] },
  },
  IdempotencyKeyConflict: {
    description:
      'Present on the `422` response when the same `Idempotency-Key` is reused with a different request URL or body. Value is always `true`.',
    schema: { type: 'string', enum: ['true'] },
  },
  RetryAfter: {
    description:
      'Suggested backoff in seconds. Returned on `409 idempotency_in_flight` and on rate-limit-exceeded responses.',
    schema: { type: 'integer', minimum: 1 },
  },
} as const

export const sharedRequestHeaders = {
  IdempotencyKeyParam: {
    name: 'Idempotency-Key',
    in: 'header',
    required: false,
    description:
      'Opaque client-generated token (UUIDv4 recommended). When supplied on POST/PATCH/PUT/DELETE, the server caches the response for 24h keyed by `(tenant, method, route, key)`, once authentication and the license checks have let the request through. Retrying the same request (URL including query, and body) with the same key replays the original response (`Idempotency-Replayed: true`); reusing the key with a different URL or body returns `422` with `Idempotency-Key-Conflict: true`; a concurrent retry while the first is in-flight returns `409` with `Retry-After`. A refusal (`401`, `403`, `409`, `429`, or any `LICENSE_*` error) is never cached, so a retry is checked again.',
    schema: { type: 'string', maxLength: 255 },
  },
} as const

export const sharedResponses = {
  BadRequest: {
    description: 'Bad Request.',
    content: errorContent({
      validation: ex(
        'VALIDATION',
        'Request body failed validation: `email` must be a valid email address.',
        'validation',
        'Schema validation failure',
      ),
      connectionIdRequired: ex(
        'CONNECTION_ID_REQUIRED',
        'The `connection_id` query parameter is required.',
        'validation',
        'Missing connection_id',
      ),
      connectionIdInvalid: ex(
        'CONNECTION_ID_INVALID',
        '`connection_id` is not a valid UUID.',
        'validation',
        'Malformed connection_id',
      ),
    }),
  },
  Unauthorized: {
    description: 'Unauthorized.',
    content: errorContent({
      unauthenticated: ex(
        'UNAUTHENTICATED',
        'Missing or invalid API key. Provide a Bearer token in the Authorization header.',
        'auth',
        'Missing / invalid API key',
      ),
    }),
  },
  Forbidden: {
    description: 'Forbidden.',
    content: errorContent({
      insufficientScope: ex(
        'INSUFFICIENT_SCOPE',
        "This API key is missing required scope 'customers:read'.",
        'auth',
        'API key lacks the required scope',
      ),
      licenseFeatureNotEntitled: ex(
        'LICENSE_FEATURE_NOT_ENTITLED',
        "This deployment's license does not include 'vertical:accounting'. See https://opensteward.dev/license",
        'license',
        'Vertical (or MCP) not included in the license',
      ),
      licenseLimitExceeded: ex(
        'LICENSE_LIMIT_EXCEEDED',
        "Connection 1b9d6bcd-bf5c-4a3e-9b2a-2f4e8c7d1a90 is read-only: this deployment has 6 connections and its license allows 5. Reads and syncs still work; nothing was deleted. To free a slot: export a connection's data, delete it, then reconnect. For more connections: https://opensteward.dev/license",
        'license',
        'Connection beyond the license limit (writes only)',
      ),
      licenseExpired: ex(
        'LICENSE_EXPIRED',
        'Renew at https://opensteward.dev/license',
        'license',
        'License lapsed past its 30-day grace period (not returned by this release)',
      ),
    }),
  },
  NotFound: {
    description: 'Not Found.',
    content: errorContent({
      connectionNotFound: ex(
        'CONNECTION_NOT_FOUND',
        'No connection found for the given id.',
        'not_found',
        'Unknown connection',
      ),
      customerNotFound: ex(
        'CUSTOMER_NOT_FOUND',
        'No customer found for the given id.',
        'not_found',
        'Unknown customer',
      ),
    }),
  },
  NotImplemented: {
    description: 'Not Implemented.',
    content: errorContent({
      webhookHandlerNotFound: ex(
        'WEBHOOK_HANDLER_NOT_FOUND',
        'No webhook handler for logistics/no-such-platform.',
        'not_implemented',
        'No verifier wired for this (vertical, platform)',
      ),
    }),
  },
} as const

export const sharedSchemas = {
  Error: errorSchema,
  ISO8601: iso8601Schema,
  CalendarDate: calendarDateSchema,
  ISO4217: iso4217Schema,
  Vertical: verticalSchema,
  E164: e164Schema,
  HexColor: hexColorSchema,
  MIME: mimeSchema,
  Currency: currencySchema,
  Money: moneySchema,
  ISO3166: iso3166Schema,
  Address: addressSchema,
  Email: emailSchema,
  Phone: phoneSchema,
  Attachment: attachmentSchema,
  ListMeta: listMetaSchema,
  SingleMeta: singleMetaSchema,
} as const

export const SHARED_SCHEMA_NAMES: ReadonlySet<string> = new Set(Object.keys(sharedSchemas))
