/**
 * Builds the customer-support-vertical OpenAPI document.
 */
import fs from 'node:fs'
import path from 'node:path'
import { z } from 'zod'

import * as schemas from './schema'
import { buildSyncOpenapiSchemas } from '@opensteward/shared'
import { TicketSchema } from './schema/ticket'
import { MessageSchema } from './schema/message'
import { ContactSchema } from './schema/contact'
import { UserSchema } from './schema/user'
import { TagSchema } from './schema/tag'
import { TeamSchema } from './schema/team'
import { MacroSchema } from './schema/macro'

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
  description: 'Platform slug (e.g. `zendesk`, `intercom`, `freshdesk`).',
  schema: { type: 'string', enum: PLATFORM_SLUGS },
}

const connectionIdParam = {
  name: 'connection_id',
  in: 'query',
  required: true,
  description: 'UUID of the stored connection to use.',
  schema: { type: 'string', format: 'uuid' },
}

const ticketIdQueryParam = {
  name: 'ticket_id',
  in: 'query',
  required: true,
  description: 'Ticket id to scope the list under (required for messages).',
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

const idPathParam = {
  name: 'id',
  in: 'path',
  required: true,
  schema: { type: 'string' },
}

const baseListQueryParams = [connectionIdParam, limitParam, pageParam, cursorParam]
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

function listOp(meta: OpMeta, params: object[] = baseListQueryParams) {
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
// (sibling of `schema`). Used on the flagship Ticket resource.
function withSingleExamples<T>(op: T, examples: Record<string, unknown>): T {
  const responses = (op as { responses: Record<string, { content?: Record<string, Record<string, unknown>> }> }).responses
  const content = responses['200']?.content?.['application/json']
  if (content) content['examples'] = examples
  return op
}

// Flagship Ticket state examples — open vs solved, sharing the Acme / Jane Doe
// / zendesk story; only the status and resolution timestamps vary. Each is a
// full valid Ticket body wrapped in the single-resource envelope.
const ticketBase = {
  id: 'tkt_1042',
  externalId: 'tkt_1042',
  number: '1042',
  subject: 'Unable to log in',
  priority: 'high',
  channel: 'email',
  requesterId: 'cnt_jane',
  assigneeId: 'usr_olivia',
  teamId: 'team_support',
  tagIds: ['tag_login'],
  platform: 'zendesk',
  metadata: { brand: 'acme' },
  createdAt: '2026-01-15T09:30:00Z',
}
const ticketStateExamples = {
  open: {
    summary: 'Open — awaiting agent action',
    value: {
      data: { ...ticketBase, status: 'open', updatedAt: '2026-02-01T14:20:00Z' },
    },
  },
  solved: {
    summary: 'Solved — resolved with a satisfaction rating',
    value: {
      data: {
        ...ticketBase,
        status: 'resolved',
        satisfactionRating: 5,
        updatedAt: '2026-02-01T14:20:00Z',
        resolvedAt: '2026-02-01T14:20:00Z',
      },
    },
  },
}

const componentSchemas: Record<string, unknown> = {}
for (const [name, value] of Object.entries(schemas)) {
  if (!isZodSchema(value)) continue
  componentSchemas[name] = toSchema(value, name)
}
componentSchemas.TicketSchema = toSchema(TicketSchema, 'TicketSchema')
componentSchemas.MessageSchema = toSchema(MessageSchema, 'MessageSchema')
componentSchemas.ContactSchema = toSchema(ContactSchema, 'ContactSchema')
componentSchemas.UserSchema = toSchema(UserSchema, 'UserSchema')
componentSchemas.TagSchema = toSchema(TagSchema, 'TagSchema')
componentSchemas.TeamSchema = toSchema(TeamSchema, 'TeamSchema')
componentSchemas.MacroSchema = toSchema(MacroSchema, 'MacroSchema')

Object.assign(componentSchemas, buildSyncOpenapiSchemas())

const paths: Record<string, Record<string, unknown>> = {
  '/v1/tickets': {
    get: listOp({
      tag: 'Tickets',
      schemaRef: '#/components/schemas/TicketSchema',
      operationId: 'listTickets',
      summary: 'List tickets',
      description: 'Returns tickets visible to the connection. Schema-firewall: no attachment content, no voice recordings.',
    }),
  },
  '/v1/tickets/{id}': {
    get: withSingleExamples(
      getOp({
        tag: 'Tickets',
        schemaRef: '#/components/schemas/TicketSchema',
        operationId: 'getTicket',
        summary: 'Get ticket',
        description: 'Fetches a single ticket by id.',
      }),
      ticketStateExamples,
    ),
  },
  '/v1/messages': {
    get: listOp(
      {
        tag: 'Messages',
        schemaRef: '#/components/schemas/MessageSchema',
        operationId: 'listMessages',
        summary: 'List messages for a ticket',
        description: 'Returns messages under the given ticket. Body text included verbatim. Internal-note PII redaction is the operator\'s responsibility at consume-time.',
      },
      [connectionIdParam, ticketIdQueryParam, limitParam, pageParam, cursorParam],
    ),
  },
  '/v1/messages/{id}': {
    get: getOp({
      tag: 'Messages',
      schemaRef: '#/components/schemas/MessageSchema',
      operationId: 'getMessage',
      summary: 'Get message',
      description: 'Fetches a single message by id.',
    }),
  },
  '/v1/contacts': {
    get: listOp({
      tag: 'Contacts',
      schemaRef: '#/components/schemas/ContactSchema',
      operationId: 'listContacts',
      summary: 'List contacts',
      description: 'Returns contacts. PII-minimal (name + email + phone only).',
    }),
  },
  '/v1/contacts/{id}': {
    get: getOp({
      tag: 'Contacts',
      schemaRef: '#/components/schemas/ContactSchema',
      operationId: 'getContact',
      summary: 'Get contact',
      description: 'Fetches a single contact by id.',
    }),
  },
  '/v1/users': {
    get: listOp({
      tag: 'Users',
      schemaRef: '#/components/schemas/UserSchema',
      operationId: 'listUsers',
      summary: 'List agents',
      description: 'Returns support agents.',
    }),
  },
  '/v1/users/{id}': {
    get: getOp({
      tag: 'Users',
      schemaRef: '#/components/schemas/UserSchema',
      operationId: 'getUser',
      summary: 'Get agent',
      description: 'Fetches a single agent by id.',
    }),
  },
  '/v1/tags': {
    get: listOp({
      tag: 'Tags',
      schemaRef: '#/components/schemas/TagSchema',
      operationId: 'listTags',
      summary: 'List tags',
      description: 'Returns tags (ticket taxonomy).',
    }),
  },
  '/v1/tags/{id}': {
    get: getOp({
      tag: 'Tags',
      schemaRef: '#/components/schemas/TagSchema',
      operationId: 'getTag',
      summary: 'Get tag',
      description: 'Fetches a single tag by id.',
    }),
  },
  '/v1/teams': {
    get: listOp({
      tag: 'Teams',
      schemaRef: '#/components/schemas/TeamSchema',
      operationId: 'listTeams',
      summary: 'List agent teams',
      description: 'Returns agent groups / teams.',
    }),
  },
  '/v1/teams/{id}': {
    get: getOp({
      tag: 'Teams',
      schemaRef: '#/components/schemas/TeamSchema',
      operationId: 'getTeam',
      summary: 'Get team',
      description: 'Fetches a single team by id.',
    }),
  },
  '/v1/macros': {
    get: listOp({
      tag: 'Macros',
      schemaRef: '#/components/schemas/MacroSchema',
      operationId: 'listMacros',
      summary: 'List macros (canned responses)',
      description: 'Returns canned-response templates. Platforms without this surface return [].',
    }),
  },
  '/v1/macros/{id}': {
    get: getOp({
      tag: 'Macros',
      schemaRef: '#/components/schemas/MacroSchema',
      operationId: 'getMacro',
      summary: 'Get macro',
      description: 'Fetches a single macro by id.',
    }),
  },
  '/webhooks/{platform}': {
    post: {
      tags: ['Webhooks'],
      summary: 'Receive a platform webhook',
      operationId: 'receiveSupportWebhook',
      description: 'Verifies the incoming webhook signature and emits canonical `WebhookEvent`s.',
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
      operationId: 'supportHealth',
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
      title: 'Customer Support API',
      version: '0.1.0',
      license: { name: 'Elastic-2.0', url: 'https://github.com/open-steward/opensteward/blob/main/LICENSE' },
      description: `Unified REST API for customer-support / helpdesk platforms (Zendesk, Intercom, Freshdesk, Help Scout, Front, Salesforce Service Cloud, Zoho Desk, Gorgias, Kustomer, Gladly, Drift, Crisp, LiveChat, Hiver, Tidio, Re:amaze, HappyFox, GrooveHQ, HelpCrunch, Chatwoot, Customerly, Trengo, Gist, Mojo Helpdesk).

## Refused at the schema level

- **Attachment content (bytes)** — surface \`attachmentCount\` only. Future \`files\` vertical.
- **Voice / call recording audio + transcripts** — refused. Future \`voice\` vertical.
- **AI-generated summaries / suggested replies** — operator brings own model.
- **Contact PII beyond email + name + phone**.
- **Satisfaction-survey free-text** — only normalised numeric rating surfaced.

## Internal-note posture

Messages of \`type: 'internal'\` pass through body text as-is. Operators are responsible for downstream PII redaction — adapter does no automatic redaction (same posture as docsign audit-trail descriptions).

## Authentication

Every \`/v1/*\` request must include \`connection_id\` query parameter. Per-tenant subdomain platforms (Zendesk, Freshdesk, Gorgias) require an additional \`tenantSubdomain\` field at connection creation.

## Response envelopes

- **List:** \`{ data: T[] }\`
- **Single:** \`{ data: T }\`

## Unsupported operations

Unimplemented adapter operations return \`501 Not Implemented\`.
`,
    },
    servers: [
      { url: 'http://localhost:3010', description: 'Local (integration-server via docker compose)' },
    ],
    tags: [
      { name: 'Tickets', description: 'Tickets / conversations / cases.' },
      { name: 'Messages', description: 'Body text inside a ticket. Public reply or internal note.' },
      { name: 'Contacts', description: 'Customer identity. PII-minimal.' },
      { name: 'Users', description: 'Agent identity.' },
      { name: 'Tags', description: 'Taxonomy.' },
      { name: 'Teams', description: 'Agent groups.' },
      { name: 'Macros', description: 'Canned-response templates.' },
      { name: 'Auth', description: 'OAuth 2.0 flows.' },
      { name: 'Sync', description: 'Background full-sync job management at `/v1/customer-support/sync`.' },
      { name: 'Webhooks', description: 'Inbound platform webhook normalisation.' },
    ],
    paths,
    components: {
      schemas: componentSchemas,
      responses: {
        BadRequest: { description: 'Bad Request.', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        Unauthorized: { description: 'Unauthorized.', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        Forbidden: { description: 'Forbidden.', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        NotFound: { description: 'Not Found.', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        NotImplemented: { description: 'Not Implemented.', content: { 'application/json': { schema: { type: 'object', required: ['error'], properties: { error: { type: 'string' }, code: { type: 'string', enum: ['NOT_IMPLEMENTED'] } } } } } },
      },
    },
  }
  return openapi
}
