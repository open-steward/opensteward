/**
 * Builds the docsign-vertical OpenAPI document. Imported by the unified
 * generator at apps/integration-server/scripts/generate-openapi.ts.
 *
 * Walks `./schema/index.ts` for `components.schemas` and emits a
 * hand-maintained `paths` block covering every resource router in `./router/`.
 */

import fs from 'node:fs'
import path from 'node:path'
import { z } from 'zod'

import * as schemas from './schema'
import { buildSyncOpenapiSchemas } from '@opensteward/shared'
import { EnvelopeSchema } from './schema/envelope'
import { SignerSchema } from './schema/signer'
import { DocumentSchema } from './schema/document'
import { AuditTrailEntrySchema } from './schema/audit-trail-entry'
import { TemplateSchema } from './schema/template'

function isZodSchema(v: unknown): v is z.ZodType {
  return typeof v === 'object' && v !== null && '_def' in (v as Record<string, unknown>)
}

function toSchema(zodSchema: z.ZodType, _name: string): Record<string, unknown> {
  const json = z.toJSONSchema(zodSchema, {
    unrepresentable: 'any',
    override: (ctx) => {
      const def = ctx.zodSchema as { _def?: { type?: string }; _zod?: { def?: { type?: string } } }
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

const ADAPTERS_DIR = path.resolve(__dirname, './adapters')
const PLATFORM_SLUGS = fs
  .readdirSync(ADAPTERS_DIR, { withFileTypes: true })
  .filter((e) => e.isDirectory())
  .map((e) => e.name)
  .sort()

const authPlatformParam = {
  name: 'platform',
  in: 'path',
  required: true,
  description: 'Platform slug (e.g. `docusign`, `dropbox-sign`, `pandadoc`).',
  schema: { type: 'string', enum: PLATFORM_SLUGS },
}

const connectionIdParam = {
  name: 'connection_id',
  in: 'query',
  required: true,
  description:
    'UUID of the stored connection to use. Returned by the OAuth callback (`GET /auth/{platform}/callback`).',
  schema: { type: 'string', format: 'uuid' },
}

const envelopeIdQueryParam = {
  name: 'envelope_id',
  in: 'query',
  required: true,
  description: 'Envelope id to scope the list under. Signers, documents, and audit-trail entries are envelope-scoped on every platform.',
  schema: { type: 'string' },
}

const limitParam = {
  name: 'limit',
  in: 'query',
  required: false,
  description:
    "Records per page. Defaults to 100, and is capped at 500 and at the platform's page maximum where the adapter declares one; `meta.limit` reports the page size served.",
  schema: { type: 'integer', minimum: 1, maximum: 500 },
}

const pageParam = {
  name: 'page',
  in: 'query',
  required: false,
  description:
    "Page number, 1-based: page N starts after (N − 1) × `meta.limit` rows. A missing page, or one that is not a decimal number of at least 1, is the first page.",
  schema: { type: 'integer', minimum: 1 },
}

const cursorParam = {
  name: 'cursor',
  in: 'query',
  required: false,
  deprecated: true,
  description: "Not read by the server. Page with `page` and `limit`, and stop when `meta.hasMore` is false.",
  schema: { type: 'string' },
}

const updatedAfterParam = {
  name: 'updated_after',
  in: 'query',
  required: false,
  description: 'Only return records modified after this ISO 8601 timestamp.',
  schema: { type: 'string', format: 'date-time' },
}

const idPathParam = {
  name: 'id',
  in: 'path',
  required: true,
  description: 'Platform-specific resource id.',
  schema: { type: 'string' },
}

const listQueryParams = [connectionIdParam, limitParam, pageParam, cursorParam, updatedAfterParam]
const envelopeScopedListParams = [connectionIdParam, envelopeIdQueryParam, limitParam, pageParam, cursorParam]
const getQueryParams = [connectionIdParam]

const errorResponse400 = { $ref: '#/components/responses/BadRequest' }
const errorResponse401 = { $ref: '#/components/responses/Unauthorized' }
const errorResponse404 = { $ref: '#/components/responses/NotFound' }
const errorResponse501 = { $ref: '#/components/responses/NotImplemented' }

function listEnvelope(schemaRef: string) {
  return {
    type: 'object',
    required: ['data'],
    properties: { data: { type: 'array', items: { $ref: schemaRef } } },
  }
}

function singleEnvelope(schemaRef: string) {
  return {
    type: 'object',
    required: ['data'],
    properties: { data: { $ref: schemaRef } },
  }
}

interface OpMeta {
  tag: string
  schemaRef: string
  operationId: string
  summary: string
  description: string
}

// Whole-body `empty` example for a list 200 — the populated case is already
// composed from each resource schema's field examples, so only the empty
// first-page scenario is added here.
const emptyListExamples = {
  empty: {
    summary: 'No records match — empty first page',
    value: { data: [] },
  },
}

function listOp(meta: OpMeta, params: readonly object[] = listQueryParams) {
  return {
    tags: [meta.tag],
    operationId: meta.operationId,
    summary: meta.summary,
    description: meta.description,
    parameters: params,
    responses: {
      '200': { description: 'Success', content: { 'application/json': { schema: listEnvelope(meta.schemaRef), examples: emptyListExamples } } },
      '400': errorResponse400,
      '401': errorResponse401,
      '501': errorResponse501,
    },
  }
}

function getOp(meta: OpMeta) {
  return {
    tags: [meta.tag],
    operationId: meta.operationId,
    summary: meta.summary,
    description: meta.description,
    parameters: [...getQueryParams, idPathParam],
    responses: {
      '200': { description: 'Success', content: { 'application/json': { schema: singleEnvelope(meta.schemaRef) } } },
      '400': errorResponse400,
      '401': errorResponse401,
      '404': errorResponse404,
      '501': errorResponse501,
    },
  }
}

// Attach named whole-body `examples` to a single-GET operation's 200 response
// (sibling of `schema`). Used on the flagship Envelope resource.
function withSingleExamples<T>(op: T, examples: Record<string, unknown>): T {
  const responses = (op as { responses: Record<string, { content?: Record<string, Record<string, unknown>> }> }).responses
  const content = responses['200']?.content?.['application/json']
  if (content) content['examples'] = examples
  return op
}

// Flagship Envelope state examples — sent vs completed, sharing the Acme MSA /
// docusign story; only the status and lifecycle timestamps vary. Each is a full
// valid Envelope body wrapped in the single-resource envelope.
const envelopeBase = {
  id: 'env_1042',
  externalId: 'env_1042',
  subject: 'Master Services Agreement — Acme Industries',
  message: 'Please review and sign.',
  senderId: 'usr_olivia',
  senderEmail: 'olivia.admin@northwind.example',
  senderName: 'Olivia Admin',
  signingOrder: 'sequential',
  signerIds: ['signer_jane'],
  documentIds: ['doc_msa'],
  templateId: 'tmpl_msa',
  platform: 'docusign',
  metadata: { account: 'acme' },
  createdAt: '2026-01-15T09:30:00Z',
}
const envelopeStateExamples = {
  sent: {
    summary: 'Sent — awaiting signature',
    value: {
      data: {
        ...envelopeBase,
        status: 'sent',
        sentAt: '2026-01-15T09:30:00Z',
        updatedAt: '2026-01-15T09:30:00Z',
      },
    },
  },
  completed: {
    summary: 'Completed — all signers signed',
    value: {
      data: {
        ...envelopeBase,
        status: 'completed',
        sentAt: '2026-01-15T09:30:00Z',
        deliveredAt: '2026-01-15T09:30:00Z',
        completedAt: '2026-02-01T14:20:00Z',
        updatedAt: '2026-02-01T14:20:00Z',
      },
    },
  },
}

function actionOp(meta: OpMeta, bodySchemaRef?: string) {
  return {
    tags: [meta.tag],
    operationId: meta.operationId,
    summary: meta.summary,
    description: meta.description,
    parameters: [connectionIdParam, idPathParam],
    ...(bodySchemaRef
      ? {
          requestBody: {
            required: false,
            content: { 'application/json': { schema: { $ref: bodySchemaRef } } },
          },
        }
      : {}),
    responses: {
      '200': { description: 'Success', content: { 'application/json': { schema: singleEnvelope(meta.schemaRef) } } },
      '400': errorResponse400,
      '401': errorResponse401,
      '404': errorResponse404,
      '501': errorResponse501,
    },
  }
}

const componentSchemas: Record<string, unknown> = {}
for (const [name, value] of Object.entries(schemas)) {
  if (!isZodSchema(value)) continue
  componentSchemas[name] = toSchema(value, name)
}

componentSchemas.EnvelopeSchema = toSchema(EnvelopeSchema, 'EnvelopeSchema')
componentSchemas.SignerSchema = toSchema(SignerSchema, 'SignerSchema')
componentSchemas.DocumentSchema = toSchema(DocumentSchema, 'DocumentSchema')
componentSchemas.AuditTrailEntrySchema = toSchema(AuditTrailEntrySchema, 'AuditTrailEntrySchema')
componentSchemas.TemplateSchema = toSchema(TemplateSchema, 'TemplateSchema')

componentSchemas.VoidEnvelopeRequest = {
  type: 'object',
  properties: {
    reason: { type: 'string', description: 'Human-readable reason recorded on the audit trail.', example: 'Superseded by a new agreement.' },
  },
}

Object.assign(componentSchemas, buildSyncOpenapiSchemas())

const paths: Record<string, Record<string, unknown>> = {
  // ── Envelopes ────────────────────────────────────────────────────────────
  '/v1/envelopes': {
    get: listOp({
      tag: 'Envelopes',
      schemaRef: '#/components/schemas/EnvelopeSchema',
      operationId: 'listEnvelopes',
      summary: 'List envelopes',
      description: 'Returns signing-envelope records (subject, signer list, status, timestamps).',
    }),
  },
  '/v1/envelopes/{id}': {
    get: withSingleExamples(
      getOp({
        tag: 'Envelopes',
        schemaRef: '#/components/schemas/EnvelopeSchema',
        operationId: 'getEnvelope',
        summary: 'Get envelope',
        description: 'Fetches a single envelope by id.',
      }),
      envelopeStateExamples,
    ),
  },
  '/v1/envelopes/{id}/void': {
    post: actionOp(
      {
        tag: 'Envelopes',
        schemaRef: '#/components/schemas/EnvelopeSchema',
        operationId: 'voidEnvelope',
        summary: 'Void envelope',
        description: 'Voids an open envelope. Already-completed envelopes are immutable.',
      },
      '#/components/schemas/VoidEnvelopeRequest',
    ),
  },

  // ── Signers ──────────────────────────────────────────────────────────────
  '/v1/signers': {
    get: listOp(
      {
        tag: 'Signers',
        schemaRef: '#/components/schemas/SignerSchema',
        operationId: 'listSigners',
        summary: 'List signers for an envelope',
        description: 'Returns signers (recipients) on the given envelope.',
      },
      envelopeScopedListParams,
    ),
  },
  '/v1/signers/{id}': {
    get: getOp({
      tag: 'Signers',
      schemaRef: '#/components/schemas/SignerSchema',
      operationId: 'getSigner',
      summary: 'Get signer',
      description: 'Fetches a single signer by id.',
    }),
  },

  // ── Documents (metadata only) ────────────────────────────────────────────
  '/v1/documents': {
    get: listOp(
      {
        tag: 'Documents',
        schemaRef: '#/components/schemas/DocumentSchema',
        operationId: 'listDocuments',
        summary: 'List documents for an envelope (metadata only)',
        description:
          'Returns document metadata (filename, size, page count) for the given envelope. Document content is intentionally not exposed.',
      },
      envelopeScopedListParams,
    ),
  },
  '/v1/documents/{id}': {
    get: getOp({
      tag: 'Documents',
      schemaRef: '#/components/schemas/DocumentSchema',
      operationId: 'getDocument',
      summary: 'Get document (metadata only)',
      description: 'Fetches document metadata by id. Body content is not returned.',
    }),
  },

  // ── Audit-trail entries ──────────────────────────────────────────────────
  '/v1/audit_trail_entries': {
    get: listOp(
      {
        tag: 'AuditTrailEntries',
        schemaRef: '#/components/schemas/AuditTrailEntrySchema',
        operationId: 'listAuditTrailEntries',
        summary: 'List audit-trail entries for an envelope',
        description: 'Returns first-class audit-trail entries for the given envelope.',
      },
      envelopeScopedListParams,
    ),
  },
  '/v1/audit_trail_entries/{id}': {
    get: getOp({
      tag: 'AuditTrailEntries',
      schemaRef: '#/components/schemas/AuditTrailEntrySchema',
      operationId: 'getAuditTrailEntry',
      summary: 'Get audit-trail entry',
      description: 'Fetches a single audit-trail entry by id.',
    }),
  },

  // ── Templates ────────────────────────────────────────────────────────────
  '/v1/templates': {
    get: listOp({
      tag: 'Templates',
      schemaRef: '#/components/schemas/TemplateSchema',
      operationId: 'listTemplates',
      summary: 'List templates',
      description: 'Returns reusable envelope templates with signer roles and document counts.',
    }),
  },
  '/v1/templates/{id}': {
    get: getOp({
      tag: 'Templates',
      schemaRef: '#/components/schemas/TemplateSchema',
      operationId: 'getTemplate',
      summary: 'Get template',
      description: 'Fetches a single template by id.',
    }),
  },

  // ── Webhooks ────────────────────────────────────────────────────────────
  '/webhooks/{platform}': {
    post: {
      tags: ['Webhooks'],
      summary: 'Receive a platform webhook',
      operationId: 'receiveDocsignWebhook',
      description: 'Verifies the incoming webhook signature and emits a canonical docsign `WebhookEvent`.',
      parameters: [authPlatformParam],
      requestBody: {
        required: true,
        content: { 'application/json': { schema: { type: 'object', additionalProperties: true } } },
      },
      responses: {
        '200': { description: 'Webhook received and processed.' },
        '400': { $ref: '#/components/responses/BadRequest' },
        '401': { description: 'Invalid webhook signature.' },
      },
    },
  },

  '/health': {
    get: {
      tags: [],
      summary: 'Liveness probe',
      operationId: 'docsignHealth',
      responses: {
        '200': {
          description: 'Service is up',
          content: {
            'application/json': {
              schema: { type: 'object', properties: { status: { type: 'string', enum: ['ok'] } } },
            },
          },
        },
      },
    },
  },
}

export function buildSpec(): Record<string, unknown> {
  const openapi = {
    openapi: '3.1.0',
    info: {
      title: 'Docsign API',
      version: '0.1.0',
      license: { name: 'Elastic-2.0', url: 'https://github.com/open-steward/opensteward/blob/main/LICENSE' },
      description: `Unified REST API for document-signing platforms (DocuSign, Dropbox Sign, Adobe Acrobat Sign, PandaDoc, SignNow, Yousign).

## Read-only metadata

This vertical exposes envelope + signer + document-metadata + audit-trail + template surfaces. **Signed-document content, signature images, and KYC attachments are deliberately not exposed** — the canonical schema has no field for them, so a misconfigured adapter cannot leak them. Same firewall principle as the payments vertical's absent \`pan\` field.

## Authentication

Every \`/v1/*\` request must include the \`connection_id\` query parameter — a UUID returned by the OAuth callback.

## Response envelopes

- **List:** \`{ data: T[] }\`
- **Single:** \`{ data: T }\`

## Unsupported operations

Unimplemented adapter operations return \`501 Not Implemented\`. E-signature platforms diverge on capability — this is a first-class state, not a bug.
`,
    },
    servers: [
      { url: 'http://localhost:3010', description: 'Local (integration-server via docker compose)' },
    ],
    tags: [
      { name: 'Envelopes', description: 'Signing envelopes — list, get, void.' },
      { name: 'Signers', description: 'Recipients (signers, cc, witnesses) on an envelope.' },
      { name: 'Documents', description: 'Document metadata only. No content body returned.' },
      { name: 'AuditTrailEntries', description: 'First-class audit-trail entries per envelope.' },
      { name: 'Templates', description: 'Reusable envelope templates.' },
      { name: 'Auth', description: 'OAuth 2.0 flows — connect, callback, revoke.' },
      { name: 'Sync', description: 'Background full-sync job management at `/v1/docsign/sync`.' },
      { name: 'Webhooks', description: 'Inbound platform webhook normalisation.' },
    ],
    paths,
    components: {
      schemas: componentSchemas,
      responses: {
        BadRequest: {
          description: 'Bad Request — missing or invalid parameters.',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
        },
        Unauthorized: {
          description: 'Unauthorized — missing or invalid credentials.',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
        },
        Forbidden: {
          description: 'Forbidden — missing or invalid X-Admin-Secret.',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
        },
        NotFound: {
          description: 'Not Found — resource does not exist on this platform.',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
        },
        NotImplemented: {
          description:
            'Not Implemented — this adapter does not expose this operation. Returned with `code: "NOT_IMPLEMENTED"`.',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['error'],
                properties: {
                  error: { type: 'string' },
                  code: { type: 'string', enum: ['NOT_IMPLEMENTED'] },
                },
              },
            },
          },
        },
      },
    },
  }

  return openapi
}
