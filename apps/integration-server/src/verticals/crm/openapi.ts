/**
 * Builds the CRM-vertical OpenAPI document. Imported by the unified
 * generator at apps/integration-server/scripts/generate-openapi.ts.
 *
 * The hand-maintained `paths` block mirrors every resource router under
 * ./router/ — when a new route lands there it MUST be mirrored here.
 */

import fs from 'node:fs'
import path from 'node:path'
import { z } from 'zod'

import * as schemas from './schema'
import { buildSyncOpenapiSchemas } from '@opensteward/shared'

// ── helpers ──────────────────────────────────────────────────────────────────

// Discover every adapter slug the service ships with. Drives the `platform`
// path-param enum on auth + webhook endpoints so Swagger UI offers a typed
// dropdown instead of a free-text field.
const ADAPTERS_DIR = path.resolve(__dirname, './adapters')
const PLATFORM_SLUGS = fs.readdirSync(ADAPTERS_DIR, { withFileTypes: true })
  .filter((e) => e.isDirectory())
  .map((e) => e.name)
  .sort()

const platformPathParam = {
  name: 'platform',
  in: 'path',
  required: true,
  description: 'Platform slug (e.g. `hubspot`, `salesforce`, `pipedrive`).',
  schema: { type: 'string', enum: PLATFORM_SLUGS },
}

function isZodSchema(v: unknown): v is z.ZodType {
  return typeof v === 'object' && v !== null && '_def' in (v as Record<string, unknown>)
}

// Zod 4 native JSON-Schema export. Default target (draft-2020-12) is compatible
// with the OAS 3.1 schema dialect, so nullable fields emit as
// `anyOf [..., {type: "null"}]` rather than legacy 3.0 `nullable: true`.
function toSchema(zodSchema: z.ZodType, _name: string): Record<string, unknown> {
  const json = z.toJSONSchema(zodSchema, {
    unrepresentable: 'any',
    override: (ctx) => {
      const def = (ctx.zodSchema as { _def?: { type?: string }; _zod?: { def?: { type?: string } } })
      const t = def._def?.type ?? def._zod?.def?.type
      if (t === 'date') {
        for (const k of Object.keys(ctx.jsonSchema)) delete (ctx.jsonSchema as Record<string, unknown>)[k]
        ;(ctx.jsonSchema as Record<string, unknown>).type = 'string'
        ;(ctx.jsonSchema as Record<string, unknown>).format = 'date-time'
      }
    },
  }) as Record<string, unknown>
  delete json.$schema
  return json
}

// ── shared parameters ─────────────────────────────────────────────────────────

// Connection-resolution param shared by every authenticated /v1/* operation.
// The connection row carries its own `platform`, so `connection_id` alone
// fully disambiguates the request — no `X-Provider` / `?platform=` / `?tenant=`.
const connectionIdParam = {
  name: 'connection_id',
  in: 'query',
  required: true,
  description:
    'UUID of the stored connection to use. Returned by the OAuth callback (`GET /auth/{platform}/callback`) — store it against your end-user record and pass it on every request.',
  schema: { type: 'string', format: 'uuid' },
}

const listQueryParams = [
  connectionIdParam,
  {
    name: 'page',
    in: 'query',
    description:
      "Page number, 1-based: page N starts after (N − 1) × `meta.limit` rows. A missing page, or one that is not a decimal number of at least 1, is the first page.",
    schema: { type: 'integer', minimum: 1 },
  },
  {
    name: 'limit',
    in: 'query',
    description:
      "Records per page. Defaults to 100, and is capped at 500 and at the platform's page maximum where the adapter declares one; `meta.limit` reports the page size served.",
    schema: { type: 'integer', minimum: 1, maximum: 500 },
  },
  {
    name: 'updated_after',
    in: 'query',
    description: 'Only return records modified after this ISO 8601 timestamp.',
    schema: { type: 'string', format: 'date-time' },
  },
  {
    name: 'search',
    in: 'query',
    description: 'Adapter-defined free-text search.',
    schema: { type: 'string' },
  },
  {
    name: 'is_live',
    in: 'query',
    description:
      'Set to `true` to bypass the local DB cache and fetch fresh from the upstream platform. Fresh result is still written back to cache. No-op in `passthrough` mode.',
    schema: { type: 'string', enum: ['true', 'false'] },
  },
]

const getQueryParams = [
  connectionIdParam,
  {
    name: 'is_live',
    in: 'query',
    description: 'Set to `true` to bypass the cache and fetch fresh from upstream (writes back to cache). No-op in `passthrough` mode.',
    schema: { type: 'string', enum: ['true', 'false'] },
  },
]

const idParam = {
  name: 'id',
  in: 'path',
  required: true,
  description: 'Platform-specific resource ID.',
  schema: { type: 'string' },
}

// ── response envelope builders ────────────────────────────────────────────────

function listEnvelope(schemaRef: string) {
  return {
    type: 'object',
    required: ['data', 'meta'],
    properties: {
      data: { type: 'array', items: { $ref: schemaRef } },
      meta: { $ref: '#/components/schemas/ListMeta' },
    },
  }
}

function singleEnvelope(schemaRef: string) {
  return {
    type: 'object',
    required: ['data', 'meta'],
    properties: {
      data: { $ref: schemaRef },
      meta: { $ref: '#/components/schemas/SingleMeta' },
    },
  }
}

// ── route builders ────────────────────────────────────────────────────────────

const standardSecurity = [
  { ApiKeyAuth: [] },
  { ApiKeyAuth: [] },
]

// Whole-body `empty` example for a list 200 — the populated case is already
// composed from each resource schema's field examples, so only the empty
// first-page scenario is added here.
const emptyListExamples = {
  empty: {
    summary: 'No records match — empty first page',
    value: {
      data: [],
      meta: {
        platform: 'hubspot',
        totalCount: 0,
        page: 1,
        limit: 50,
        hasMore: false,
        fetchedAt: '2026-02-01T14:20:00Z',
      },
    },
  },
}

function listGet(tag: string, schemaRef: string, summary: string) {
  return {
    tags: [tag],
    summary,
    security: standardSecurity,
    parameters: [...listQueryParams],
    responses: {
      '200': {
        description: 'Success',
        content: { 'application/json': { schema: listEnvelope(schemaRef), examples: emptyListExamples } },
      },
      '400': { $ref: '#/components/responses/BadRequest' },
      '401': { $ref: '#/components/responses/Unauthorized' },
      '501': { $ref: '#/components/responses/NotImplemented' },
    },
  }
}

function singleGet(tag: string, schemaRef: string, summary: string) {
  return {
    tags: [tag],
    summary,
    security: standardSecurity,
    parameters: [idParam, ...getQueryParams],
    responses: {
      '200': {
        description: 'Success',
        content: { 'application/json': { schema: singleEnvelope(schemaRef) } },
      },
      '400': { $ref: '#/components/responses/BadRequest' },
      '401': { $ref: '#/components/responses/Unauthorized' },
      '404': { $ref: '#/components/responses/NotFound' },
      '501': { $ref: '#/components/responses/NotImplemented' },
    },
  }
}

function createPost(tag: string, schemaRef: string, summary: string) {
  return {
    tags: [tag],
    summary,
    security: standardSecurity,
    parameters: [connectionIdParam],
    requestBody: {
      required: true,
      content: { 'application/json': { schema: { $ref: schemaRef } } },
    },
    responses: {
      '201': {
        description: 'Created',
        content: { 'application/json': { schema: singleEnvelope(schemaRef) } },
      },
      '400': { $ref: '#/components/responses/BadRequest' },
      '401': { $ref: '#/components/responses/Unauthorized' },
      '501': { $ref: '#/components/responses/NotImplemented' },
    },
  }
}

function updatePatch(tag: string, schemaRef: string, summary: string) {
  return {
    tags: [tag],
    summary,
    security: standardSecurity,
    parameters: [idParam, connectionIdParam],
    requestBody: {
      required: true,
      content: { 'application/json': { schema: { $ref: schemaRef } } },
    },
    responses: {
      '200': {
        description: 'Updated',
        content: { 'application/json': { schema: singleEnvelope(schemaRef) } },
      },
      '400': { $ref: '#/components/responses/BadRequest' },
      '401': { $ref: '#/components/responses/Unauthorized' },
      '404': { $ref: '#/components/responses/NotFound' },
      '501': { $ref: '#/components/responses/NotImplemented' },
    },
  }
}

function deleteOp(tag: string, summary: string) {
  return {
    tags: [tag],
    summary,
    security: standardSecurity,
    parameters: [idParam, connectionIdParam],
    responses: {
      '204': { description: 'Deleted — no body' },
      '400': { $ref: '#/components/responses/BadRequest' },
      '401': { $ref: '#/components/responses/Unauthorized' },
      '404': { $ref: '#/components/responses/NotFound' },
      '501': { $ref: '#/components/responses/NotImplemented' },
    },
  }
}

// ── provider schema (local, not in src/core/schema) ─────────────────────────

const providerSchema = {
  type: 'object',
  properties: {
    slug: { type: 'string', description: 'Unique adapter identifier', example: 'hubspot' },
    name: { type: 'string', example: 'HubSpot' },
    description: { type: 'string', example: 'CRM, sales, and marketing platform.' },
    website: { type: 'string', format: 'uri', example: 'https://www.hubspot.com' },
    category: { type: 'string', enum: ['crm', 'sales', 'marketing'], example: 'crm' },
    primary_color: { $ref: '#/components/schemas/HexColor' },
    auth_type: { type: 'string', enum: ['oauth2', 'oauth2_cc', 'api_key', 'session', 'local'], example: 'oauth2' },
    hq_country: { $ref: '#/components/schemas/ISO3166' },
    docs_url: { type: 'string', format: 'uri', example: 'https://developers.hubspot.com' },
    pricing_url: { type: 'string', format: 'uri', example: 'https://www.hubspot.com/pricing' },
    founded_year: { type: 'integer', example: 2006 },
    logo: {
      description: 'Base64-encoded SVG logo, or null if not yet added',
      oneOf: [{ type: 'string' }, { type: 'null' }],
    },
  },
}

// ── build components.schemas from the Zod barrel ──────────────────────────────

const zodSchemas: Record<string, unknown> = {}
for (const [name, value] of Object.entries(schemas)) {
  if (!isZodSchema(value)) continue
  // Strip the trailing "Schema" suffix from the component key so $refs read
  // naturally ("#/components/schemas/Contact" rather than ".../ContactSchema").
  const componentName = name.endsWith('Schema') ? name.slice(0, -'Schema'.length) : name
  zodSchemas[componentName] = toSchema(value, componentName)
}

// ── build the document ────────────────────────────────────────────────────────

export function buildSpec(): Record<string, unknown> {
  const doc = {
  openapi: '3.1.0',

  info: {
    title: 'Open CRM Integration',
    version: (JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../../package.json'), 'utf8')) as { version: string }).version,
    license: { name: 'Elastic-2.0', url: 'https://github.com/open-steward/opensteward/blob/main/LICENSE' },
    contact: {
      name: 'Open CRM Integration',
      url: 'https://github.com/open-steward/opensteward',
    },
    description: `Self-hosted CRM aggregation service that maps any CRM platform's
data to a unified REST API. No sign-up, no gateway — \`git clone\`, configure, run.

## Authentication

All \`/v1/*\` endpoints require the \`connection_id\` query parameter — a UUID
returned by the OAuth callback. The connection row carries its own platform,
tenant, and credentials, so no \`X-Provider\` / \`X-Tenant-Id\` headers are
needed.

## Response Envelopes

- **List:** \`{ data: T[], meta: { platform, totalCount, page, limit, hasMore, fetchedAt } }\` — \`totalCount\` and \`hasMore\` are \`null\` when unknown
- **Single:** \`{ data: T, meta: { platform, fetchedAt } }\`

## Metadata Passthrough

Every resource carries the complete, unmodified raw platform response under \`metadata\`.

## Not Implemented

Unimplemented adapter operations return \`501 Not Implemented\` with \`code: "NOT_IMPLEMENTED"\`.

## Incremental Sync

All list endpoints accept \`updated_after\` (ISO 8601) for efficient incremental sync.`,
  },

  servers: [
    { url: 'http://localhost:3010', description: 'Local development server' },
    {
      url: 'https://{host}',
      description: 'Self-hosted deployment',
      variables: {
        host: {
          default: 'integration.example.com',
          description: 'Your self-hosted domain name',
        },
      },
    },
  ],

  security: [{ ApiKeyAuth: [] }],

  tags: [
    { name: 'auth', description: 'OAuth 2.0 flows — connect, callback, revoke.' },
    { name: 'connections', description: 'Admin view of all stored OAuth connections and their status. Protected by X-Admin-Secret.' },
    { name: 'webhooks', description: 'Inbound webhook normalisation. Verifies signatures and emits canonical WebhookEvents.' },
    { name: 'providers', description: 'Static metadata about enabled CRM platforms.' },
    { name: 'Sync', description: 'Background full-sync job management at `/v1/crm/sync`. Auth: tenant-scoped Bearer key with `vertical:crm` scope. Routes are mounted only when `dataStore.mode != passthrough`.' },
    { name: 'contacts', description: 'People — leads, prospects, customers. Full CRUD.' },
    { name: 'companies', description: 'Organisations / accounts. Full CRUD.' },
    { name: 'deals', description: 'Sales opportunities. Full CRUD.' },
    { name: 'pipelines', description: 'Deal pipelines and stages. Read-only.' },
    { name: 'activities', description: 'Tasks, calls, meetings, emails. Full CRUD.' },
    { name: 'notes', description: 'Free-form notes attached to contacts, companies, or deals. Full CRUD.' },
  ],

  paths: {
    // Auth routes documented in the unified spec — see control-plane-spec.ts.
    // Single `/auth/{vertical}/{platform}/*` covers all four verticals.

    // Providers are documented once in the unified spec (control-plane-spec.ts).

    // ── Contacts ─────────────────────────────────────────────────────────────
    '/v1/contacts': {
      get: listGet('contacts', '#/components/schemas/Contact', 'List contacts'),
      post: createPost('contacts', '#/components/schemas/Contact', 'Create contact'),
    },
    '/v1/contacts/{id}': {
      get: singleGet('contacts', '#/components/schemas/Contact', 'Get contact'),
      patch: updatePatch('contacts', '#/components/schemas/Contact', 'Update contact'),
      delete: deleteOp('contacts', 'Delete contact'),
    },

    // ── Companies ────────────────────────────────────────────────────────────
    '/v1/companies': {
      get: listGet('companies', '#/components/schemas/Company', 'List companies'),
      post: createPost('companies', '#/components/schemas/Company', 'Create company'),
    },
    '/v1/companies/{id}': {
      get: singleGet('companies', '#/components/schemas/Company', 'Get company'),
      patch: updatePatch('companies', '#/components/schemas/Company', 'Update company'),
      delete: deleteOp('companies', 'Delete company'),
    },

    // ── Deals ────────────────────────────────────────────────────────────────
    '/v1/deals': {
      get: listGet('deals', '#/components/schemas/Deal', 'List deals'),
      post: createPost('deals', '#/components/schemas/Deal', 'Create deal'),
    },
    '/v1/deals/{id}': {
      get: singleGet('deals', '#/components/schemas/Deal', 'Get deal'),
      patch: updatePatch('deals', '#/components/schemas/Deal', 'Update deal'),
      delete: deleteOp('deals', 'Delete deal'),
    },

    // ── Pipelines (read-only) ────────────────────────────────────────────────
    '/v1/pipelines': {
      get: listGet('pipelines', '#/components/schemas/Pipeline', 'List pipelines'),
    },
    '/v1/pipelines/{id}': {
      get: singleGet('pipelines', '#/components/schemas/Pipeline', 'Get pipeline'),
    },

    // ── Activities ───────────────────────────────────────────────────────────
    '/v1/activities': {
      get: listGet('activities', '#/components/schemas/Activity', 'List activities'),
      post: createPost('activities', '#/components/schemas/Activity', 'Create activity'),
    },
    '/v1/activities/{id}': {
      get: singleGet('activities', '#/components/schemas/Activity', 'Get activity'),
      patch: updatePatch('activities', '#/components/schemas/Activity', 'Update activity'),
      delete: deleteOp('activities', 'Delete activity'),
    },

    // ── Notes ────────────────────────────────────────────────────────────────
    '/v1/notes': {
      get: listGet('notes', '#/components/schemas/Note', 'List notes'),
      post: createPost('notes', '#/components/schemas/Note', 'Create note'),
    },
    '/v1/notes/{id}': {
      get: singleGet('notes', '#/components/schemas/Note', 'Get note'),
      patch: updatePatch('notes', '#/components/schemas/Note', 'Update note'),
      delete: deleteOp('notes', 'Delete note'),
    },

    // Sync paths live in the unified spec (control-plane-spec.ts).

    // ── Connections (admin) ──────────────────────────────────────────────────
    '/connections': {
      get: {
        tags: ['connections'],
        summary: 'List all connections',
        description: 'Returns all stored OAuth connections with real-time status (`valid`, `expiring_soon`, `expired`). No credential decryption occurs.',
        security: [{ AdminSecret: [] }],
        responses: {
          '200': {
            description: 'Success',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    data: { type: 'array', items: { $ref: '#/components/schemas/Connection' } },
                    meta: { $ref: '#/components/schemas/ListMeta' },
                  },
                },
              },
            },
          },
          '403': { $ref: '#/components/responses/Forbidden' },
        },
      },
    },
    '/connections/{id}': {
      get: {
        tags: ['connections'],
        summary: 'Get a single connection',
        security: [{ AdminSecret: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: {
          '200': {
            description: 'Success',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    data: { $ref: '#/components/schemas/Connection' },
                    meta: { $ref: '#/components/schemas/SingleMeta' },
                  },
                },
              },
            },
          },
          '403': { $ref: '#/components/responses/Forbidden' },
          '404': { $ref: '#/components/responses/NotFound' },
        },
      },
      delete: {
        tags: ['connections'],
        summary: 'Delete connection',
        description: 'Removes stored credentials. Does **not** call the platform to revoke tokens.',
        security: [{ AdminSecret: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: {
          '204': { description: 'Deleted — no body' },
          '403': { $ref: '#/components/responses/Forbidden' },
          '404': { $ref: '#/components/responses/NotFound' },
        },
      },
    },

    // ── Webhooks ──────────────────────────────────────────────────────────────
    '/webhooks/{platform}': {
      post: {
        tags: ['webhooks'],
        summary: 'Receive platform webhook',
        description:
          'Verifies the incoming webhook signature and parses the raw payload into canonical `WebhookEvent` objects.',
        security: [],
        parameters: [platformPathParam],
        requestBody: {
          description: 'Raw platform webhook payload.',
          required: true,
          content: { 'application/json': { schema: { type: 'object', additionalProperties: true } } },
        },
        responses: {
          '200': {
            description: 'Webhook received and processed.',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    received: { type: 'boolean', enum: [true] },
                    eventCount: { type: 'integer' },
                  },
                },
              },
            },
          },
          '400': { $ref: '#/components/responses/BadRequest' },
          '401': {
            description: 'Unauthorized — webhook signature verification failed.',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
          },
          '404': { $ref: '#/components/responses/NotFound' },
        },
      },
    },

    // ── Health ───────────────────────────────────────────────────────────────
    '/health': {
      get: {
        tags: [],
        summary: 'Liveness probe',
        responses: {
          '200': {
            description: 'Service is up',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: { status: { type: 'string', enum: ['ok'] } },
                },
              },
            },
          },
        },
      },
    },
  },

  components: {
    // securitySchemes owned by `control-plane-spec.ts`. See accounting/openapi.ts
    // for context.

    responses: {
      BadRequest: {
        description: 'Bad Request — missing or invalid parameters.',
        content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
      },
      Unauthorized: {
        description: 'Unauthorized — missing or invalid credentials.',
        content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
      },
      NotFound: {
        description: 'Not Found — resource does not exist on this platform.',
        content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
      },
      Forbidden: {
        description: 'Forbidden — missing or invalid X-Admin-Secret header.',
        content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
      },
      NotImplemented: {
        description: 'Not Implemented — this adapter has not implemented this operation.',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                error: { type: 'string' },
                code: { type: 'string', enum: ['NOT_IMPLEMENTED'] },
              },
            },
          },
        },
      },
    },

    schemas: {
      ...zodSchemas,
      ...buildSyncOpenapiSchemas(),
      Provider: providerSchema,
    },
  },
}

  return doc
}
