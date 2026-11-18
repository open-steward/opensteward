/**
 * Builds the ecommerce-vertical OpenAPI document. Imported by the unified
 * generator at apps/integration-server/scripts/generate-openapi.ts.
 *
 * Walks `./schema/index.ts` for `components.schemas` and emits a
 * hand-maintained `paths` block covering every resource router in
 * `./router/`. Keep the path entries in sync — any new route must be
 * mirrored here or it stays invisible to Swagger UI + Postman.
 */

import fs from 'node:fs'
import path from 'node:path'
import { z } from 'zod'

import * as schemas from './schema'
import { buildSyncOpenapiSchemas } from '@opensteward/shared'
import { CollectionSchema } from './schema/collection'
import { CustomerSchema } from './schema/customer'
import { DiscountSchema } from './schema/discount'
import { FulfillmentSchema } from './schema/fulfillment'
import { InventoryLevelSchema } from './schema/inventory'
import { LocationSchema } from './schema/location'
import { OrderSchema } from './schema/order'
import { ProductSchema, ProductVariantSchema } from './schema/product'
import { RefundSchema } from './schema/refund'
import { TransactionSchema } from './schema/transaction'

// ── helpers ──────────────────────────────────────────────────────────────────

function isZodSchema(v: unknown): v is z.ZodType {
  return typeof v === 'object' && v !== null && '_def' in (v as Record<string, unknown>)
}

// Zod 4 native JSON-Schema export. The default target (draft-2020-12) is
// compatible with the OpenAPI 3.1 schema dialect, so nullable fields emit as
// `anyOf [..., {type: "null"}]` rather than the legacy 3.0 `nullable: true`.
// The override maps `z.date()` to a string + date-time format because Zod
// refuses to JSON-serialize native Date.
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

// ── shared parameter objects ─────────────────────────────────────────────────

// Discover every adapter slug the service ships with. Drives the `platform`
// path-param enum on auth + webhook endpoints so Swagger UI offers a typed
// dropdown instead of a free-text field.
const ADAPTERS_DIR = path.resolve(__dirname, './adapters')
const PLATFORM_SLUGS = fs.readdirSync(ADAPTERS_DIR, { withFileTypes: true })
  .filter((e) => e.isDirectory())
  .map((e) => e.name)
  .sort()

const authPlatformParam = {
  name: 'platform',
  in: 'path',
  required: true,
  description: 'Platform slug (e.g. `shopify`, `woocommerce`, `bigcommerce`).',
  schema: { type: 'string', enum: PLATFORM_SLUGS },
}

// Connection-resolution param shared by every authenticated /v1/* operation.
// The connection row carries its own `platform` and `tenant`, so
// `connection_id` alone fully disambiguates the request — no `X-Provider`,
// no `?platform=`, no `?tenant=`.
const connectionIdParam = {
  name: 'connection_id',
  in: 'query',
  required: true,
  description:
    'UUID of the stored connection to use. Returned by the OAuth callback (`GET /auth/{platform}/callback`) — store it against your end-user record and pass it on every request.',
  schema: { type: 'string', format: 'uuid' },
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
  description:
    'Only return records modified after this ISO 8601 timestamp. Useful for incremental sync.',
  schema: { type: 'string', format: 'date-time' },
}

const idPathParam = {
  name: 'id',
  in: 'path',
  required: true,
  description: 'Platform-specific resource ID.',
  schema: { type: 'string' },
}

const listQueryParams = [
  connectionIdParam,
  limitParam,
  pageParam,
  cursorParam,
  updatedAfterParam,
]

const getQueryParams = [connectionIdParam]

// ── shared response objects ──────────────────────────────────────────────────

const errorResponse400 = { $ref: '#/components/responses/BadRequest' }
const errorResponse401 = { $ref: '#/components/responses/Unauthorized' }
const errorResponse404 = { $ref: '#/components/responses/NotFound' }
const errorResponse501 = { $ref: '#/components/responses/NotImplemented' }

// ── envelope builders (matches router handlers: `{ data }`) ──────────────────

function listEnvelope(schemaRef: string) {
  return {
    type: 'object',
    required: ['data'],
    properties: {
      data: { type: 'array', items: { $ref: schemaRef } },
    },
  }
}

function singleEnvelope(schemaRef: string) {
  return {
    type: 'object',
    required: ['data'],
    properties: {
      data: { $ref: schemaRef },
    },
  }
}

// ── operation builders ───────────────────────────────────────────────────────

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

function listOp(meta: OpMeta) {
  return {
    tags: [meta.tag],
    operationId: meta.operationId,
    summary: meta.summary,
    description: meta.description,
    parameters: listQueryParams,
    responses: {
      '200': {
        description: 'Success',
        content: { 'application/json': { schema: listEnvelope(meta.schemaRef), examples: emptyListExamples } },
      },
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
      '200': {
        description: 'Success',
        content: { 'application/json': { schema: singleEnvelope(meta.schemaRef) } },
      },
      '400': errorResponse400,
      '401': errorResponse401,
      '404': errorResponse404,
      '501': errorResponse501,
    },
  }
}

// Attach named whole-body `examples` to a single-GET operation's 200 response
// (sibling of `schema`). Used on the flagship Order resource.
function withSingleExamples<T>(op: T, examples: Record<string, unknown>): T {
  const responses = (op as { responses: Record<string, { content?: Record<string, Record<string, unknown>> }> }).responses
  const content = responses['200']?.content?.['application/json']
  if (content) content['examples'] = examples
  return op
}

// Flagship Order state examples — fulfilled vs cancelled, sharing the Acme /
// Jane Doe / shopify story; only the status fields, timestamps, and id arrays
// vary. Each is a full valid Order body wrapped in the single-resource envelope.
const orderBase = {
  id: 'ord_1042',
  orderNumber: '#1042',
  name: '#1042',
  customerId: 'cus_4Qm2Xa9Lr',
  email: 'jane.doe@acme.example',
  phone: '+14155550123',
  currency: 'USD',
  subtotalPrice: { amount: 7999, currency: 'USD' },
  totalTax: { amount: 700, currency: 'USD' },
  totalDiscounts: { amount: 800, currency: 'USD' },
  totalShipping: { amount: 0, currency: 'USD' },
  totalPrice: { amount: 7899, currency: 'USD' },
  financialStatus: 'PAID',
  lineItems: [
    {
      id: 'li_1',
      productId: 'prod_wk2026',
      variantId: 'var_wk2026_blk',
      title: 'Wireless Keyboard',
      quantity: 1,
      price: { amount: 7999, currency: 'USD' },
      sku: 'WK-2026',
      fulfillableQuantity: 0,
      fulfillmentStatus: 'FULFILLED',
      metadata: { lineItemPlatformId: 'gid://shopify/LineItem/li_1' },
    },
  ],
  transactionIds: ['txn_1042'],
  discountCodes: ['ACME10'],
  tags: ['accessories'],
  createdAt: '2026-01-15T09:30:00Z',
  updatedAt: '2026-02-01T14:20:00Z',
  processedAt: '2026-01-15T09:30:00Z',
  metadata: { orderPlatformId: 'gid://shopify/Order/ord_1042' },
}
const orderStateExamples = {
  fulfilled: {
    summary: 'Fulfilled — paid and shipped',
    value: {
      data: {
        ...orderBase,
        fulfillmentStatus: 'FULFILLED',
        fulfillmentIds: ['ful_1042'],
        refundIds: [],
        cancelledAt: null,
        cancelReason: null,
      },
    },
  },
  cancelled: {
    summary: 'Cancelled — refunded and restocked',
    value: {
      data: {
        ...orderBase,
        financialStatus: 'REFUNDED',
        fulfillmentStatus: 'RESTOCKED',
        fulfillmentIds: [],
        refundIds: ['ref_1042'],
        cancelledAt: '2026-02-01T14:20:00Z',
        cancelReason: 'customer',
      },
    },
  },
}

function createOp(meta: OpMeta) {
  return {
    tags: [meta.tag],
    operationId: meta.operationId,
    summary: meta.summary,
    description: meta.description,
    parameters: [connectionIdParam],
    requestBody: {
      required: true,
      content: { 'application/json': { schema: { $ref: meta.schemaRef } } },
    },
    responses: {
      '201': {
        description: 'Created',
        content: { 'application/json': { schema: singleEnvelope(meta.schemaRef) } },
      },
      '400': errorResponse400,
      '401': errorResponse401,
      '501': errorResponse501,
    },
  }
}

function updateOp(meta: OpMeta) {
  return {
    tags: [meta.tag],
    operationId: meta.operationId,
    summary: meta.summary,
    description: meta.description,
    parameters: [connectionIdParam, idPathParam],
    requestBody: {
      required: true,
      content: { 'application/json': { schema: { $ref: meta.schemaRef } } },
    },
    responses: {
      '200': {
        description: 'Updated',
        content: { 'application/json': { schema: singleEnvelope(meta.schemaRef) } },
      },
      '400': errorResponse400,
      '401': errorResponse401,
      '404': errorResponse404,
      '501': errorResponse501,
    },
  }
}

function deleteOp(
  tag: string,
  operationId: string,
  summary: string,
  description: string,
) {
  return {
    tags: [tag],
    operationId,
    summary,
    description,
    parameters: [connectionIdParam, idPathParam],
    responses: {
      '204': { description: 'Deleted — no body' },
      '400': errorResponse400,
      '401': errorResponse401,
      '404': errorResponse404,
      '501': errorResponse501,
    },
  }
}

// ── build components.schemas ─────────────────────────────────────────────────
// Walk the barrel so every Zod schema appears automatically, then overwrite
// the primary resource schemas with explicit `toSchema()` calls (identical
// result — the explicit calls document which names the path `$ref`s expect).

const componentSchemas: Record<string, unknown> = {}
for (const [name, value] of Object.entries(schemas)) {
  if (!isZodSchema(value)) continue
  componentSchemas[name] = toSchema(value, name)
}

// Guarantee the primary resource schemas are present under the exact names
// referenced by the path `$ref`s below. (These assignments are idempotent
// with respect to the barrel walk above.)
componentSchemas.ProductSchema = toSchema(ProductSchema, 'ProductSchema')
componentSchemas.ProductVariantSchema = toSchema(ProductVariantSchema, 'ProductVariantSchema')
componentSchemas.CollectionSchema = toSchema(CollectionSchema, 'CollectionSchema')
componentSchemas.LocationSchema = toSchema(LocationSchema, 'LocationSchema')
componentSchemas.InventoryLevelSchema = toSchema(InventoryLevelSchema, 'InventoryLevelSchema')
componentSchemas.CustomerSchema = toSchema(CustomerSchema, 'CustomerSchema')
componentSchemas.OrderSchema = toSchema(OrderSchema, 'OrderSchema')
componentSchemas.FulfillmentSchema = toSchema(FulfillmentSchema, 'FulfillmentSchema')
componentSchemas.RefundSchema = toSchema(RefundSchema, 'RefundSchema')
componentSchemas.TransactionSchema = toSchema(TransactionSchema, 'TransactionSchema')
componentSchemas.DiscountSchema = toSchema(DiscountSchema, 'DiscountSchema')

// Inline request-body shapes for the inventory mutation endpoints (not stored
// in the schema barrel since they're not canonical resource types).
componentSchemas.InventoryAdjustRequest = {
  type: 'object',
  required: ['variantId', 'locationId', 'delta'],
  properties: {
    variantId: { type: 'string', description: 'ID of the variant to adjust.', example: 'var_wk2026_blk' },
    locationId: { type: 'string', description: 'ID of the location holding the stock.', example: 'loc_sfo1' },
    delta: {
      type: 'integer',
      description:
        'Signed delta to apply to the current available quantity. Positive to add stock, negative to subtract.',
      example: -10,
    },
  },
}

componentSchemas.InventorySetRequest = {
  type: 'object',
  required: ['variantId', 'locationId', 'available'],
  properties: {
    variantId: { type: 'string', description: 'ID of the variant to update.', example: 'var_wk2026_blk' },
    locationId: { type: 'string', description: 'ID of the location holding the stock.', example: 'loc_sfo1' },
    available: {
      type: 'integer',
      minimum: 0,
      description: 'Absolute available quantity to set.',
      example: 240,
    },
  },
}

componentSchemas.OrderCancelRequest = {
  type: 'object',
  properties: {
    reason: {
      type: 'string',
      description: 'Optional free-text or adapter-specific cancellation reason.',
      example: 'customer_request',
    },
  },
}

// Background sync job schema — referenced by `/v1/ecommerce/sync` paths.
Object.assign(componentSchemas, buildSyncOpenapiSchemas())

// ── paths ────────────────────────────────────────────────────────────────────

const paths: Record<string, Record<string, unknown>> = {
  // ── Products ───────────────────────────────────────────────────────────────
  '/v1/products': {
    get: listOp({
      tag: 'Products',
      schemaRef: '#/components/schemas/ProductSchema',
      operationId: 'listProducts',
      summary: 'List products',
      description:
        'Returns all products visible to the authenticated connection. Supports incremental sync via `updated_after` and platform-native pagination (cursor or offset).',
    }),
    post: createOp({
      tag: 'Products',
      schemaRef: '#/components/schemas/ProductSchema',
      operationId: 'createProduct',
      summary: 'Create product',
      description:
        'Creates a new product on the target platform. Not all platforms expose product creation — returns `501` for unsupported adapters.',
    }),
  },
  '/v1/products/{id}': {
    get: getOp({
      tag: 'Products',
      schemaRef: '#/components/schemas/ProductSchema',
      operationId: 'getProductById',
      summary: 'Get product',
      description: 'Fetches a single product by its platform-specific ID.',
    }),
    patch: updateOp({
      tag: 'Products',
      schemaRef: '#/components/schemas/ProductSchema',
      operationId: 'updateProduct',
      summary: 'Update product',
      description:
        'Partially updates a product. Only fields present in the request body are modified. Returns `501` for adapters without write support.',
    }),
    delete: deleteOp(
      'Products',
      'deleteProduct',
      'Delete product',
      'Deletes a product by ID. Many platforms soft-delete or archive instead of hard-deleting; consult the adapter docs for semantics.',
    ),
  },

  // ── Variants ───────────────────────────────────────────────────────────────
  '/v1/variants': {
    get: listOp({
      tag: 'Variants',
      schemaRef: '#/components/schemas/ProductVariantSchema',
      operationId: 'listVariants',
      summary: 'List product variants',
      description:
        'Returns variants across all products. Some platforms nest variants inside products — for those adapters this endpoint lists variants lazily and returns `501` if unsupported.',
    }),
    post: createOp({
      tag: 'Variants',
      schemaRef: '#/components/schemas/ProductVariantSchema',
      operationId: 'createVariant',
      summary: 'Create product variant',
      description:
        'Creates a new variant on an existing product. The request body must include the parent `productId`.',
    }),
  },
  '/v1/variants/{id}': {
    get: getOp({
      tag: 'Variants',
      schemaRef: '#/components/schemas/ProductVariantSchema',
      operationId: 'getVariantById',
      summary: 'Get variant',
      description: 'Fetches a single product variant by its platform-specific ID.',
    }),
    patch: updateOp({
      tag: 'Variants',
      schemaRef: '#/components/schemas/ProductVariantSchema',
      operationId: 'updateVariant',
      summary: 'Update product variant',
      description: 'Partially updates a variant. Only fields present in the body are modified.',
    }),
    delete: deleteOp(
      'Variants',
      'deleteVariant',
      'Delete product variant',
      'Deletes a variant by ID. Some platforms reject deleting the last variant of a product.',
    ),
  },

  // ── Collections ────────────────────────────────────────────────────────────
  '/v1/collections': {
    get: listOp({
      tag: 'Collections',
      schemaRef: '#/components/schemas/CollectionSchema',
      operationId: 'listCollections',
      summary: 'List collections',
      description:
        'Returns all collections (also known as categories or taxonomies on some platforms).',
    }),
    post: createOp({
      tag: 'Collections',
      schemaRef: '#/components/schemas/CollectionSchema',
      operationId: 'createCollection',
      summary: 'Create collection',
      description: 'Creates a new collection. Returns `501` for adapters without write support.',
    }),
  },
  '/v1/collections/{id}': {
    get: getOp({
      tag: 'Collections',
      schemaRef: '#/components/schemas/CollectionSchema',
      operationId: 'getCollectionById',
      summary: 'Get collection',
      description: 'Fetches a single collection by ID.',
    }),
    patch: updateOp({
      tag: 'Collections',
      schemaRef: '#/components/schemas/CollectionSchema',
      operationId: 'updateCollection',
      summary: 'Update collection',
      description: 'Partially updates a collection.',
    }),
    delete: deleteOp(
      'Collections',
      'deleteCollection',
      'Delete collection',
      'Deletes a collection by ID. Product memberships are typically removed but the products themselves are preserved.',
    ),
  },

  // ── Locations ──────────────────────────────────────────────────────────────
  '/v1/locations': {
    get: listOp({
      tag: 'Locations',
      schemaRef: '#/components/schemas/LocationSchema',
      operationId: 'listLocations',
      summary: 'List locations',
      description:
        'Returns all inventory locations / warehouses configured on the platform. Single-location platforms return a single synthetic entry.',
    }),
  },
  '/v1/locations/{id}': {
    get: getOp({
      tag: 'Locations',
      schemaRef: '#/components/schemas/LocationSchema',
      operationId: 'getLocationById',
      summary: 'Get location',
      description: 'Fetches a single location by ID.',
    }),
  },

  // ── Inventory ──────────────────────────────────────────────────────────────
  '/v1/inventory_levels': {
    get: listOp({
      tag: 'Inventory',
      schemaRef: '#/components/schemas/InventoryLevelSchema',
      operationId: 'listInventoryLevels',
      summary: 'List inventory levels',
      description:
        'Returns per-variant / per-location inventory quantities. Filter with `variantId` or `locationId` query parameters when supported by the adapter.',
    }),
  },
  '/v1/inventory_levels/{id}': {
    get: getOp({
      tag: 'Inventory',
      schemaRef: '#/components/schemas/InventoryLevelSchema',
      operationId: 'getInventoryLevelById',
      summary: 'Get inventory level',
      description:
        'Fetches a single inventory level. The `id` is typically a composite of `variantId:locationId` for platforms without first-class inventory IDs.',
    }),
  },
  '/v1/inventory_levels/adjust': {
    post: {
      tags: ['Inventory'],
      operationId: 'adjustInventoryLevel',
      summary: 'Adjust inventory level',
      description:
        'Applies a signed delta to the current available quantity for a given variant at a given location. Positive delta adds stock, negative subtracts. Returns `501` for read-only adapters.',
      parameters: [connectionIdParam],
      requestBody: {
        required: true,
        content: {
          'application/json': { schema: { $ref: '#/components/schemas/InventoryAdjustRequest' } },
        },
      },
      responses: {
        '200': {
          description: 'Adjusted',
          content: {
            'application/json': {
              schema: singleEnvelope('#/components/schemas/InventoryLevelSchema'),
            },
          },
        },
        '400': errorResponse400,
        '401': errorResponse401,
        '404': errorResponse404,
        '501': errorResponse501,
      },
    },
  },
  '/v1/inventory_levels/set': {
    post: {
      tags: ['Inventory'],
      operationId: 'setInventoryLevel',
      summary: 'Set inventory level',
      description:
        'Sets the absolute available quantity for a given variant at a given location. Prefer `/adjust` where possible to avoid race conditions between multiple writers.',
      parameters: [connectionIdParam],
      requestBody: {
        required: true,
        content: {
          'application/json': { schema: { $ref: '#/components/schemas/InventorySetRequest' } },
        },
      },
      responses: {
        '200': {
          description: 'Set',
          content: {
            'application/json': {
              schema: singleEnvelope('#/components/schemas/InventoryLevelSchema'),
            },
          },
        },
        '400': errorResponse400,
        '401': errorResponse401,
        '404': errorResponse404,
        '501': errorResponse501,
      },
    },
  },

  // ── Customers ──────────────────────────────────────────────────────────────
  '/v1/customers': {
    get: listOp({
      tag: 'Customers',
      schemaRef: '#/components/schemas/CustomerSchema',
      operationId: 'listCustomers',
      summary: 'List customers',
      description:
        'Returns customers visible to the authenticated connection. Supports incremental sync via `updated_after`.',
    }),
    post: createOp({
      tag: 'Customers',
      schemaRef: '#/components/schemas/CustomerSchema',
      operationId: 'createCustomer',
      summary: 'Create customer',
      description:
        'Creates a new customer record. Adapters that do not expose customer creation return `501`.',
    }),
  },
  '/v1/customers/{id}': {
    get: getOp({
      tag: 'Customers',
      schemaRef: '#/components/schemas/CustomerSchema',
      operationId: 'getCustomerById',
      summary: 'Get customer',
      description: 'Fetches a single customer by ID.',
    }),
    patch: updateOp({
      tag: 'Customers',
      schemaRef: '#/components/schemas/CustomerSchema',
      operationId: 'updateCustomer',
      summary: 'Update customer',
      description: 'Partially updates a customer record.',
    }),
    delete: deleteOp(
      'Customers',
      'deleteCustomer',
      'Delete customer',
      'Deletes a customer by ID. Many platforms anonymise rather than hard-delete for compliance reasons.',
    ),
  },

  // ── Orders ─────────────────────────────────────────────────────────────────
  '/v1/orders': {
    get: listOp({
      tag: 'Orders',
      schemaRef: '#/components/schemas/OrderSchema',
      operationId: 'listOrders',
      summary: 'List orders',
      description:
        'Returns all orders (historical + open). Use `updated_after` for efficient incremental sync.',
    }),
    post: createOp({
      tag: 'Orders',
      schemaRef: '#/components/schemas/OrderSchema',
      operationId: 'createOrder',
      summary: 'Create order',
      description:
        'Creates a new draft or confirmed order. Most headless platforms support this; storefront-only platforms return `501`.',
    }),
  },
  '/v1/orders/{id}': {
    get: withSingleExamples(
      getOp({
        tag: 'Orders',
        schemaRef: '#/components/schemas/OrderSchema',
        operationId: 'getOrderById',
        summary: 'Get order',
        description: 'Fetches a single order including line items, fulfillments, and refunds.',
      }),
      orderStateExamples,
    ),
    patch: updateOp({
      tag: 'Orders',
      schemaRef: '#/components/schemas/OrderSchema',
      operationId: 'updateOrder',
      summary: 'Update order',
      description:
        'Partially updates an order. Many platforms restrict which fields are mutable after payment or fulfillment.',
    }),
  },
  '/v1/orders/{id}/cancel': {
    post: {
      tags: ['Orders'],
      operationId: 'cancelOrder',
      summary: 'Cancel order',
      description:
        'Cancels an order. Some platforms reject cancellation of partially fulfilled orders; consult the adapter docs.',
      parameters: [connectionIdParam, idPathParam],
      requestBody: {
        required: false,
        content: {
          'application/json': { schema: { $ref: '#/components/schemas/OrderCancelRequest' } },
        },
      },
      responses: {
        '200': {
          description: 'Cancelled',
          content: {
            'application/json': { schema: singleEnvelope('#/components/schemas/OrderSchema') },
          },
        },
        '400': errorResponse400,
        '401': errorResponse401,
        '404': errorResponse404,
        '501': errorResponse501,
      },
    },
  },

  // ── Fulfillments ───────────────────────────────────────────────────────────
  '/v1/fulfillments': {
    get: listOp({
      tag: 'Fulfillments',
      schemaRef: '#/components/schemas/FulfillmentSchema',
      operationId: 'listFulfillments',
      summary: 'List fulfillments',
      description:
        'Returns fulfillments across orders. Some adapters expose fulfillments only via their parent order — those return `501` on this endpoint.',
    }),
    post: createOp({
      tag: 'Fulfillments',
      schemaRef: '#/components/schemas/FulfillmentSchema',
      operationId: 'createFulfillment',
      summary: 'Create fulfillment',
      description:
        'Creates a fulfillment for an existing order. The request body must include the parent `orderId` and the line items being fulfilled.',
    }),
  },
  '/v1/fulfillments/{id}': {
    get: getOp({
      tag: 'Fulfillments',
      schemaRef: '#/components/schemas/FulfillmentSchema',
      operationId: 'getFulfillmentById',
      summary: 'Get fulfillment',
      description: 'Fetches a single fulfillment by ID.',
    }),
    patch: updateOp({
      tag: 'Fulfillments',
      schemaRef: '#/components/schemas/FulfillmentSchema',
      operationId: 'updateFulfillment',
      summary: 'Update fulfillment',
      description:
        'Partially updates a fulfillment — typically used to attach or update tracking information.',
    }),
  },
  '/v1/fulfillments/{id}/cancel': {
    post: {
      tags: ['Fulfillments'],
      operationId: 'cancelFulfillment',
      summary: 'Cancel fulfillment',
      description:
        'Cancels a fulfillment. Many platforms only allow cancellation of fulfillments that have not yet shipped.',
      parameters: [connectionIdParam, idPathParam],
      responses: {
        '200': {
          description: 'Cancelled',
          content: {
            'application/json': {
              schema: singleEnvelope('#/components/schemas/FulfillmentSchema'),
            },
          },
        },
        '400': errorResponse400,
        '401': errorResponse401,
        '404': errorResponse404,
        '501': errorResponse501,
      },
    },
  },

  // ── Refunds ────────────────────────────────────────────────────────────────
  '/v1/refunds': {
    get: listOp({
      tag: 'Refunds',
      schemaRef: '#/components/schemas/RefundSchema',
      operationId: 'listRefunds',
      summary: 'List refunds',
      description: 'Returns refunds across orders. Supports incremental sync via `updated_after`.',
    }),
    post: createOp({
      tag: 'Refunds',
      schemaRef: '#/components/schemas/RefundSchema',
      operationId: 'createRefund',
      summary: 'Create refund',
      description:
        'Creates a refund against an order. The request body must include the parent `orderId` and the refunded line items / amount.',
    }),
  },
  '/v1/refunds/{id}': {
    get: getOp({
      tag: 'Refunds',
      schemaRef: '#/components/schemas/RefundSchema',
      operationId: 'getRefundById',
      summary: 'Get refund',
      description: 'Fetches a single refund by ID.',
    }),
  },

  // ── Transactions ───────────────────────────────────────────────────────────
  '/v1/transactions': {
    get: listOp({
      tag: 'Transactions',
      schemaRef: '#/components/schemas/TransactionSchema',
      operationId: 'listTransactions',
      summary: 'List transactions',
      description:
        'Returns payment transactions (authorisations, captures, voids, refunds) across orders.',
    }),
    post: createOp({
      tag: 'Transactions',
      schemaRef: '#/components/schemas/TransactionSchema',
      operationId: 'createTransaction',
      summary: 'Create transaction',
      description:
        'Records a new transaction against an order (e.g. a manual capture or external payment). Not all platforms expose this — returns `501` otherwise.',
    }),
  },
  '/v1/transactions/{id}': {
    get: getOp({
      tag: 'Transactions',
      schemaRef: '#/components/schemas/TransactionSchema',
      operationId: 'getTransactionById',
      summary: 'Get transaction',
      description: 'Fetches a single transaction by ID.',
    }),
  },

  // ── Discounts ──────────────────────────────────────────────────────────────
  '/v1/discounts': {
    get: listOp({
      tag: 'Discounts',
      schemaRef: '#/components/schemas/DiscountSchema',
      operationId: 'listDiscounts',
      summary: 'List discounts',
      description:
        'Returns all discount codes and automatic discounts configured on the platform.',
    }),
    post: createOp({
      tag: 'Discounts',
      schemaRef: '#/components/schemas/DiscountSchema',
      operationId: 'createDiscount',
      summary: 'Create discount',
      description: 'Creates a new discount. Returns `501` for adapters without write support.',
    }),
  },
  '/v1/discounts/{id}': {
    get: getOp({
      tag: 'Discounts',
      schemaRef: '#/components/schemas/DiscountSchema',
      operationId: 'getDiscountById',
      summary: 'Get discount',
      description: 'Fetches a single discount by ID.',
    }),
    patch: updateOp({
      tag: 'Discounts',
      schemaRef: '#/components/schemas/DiscountSchema',
      operationId: 'updateDiscount',
      summary: 'Update discount',
      description: 'Partially updates a discount.',
    }),
    delete: deleteOp(
      'Discounts',
      'deleteDiscount',
      'Delete discount',
      'Deletes a discount by ID. Historical usage on existing orders is preserved.',
    ),
  },

  // ── Auth ─────────────────────────────────────────────────────────────────
  // Auth routes documented in the unified spec — see control-plane-spec.ts.
  // Single `/auth/{vertical}/{platform}/*` covers all four verticals.

  // ── Connections ──────────────────────────────────────────────────────────
  // Connection management lives in the unified spec under the
  // `Connections` tag (see control-plane-spec.ts):
  //   - /v1/connections     — tenant-scoped (Bearer dev key)
  //   - /connections        — operator (X-Admin-Secret)

  // Providers + Sync are documented once in the unified spec
  // (control-plane-spec.ts). No per-vertical entries needed.

  // ── Webhooks ─────────────────────────────────────────────────────────────
  '/webhooks/{platform}': {
    post: {
      tags: ['Webhooks'],
      summary: 'Receive a platform webhook',
      operationId: 'receiveWebhook',
      description: 'Verifies the incoming webhook signature and emits a canonical `WebhookEvent`.',
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

  // ── Health ───────────────────────────────────────────────────────────────
  '/health': {
    get: {
      tags: [],
      summary: 'Liveness probe',
      operationId: 'health',
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
}

// ── document ─────────────────────────────────────────────────────────────────

export function buildSpec(): Record<string, unknown> {
  const openapi = {
  openapi: '3.1.0',
  info: {
    title: 'Ecommerce API',
    version: '0.1.0',
    license: { name: 'Elastic-2.0', url: 'https://github.com/open-steward/opensteward/blob/main/LICENSE' },
    description: `Unified REST API for ecommerce platforms (Shopify, WooCommerce, BigCommerce, Magento, and more).

## Authentication

Every \`/v1/*\` request must include the \`connection_id\` query parameter — a UUID returned by the OAuth
callback. The connection row in the credential store carries its own platform, tenant, and credentials,
so no \`X-Provider\` / \`X-Tenant-Id\` headers are needed.

## Response envelopes

- **List:** \`{ data: T[] }\`
- **Single:** \`{ data: T }\`

Every resource carries the complete, unmodified raw platform response under \`metadata\`.

## Unsupported operations

Unimplemented adapter operations return \`501 Not Implemented\`. This is a first-class state, not a bug —
verticals expose the union of all platform capabilities and each individual adapter implements the subset
that makes sense for its platform.

## Pagination

List endpoints accept both \`page\` (offset-based) and \`cursor\` (cursor-based) parameters. Adapters
ignore whichever one is inappropriate for their upstream API.`,
  },
  servers: [
    { url: 'http://localhost:3010', description: 'Local (integration-server via docker compose)' },
  ],
  tags: [
    { name: 'Products', description: 'Product catalogue. Full CRUD.' },
    { name: 'Variants', description: 'Product variants (SKUs). Full CRUD.' },
    { name: 'Collections', description: 'Product collections / categories. Full CRUD.' },
    { name: 'Locations', description: 'Inventory locations / warehouses. Read-only.' },
    { name: 'Inventory', description: 'Inventory levels. List, get, adjust, set.' },
    { name: 'Customers', description: 'Customer records. Full CRUD.' },
    { name: 'Orders', description: 'Orders with line items, fulfillments, refunds. List, get, create, update, cancel.' },
    { name: 'Fulfillments', description: 'Order fulfillments and shipments. List, get, create, update, cancel.' },
    { name: 'Refunds', description: 'Order refunds. List, get, create.' },
    { name: 'Transactions', description: 'Payment transactions. List, get, create.' },
    { name: 'Discounts', description: 'Discount codes and automatic discounts. Full CRUD.' },
    { name: 'Auth', description: 'OAuth 2.0 flows — connect, callback, revoke.' },
    { name: 'Connections', description: 'Admin view of stored connections. Protected by X-Admin-Secret.' },
    { name: 'Providers', description: 'Static metadata about enabled ecommerce platforms.' },
    { name: 'Sync', description: 'Background full-sync job management at `/v1/ecommerce/sync`. Auth: tenant-scoped Bearer key with `vertical:ecommerce` scope. Routes are mounted only when `dataStore.mode != passthrough`.' },
    { name: 'Webhooks', description: 'Inbound platform webhook normalisation. Verifies signatures and emits canonical WebhookEvents.' },
  ],
  paths,
  components: {
    // securitySchemes owned by `control-plane-spec.ts`. See accounting/openapi.ts
    // for context.
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
