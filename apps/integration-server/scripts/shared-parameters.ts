/**
 * Canonical OpenAPI parameter objects shared across every vertical.
 *
 * The unified generator injects these into `components.parameters` and then
 * runs `collapseInlineParameters()` to replace inline param objects that
 * match (`name` + `in`) with `{ $ref: '#/components/parameters/<Name>' }`.
 *
 * Why match on just (name + in)? OpenAPI semantically requires each
 * (name, in) tuple to be unique per operation — so `connection_id` as a
 * query param always means the same thing. This lets us absorb minor
 * description variations across per-vertical builders without having to
 * unify every wording first.
 */

const connectionIdParam = {
  name: 'connection_id',
  in: 'query',
  required: true,
  description:
    'UUID of the stored connection to use. On the live surface it is returned by the OAuth callback (`GET /auth/{vertical}/{platform}/callback`) — store it against your end-user record and pass it on every `/v1/{vertical}/*` request. **In test mode**, get one from `GET /test/v1/connections` (one per vertical, deterministic — start there).',
  schema: {
    type: 'string',
    format: 'uuid',
    example: '1b9d6bcd-bf5c-4a3e-9b2a-2f4e8c7d1a90',
  },
}

const idParam = {
  name: 'id',
  in: 'path',
  required: true,
  description: 'Platform-specific resource ID.',
  schema: { type: 'string' },
}

const pageParam = {
  name: 'page',
  in: 'query',
  required: false,
  description:
    "Page number, 1-based: page N starts after (N − 1) × `meta.limit` rows. A missing page, or one that is not a decimal number of at least 1, is the first page.",
  schema: { type: 'integer', minimum: 1 },
}

const limitParam = {
  name: 'limit',
  in: 'query',
  required: false,
  // Shared with control-plane lists (/events, webhook deliveries, sync jobs),
  // which collapse onto this by (name, in): the platform clause is scoped.
  description:
    "Records per page, at most 500. On `/v1/{vertical}/*` lists it defaults to 100 and is also capped at the platform's page maximum where the adapter declares one; `meta.limit` reports the page size served.",
  schema: { type: 'integer', minimum: 1, maximum: 500 },
}

const updatedAfterParam = {
  name: 'updated_after',
  in: 'query',
  required: false,
  description:
    'Only return records modified at or after this ISO 8601 timestamp. Filters on each record\'s `updatedAt`, which every entity returns — so the correct watermark for an incremental poll is `max(updatedAt)` across the records you just received, NOT your own clock at request time. Using your clock loses any record modified while the request was in flight; a safety margin re-fetches a window and is a guess in both directions. '
    + 'The boundary is INCLUSIVE, and some platforms compare at second granularity (Xero does), so passing back `max(updatedAt)` re-delivers the records at that timestamp. That is deliberate: skipping past them would silently drop anything modified in the same second. Make your consumer idempotent — upsert by `id` — rather than advancing the watermark to exclude them.',
  schema: { $ref: '#/components/schemas/ISO8601' },
}

const searchParam = {
  name: 'search',
  in: 'query',
  required: false,
  description: 'Adapter-defined free-text search.',
  schema: { type: 'string' },
}

const isLiveParam = {
  name: 'is_live',
  in: 'query',
  required: false,
  description:
    'Set to `true` to bypass the local DB cache and fetch fresh from the upstream platform. Fresh result is still written back to cache. No-op in `passthrough` mode.',
  schema: { type: 'string', enum: ['true', 'false'] },
}

const includePiiParam = {
  name: 'include_pii',
  in: 'query',
  required: false,
  description:
    'When `true`, response `data.pii` is populated with the decrypted record. Requires the `customers:read_pii` scope.',
  schema: { type: 'string', enum: ['true', 'false'] },
}

export const sharedParameters = {
  ConnectionIdParam: connectionIdParam,
  IdParam: idParam,
  PageParam: pageParam,
  LimitParam: limitParam,
  UpdatedAfterParam: updatedAfterParam,
  SearchParam: searchParam,
  IsLiveParam: isLiveParam,
  IncludePiiParam: includePiiParam,
} as const

/**
 * Lookup from `name|in` (the OpenAPI uniqueness key) to canonical component
 * name. Used by the inline-parameter collapser walker.
 */
export const SHARED_PARAM_INDEX: ReadonlyMap<string, string> = new Map(
  Object.entries(sharedParameters).map(([key, p]) => [`${p.name}|${p.in}`, key]),
)
