/**
 * Builds the accounting-vertical OpenAPI document. Imported by the
 * unified generator at apps/integration-server/scripts/generate-openapi.ts.
 */

import fs from 'node:fs'
import path from 'node:path'
import { z } from 'zod'
import { buildSyncOpenapiSchemas } from '@opensteward/shared'

import { AccountSchema } from './schema/account'
import { BillSchema } from './schema/bill'
import { ContactSchema } from './schema/contact'
import { CreditMemoSchema } from './schema/creditmemo'
import { QuoteSchema } from './schema/quote'
import { ExpenseSchema } from './schema/expense'
import { InvoiceSchema } from './schema/invoice'
import { JournalSchema } from './schema/journal'
import { OrderSchema } from './schema/order'
import { OrganizationSchema } from './schema/organization'
import { PurchaseOrderSchema } from './schema/purchaseorder'
import { SalesOrderSchema } from './schema/salesorder'
import { TaxRateSchema } from './schema/taxrate'
import { TransactionSchema } from './schema/transaction'
import { WebhookEventSchema } from './schema/webhook'

// ── helpers ──────────────────────────────────────────────────────────────────

// Zod 4 native JSON-Schema export. Spec is OpenAPI 3.1, which uses its own
// dialect that is compatible with JSON Schema draft-2020-12. Strip `$schema`
// since the parent document uses the OAS dialect by default.
function toSchema(zodSchema: z.ZodType, _name: string): Record<string, unknown> {
  const json = z.toJSONSchema(zodSchema, {
    unrepresentable: 'any',
    override: (ctx) => {
      // z.date() has no JSON representation — emit `string` w/ `date-time`
      // format so SDKs and Swagger UI render it sensibly.
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

// ── shared parameter objects ──────────────────────────────────────────────────

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
    description: 'Set to `true` to bypass the local DB cache and fetch fresh data from the upstream platform. The fresh result is still written back to the cache (live skips reads, not writes). No-op in `passthrough` mode.',
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

// Named whole-body example for an empty list page — the populated case is
// already composed from the resource schema's field examples, so we only add
// the `empty` scenario here (matches the ListMeta shape: totalCount 0,
// page 1, limit 50, hasMore false).
const emptyListExamples = {
  empty: {
    summary: 'No records match — empty first page',
    value: {
      data: [],
      meta: {
        platform: 'xero',
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
    security: [{ ApiKeyAuth: [] }],
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
    security: [{ ApiKeyAuth: [] }],
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

// Attach named whole-body `examples` to a `singleGet`/single-GET operation's
// 200 response (sibling of `schema`). Used on flagship resources to show 2–3
// realistic state variants without touching any schema field `example`.
function withSingleExamples<T>(op: T, examples: Record<string, unknown>): T {
  const responses = (op as { responses: Record<string, { content?: Record<string, Record<string, unknown>> }> }).responses
  const content = responses['200']?.content?.['application/json']
  if (content) content['examples'] = examples
  return op
}

// Flagship Invoice state examples — three lifecycle states sharing the Acme /
// Jane Doe / xero story; only status / amounts / dates vary. Each is a full
// valid Invoice body wrapped in the single-resource envelope.
const invoiceSingleMeta = { platform: 'xero', fetchedAt: '2026-02-01T14:20:00Z' }
const invoiceBase = {
  id: 'inv_1042',
  type: 'INVOICE',
  invoiceNumber: 'INV-1042',
  contactId: 'cus_4Qm2Xa9Lr',
  currency: 'USD',
  totalAmount: 125000,
  taxAmount: 10000,
  discountAmount: 0,
  reference: 'PO-ACME-2026',
  notes: 'Thank you for your business, Acme Industries.',
  url: 'https://app.acme.example/invoices/INV-1042',
  postedAt: '2026-02-01T00:00:00Z',
  createdAt: '2026-01-15T09:30:00Z',
  updatedAt: '2026-02-01T14:20:00Z',
}
const invoiceStateExamples = {
  paid: {
    summary: 'Paid in full — balance zero',
    value: {
      data: {
        ...invoiceBase,
        status: 'PAID',
        paidAmount: 125000,
        balanceAmount: 0,
        refundAmount: 0,
        dueAt: '2026-03-03T00:00:00Z',
        paidAt: '2026-02-20T00:00:00Z',
      },
      meta: invoiceSingleMeta,
    },
  },
  overdue: {
    summary: 'Overdue — unpaid past the due date',
    value: {
      data: {
        ...invoiceBase,
        status: 'OVERDUE',
        paidAmount: 0,
        balanceAmount: 125000,
        refundAmount: 0,
        dueAt: '2026-03-03T00:00:00Z',
      },
      meta: invoiceSingleMeta,
    },
  },
  draft: {
    summary: 'Draft — not yet issued to the customer',
    value: {
      data: {
        ...invoiceBase,
        status: 'DRAFT',
        paidAmount: 0,
        balanceAmount: 125000,
        refundAmount: 0,
      },
      meta: invoiceSingleMeta,
    },
  },
}

function createPost(tag: string, schemaRef: string, summary: string) {
  return {
    tags: [tag],
    summary,
    security: [{ ApiKeyAuth: [] }],
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

function updatePut(tag: string, schemaRef: string, summary: string) {
  return {
    tags: [tag],
    summary,
    security: [{ ApiKeyAuth: [] }],
    parameters: [idParam, ...getQueryParams],
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
    security: [{ ApiKeyAuth: [] }],
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

// ── provider schema ───────────────────────────────────────────────────────────

const providerSchema = {
  type: 'object',
  properties: {
    slug: { type: 'string', description: 'Unique adapter identifier', example: 'xero' },
    name: { type: 'string', example: 'Xero' },
    description: { type: 'string', example: 'Cloud accounting for small business.' },
    website: { type: 'string', format: 'uri', example: 'https://www.xero.com' },
    category: {
      type: 'string',
      enum: ['accounting', 'erp', 'bookkeeping'],
      example: 'accounting',
    },
    primary_color: { $ref: '#/components/schemas/HexColor' },
    auth_type: {
      type: 'string',
      enum: ['oauth2', 'oauth2_cc', 'api_key', 'session', 'local'],
      example: 'oauth2',
    },
    hq_country: { $ref: '#/components/schemas/ISO3166' },
    docs_url: { type: 'string', format: 'uri', example: 'https://developer.xero.com' },
    pricing_url: { type: 'string', format: 'uri', example: 'https://www.xero.com/pricing' },
    founded_year: { type: 'integer', example: 2006 },
    logo: {
      description: 'Base64-encoded SVG logo, or null if not yet added',
      oneOf: [{ type: 'string' }, { type: 'null' }],
    },
  },
}

// ── build the document ────────────────────────────────────────────────────────

export function buildSpec(): Record<string, unknown> {
  const doc = {
  openapi: '3.1.0',

  info: {
    title: 'Open Accounting Integration',
    version: (JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../../package.json'), 'utf8')) as { version: string }).version,
    license: { name: 'Elastic-2.0', url: 'https://github.com/open-steward/opensteward/blob/main/LICENSE' },
    contact: {
      name: 'Open Accounting Integration',
      url: 'https://github.com/open-steward/opensteward',
    },
    description: `Self-hosted accounting aggregation service that maps any accounting platform's
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
    { name: 'providers', description: 'Static metadata about enabled accounting platforms.' },
    { name: 'organizations', description: 'Authenticated tenant organisation profile. Read-only.' },
    { name: 'invoices', description: 'Customer invoices (accounts receivable). Full CRUD.' },
    { name: 'bills', description: 'Supplier bills (accounts payable). Full CRUD.' },
    { name: 'contacts', description: 'Customers and suppliers. Full CRUD.' },
    { name: 'accounts', description: 'Chart-of-accounts general ledger accounts. Read-only.' },
    { name: 'journals', description: 'General ledger journal batches. List, get, create.' },
    { name: 'transactions', description: 'Bank/payment transactions. Read-only.' },
    { name: 'taxrates', description: 'Tax rates. Read-only.' },
    { name: 'expenses', description: 'Employee expenses. List, get, create.' },
    { name: 'creditmemos', description: 'Credit notes. List, get, create.' },
    { name: 'quotes', description: 'Quotes / estimates — a priced offer made before any obligation exists. List and get; read-only. Not an invoice: nothing is owed until a quote is accepted and converted, so there is no paid, balance or due-date arithmetic on this resource.' },
    { name: 'orders', description: 'Generic orders — the union view across a platform\'s order-like documents. List, get, create. **On platforms that model no separate sales order (Fortnox), `orders` and `salesorders` read the SAME upstream resource** and will return the same records; `orders` adds a `type` discriminator. Do not sum both, or you will double-count. **Xero has no sales-order entity at all** — `salesorders` is not implemented there, and `orders` instead reads the same upstream resource as `purchaseorders`, tagged `type: PURCHASE`.' },
    { name: 'salesorders', description: 'Sales orders. List, get, create. See the note on `orders`: where a platform has no distinct sales-order entity, this is a projection of the same upstream documents rather than a separate set. `purchaseorders` is always distinct.' },
    { name: 'purchaseorders', description: 'Purchase orders. List, get, create. Always a distinct upstream resource, unlike the orders/salesorders pair.' },
    { name: 'Sync', description: 'Background full-sync job management at `/v1/accounting/sync`. Auth: tenant-scoped Bearer key with `vertical:accounting` scope. Routes are mounted only when `dataStore.mode != passthrough`.' },
  ],

  paths: {
    // Auth routes (/auth/{vertical}/{platform}/{connect, callback, {connectionId}})
    // are documented exactly once in the unified spec under the `Auth` tag —
    // see control-plane-spec.ts. The `{vertical}` path parameter handles all
    // four verticals; per-vertical duplicates would just bloat Swagger UI.

    // Platforms are documented in the unified spec (control-plane-spec.ts):
    //   - GET /v1/platforms          — flat catalog (filterable by ?vertical=)
    //   - GET /v1/platforms/{vertical}/{slug}
    // No per-vertical handler exists on the backend; entries here would be ghosts.

    // ── Organizations ────────────────────────────────────────────────────────
    '/v1/organizations': {
      get: {
        tags: ['organizations'],
        summary: 'Get organisation',
        security: [{ ApiKeyAuth: [] }],
        parameters: [connectionIdParam],
        responses: {
          '200': {
            description: 'Success',
            content: {
              'application/json': { schema: singleEnvelope('#/components/schemas/Organization') },
            },
          },
          '400': { $ref: '#/components/responses/BadRequest' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '501': { $ref: '#/components/responses/NotImplemented' },
        },
      },
    },

    // ── Invoices ─────────────────────────────────────────────────────────────
    '/v1/invoices': {
      get: listGet('invoices', '#/components/schemas/Invoice', 'List invoices'),
      post: createPost('invoices', '#/components/schemas/Invoice', 'Create invoice'),
    },
    '/v1/invoices/{id}': {
      get: withSingleExamples(
        singleGet('invoices', '#/components/schemas/Invoice', 'Get invoice'),
        invoiceStateExamples,
      ),
      put: updatePut('invoices', '#/components/schemas/Invoice', 'Update invoice'),
      delete: deleteOp('invoices', 'Delete invoice'),
    },

    // ── Bills ────────────────────────────────────────────────────────────────
    '/v1/bills': {
      get: listGet('bills', '#/components/schemas/Bill', 'List bills'),
      post: createPost('bills', '#/components/schemas/Bill', 'Create bill'),
    },
    '/v1/bills/{id}': {
      get: singleGet('bills', '#/components/schemas/Bill', 'Get bill'),
      put: updatePut('bills', '#/components/schemas/Bill', 'Update bill'),
      delete: deleteOp('bills', 'Delete bill'),
    },

    // ── Contacts ─────────────────────────────────────────────────────────────
    '/v1/contacts': {
      get: listGet('contacts', '#/components/schemas/Contact', 'List contacts'),
      post: createPost('contacts', '#/components/schemas/Contact', 'Create contact'),
    },
    '/v1/contacts/{id}': {
      get: singleGet('contacts', '#/components/schemas/Contact', 'Get contact'),
      put: updatePut('contacts', '#/components/schemas/Contact', 'Update contact'),
      delete: deleteOp('contacts', 'Delete contact'),
    },

    // ── Accounts ─────────────────────────────────────────────────────────────
    '/v1/accounts': {
      get: listGet('accounts', '#/components/schemas/Account', 'List accounts'),
    },
    '/v1/accounts/{id}': {
      get: singleGet('accounts', '#/components/schemas/Account', 'Get account'),
    },

    // ── Journals ─────────────────────────────────────────────────────────────
    '/v1/journals': {
      get: listGet('journals', '#/components/schemas/Journal', 'List journals'),
      post: createPost('journals', '#/components/schemas/Journal', 'Create journal'),
    },
    '/v1/journals/{id}': {
      get: singleGet('journals', '#/components/schemas/Journal', 'Get journal'),
    },

    // ── Transactions ─────────────────────────────────────────────────────────
    '/v1/transactions': {
      get: listGet('transactions', '#/components/schemas/Transaction', 'List transactions'),
    },
    '/v1/transactions/{id}': {
      get: singleGet('transactions', '#/components/schemas/Transaction', 'Get transaction'),
    },

    // ── Tax Rates ────────────────────────────────────────────────────────────
    '/v1/taxrates': {
      get: listGet('taxrates', '#/components/schemas/TaxRate', 'List tax rates'),
    },
    '/v1/taxrates/{id}': {
      get: singleGet('taxrates', '#/components/schemas/TaxRate', 'Get tax rate'),
    },

    // ── Expenses ─────────────────────────────────────────────────────────────
    '/v1/expenses': {
      get: listGet('expenses', '#/components/schemas/Expense', 'List expenses'),
      post: createPost('expenses', '#/components/schemas/Expense', 'Create expense'),
    },
    '/v1/expenses/{id}': {
      get: singleGet('expenses', '#/components/schemas/Expense', 'Get expense'),
    },

    // ── Credit Memos ─────────────────────────────────────────────────────────
    '/v1/creditmemos': {
      get: listGet('creditmemos', '#/components/schemas/CreditMemo', 'List credit memos'),
      post: createPost('creditmemos', '#/components/schemas/CreditMemo', 'Create credit memo'),
    },
    '/v1/quotes': {
      get: listGet('quotes', '#/components/schemas/Quote', 'List quotes'),
    },
    '/v1/quotes/{id}': {
      get: singleGet('quotes', '#/components/schemas/Quote', 'Get quote'),
    },
    '/v1/creditmemos/{id}': {
      get: singleGet('creditmemos', '#/components/schemas/CreditMemo', 'Get credit memo'),
    },

    // ── Orders ───────────────────────────────────────────────────────────────
    '/v1/orders': {
      get: listGet('orders', '#/components/schemas/Order', 'List orders'),
      post: createPost('orders', '#/components/schemas/Order', 'Create order'),
    },
    '/v1/orders/{id}': {
      get: singleGet('orders', '#/components/schemas/Order', 'Get order'),
    },

    // ── Sales Orders ─────────────────────────────────────────────────────────
    '/v1/salesorders': {
      get: listGet('salesorders', '#/components/schemas/SalesOrder', 'List sales orders'),
      post: createPost('salesorders', '#/components/schemas/SalesOrder', 'Create sales order'),
    },
    '/v1/salesorders/{id}': {
      get: singleGet('salesorders', '#/components/schemas/SalesOrder', 'Get sales order'),
    },

    // ── Purchase Orders ───────────────────────────────────────────────────────
    '/v1/purchaseorders': {
      get: listGet('purchaseorders', '#/components/schemas/PurchaseOrder', 'List purchase orders'),
      post: createPost(
        'purchaseorders',
        '#/components/schemas/PurchaseOrder',
        'Create purchase order',
      ),
    },
    '/v1/purchaseorders/{id}': {
      get: singleGet(
        'purchaseorders',
        '#/components/schemas/PurchaseOrder',
        'Get purchase order',
      ),
    },

    // Sync paths live in the unified spec (control-plane-spec.ts) under one
    // `/v1/{vertical}/sync` entry that covers all four verticals.

    // ── Connections ───────────────────────────────────────────────────────────
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
        summary: 'Get connection',
        security: [{ AdminSecret: [] }],
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            description: 'Connection ID — `platform` for single-tenant, `platform:tenantId` for multi-tenant.',
            schema: { type: 'string' },
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
          {
            name: 'id',
            in: 'path',
            required: true,
            schema: { type: 'string' },
          },
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
        description: `Verifies the incoming webhook signature and parses the raw payload into
canonical \`WebhookEvent\` objects. Optionally forwards normalised events to the
configured \`callbackUrl\`.

Supported platforms: \`fortnox\`, \`freeagent\`, \`freshbooks\`, \`moneybird\`, \`quickbooks\`, \`xero\`, \`zohobooks\`.`,
        security: [],
        parameters: [
          {
            name: 'platform',
            in: 'path',
            required: true,
            description: 'Adapter slug (e.g. `xero`, `quickbooks`).',
            schema: { type: 'string', enum: ['fortnox', 'freeagent', 'freshbooks', 'moneybird', 'quickbooks', 'xero', 'zohobooks'] },
          },
        ],
        requestBody: {
          description: 'Raw platform webhook payload (JSON body with platform-specific signature headers).',
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
    // securitySchemes are owned by `control-plane-spec.ts` so the merged
    // unified spec exposes exactly two: ApiKeyAuth (Bearer dev key) and
    // AdminSecret (X-Admin-Secret header). Per-vertical specs reference
    // those scheme names in their `security: []` blocks and do not
    // redefine them here.

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
        description:
          'Not Implemented — this adapter has not implemented this operation.',
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
      ...buildSyncOpenapiSchemas(),
      WebhookEvent: toSchema(WebhookEventSchema, 'WebhookEvent'),
      Provider: providerSchema,
      Account: toSchema(AccountSchema, 'Account'),
      Bill: toSchema(BillSchema, 'Bill'),
      Contact: toSchema(ContactSchema, 'Contact'),
      CreditMemo: toSchema(CreditMemoSchema, 'CreditMemo'),
      Quote: toSchema(QuoteSchema, 'Quote'),
      Expense: toSchema(ExpenseSchema, 'Expense'),
      Invoice: toSchema(InvoiceSchema, 'Invoice'),
      Journal: toSchema(JournalSchema, 'Journal'),
      Order: toSchema(OrderSchema, 'Order'),
      Organization: toSchema(OrganizationSchema, 'Organization'),
      PurchaseOrder: toSchema(PurchaseOrderSchema, 'PurchaseOrder'),
      SalesOrder: toSchema(SalesOrderSchema, 'SalesOrder'),
      TaxRate: toSchema(TaxRateSchema, 'TaxRate'),
      Transaction: toSchema(TransactionSchema, 'Transaction'),
    },
  },
}

  return doc
}
