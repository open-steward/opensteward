/**
 * Builds the inventory-vertical OpenAPI document.
 */
import fs from 'node:fs'
import path from 'node:path'
import { z } from 'zod'

import * as schemas from './schema'
import { buildSyncOpenapiSchemas } from '@opensteward/shared'
import { ProductSchema } from './schema/product'
import { StockLevelSchema } from './schema/stock-level'
import { LocationSchema } from './schema/location'
import { SupplierSchema } from './schema/supplier'
import { PurchaseOrderSchema } from './schema/purchase-order'
import { StockTransferSchema } from './schema/stock-transfer'
import { StockAdjustmentSchema } from './schema/stock-adjustment'

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

const authPlatformParam = { name: 'platform', in: 'path', required: true, description: 'Platform slug.', schema: { type: 'string', enum: PLATFORM_SLUGS } }
const connectionIdParam = { name: 'connection_id', in: 'query', required: true, description: 'UUID of the stored connection.', schema: { type: 'string', format: 'uuid' } }
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
const idPathParam = { name: 'id', in: 'path', required: true, schema: { type: 'string' } }

const baseListQueryParams = [connectionIdParam, limitParam, pageParam, cursorParam]
const getQueryParams = [connectionIdParam]

const errorResponse400 = { $ref: '#/components/responses/BadRequest' }
const errorResponse401 = { $ref: '#/components/responses/Unauthorized' }
const errorResponse404 = { $ref: '#/components/responses/NotFound' }
const errorResponse501 = { $ref: '#/components/responses/NotImplemented' }

function listEnvelope(schemaRef: string) {
  return { type: 'object', required: ['data'], properties: { data: { type: 'array', items: { $ref: schemaRef } } } }
}
function singleEnvelope(schemaRef: string) {
  return { type: 'object', required: ['data'], properties: { data: { $ref: schemaRef } } }
}
interface OpMeta { tag: string; schemaRef: string; operationId: string; summary: string; description: string }
// Whole-body `empty` example for a list 200 — the populated case is already
// composed from each resource schema's field examples, so only the empty
// first-page scenario is added here.
const emptyListExamples = { empty: { summary: 'No records match — empty first page', value: { data: [] } } }
function listOp(meta: OpMeta, params = baseListQueryParams) {
  return { tags: [meta.tag], operationId: meta.operationId, summary: meta.summary, description: meta.description, parameters: params, responses: { '200': { description: 'Success', content: { 'application/json': { schema: listEnvelope(meta.schemaRef), examples: emptyListExamples } } }, '400': errorResponse400, '401': errorResponse401, '501': errorResponse501 } }
}
function getOp(meta: OpMeta) {
  return { tags: [meta.tag], operationId: meta.operationId, summary: meta.summary, description: meta.description, parameters: [...getQueryParams, idPathParam], responses: { '200': { description: 'Success', content: { 'application/json': { schema: singleEnvelope(meta.schemaRef) } } }, '400': errorResponse400, '401': errorResponse401, '404': errorResponse404, '501': errorResponse501 } }
}

const componentSchemas: Record<string, unknown> = {}
for (const [name, value] of Object.entries(schemas)) {
  if (!isZodSchema(value)) continue
  componentSchemas[name] = toSchema(value, name)
}
componentSchemas.ProductSchema = toSchema(ProductSchema, 'ProductSchema')
componentSchemas.StockLevelSchema = toSchema(StockLevelSchema, 'StockLevelSchema')
componentSchemas.LocationSchema = toSchema(LocationSchema, 'LocationSchema')
componentSchemas.SupplierSchema = toSchema(SupplierSchema, 'SupplierSchema')
componentSchemas.PurchaseOrderSchema = toSchema(PurchaseOrderSchema, 'PurchaseOrderSchema')
componentSchemas.StockTransferSchema = toSchema(StockTransferSchema, 'StockTransferSchema')
componentSchemas.StockAdjustmentSchema = toSchema(StockAdjustmentSchema, 'StockAdjustmentSchema')

Object.assign(componentSchemas, buildSyncOpenapiSchemas())

const paths: Record<string, Record<string, unknown>> = {
  '/v1/products': { get: listOp({ tag: 'Products', schemaRef: '#/components/schemas/ProductSchema', operationId: 'listProducts', summary: 'List products', description: 'Returns products / SKUs. Variants flat-with-parent-pointer via parentProductId. Schema-firewall: no images.' }) },
  '/v1/products/{id}': { get: getOp({ tag: 'Products', schemaRef: '#/components/schemas/ProductSchema', operationId: 'getProduct', summary: 'Get product', description: 'Fetches a single product by id.' }) },
  '/v1/stock-levels': { get: listOp({ tag: 'StockLevels', schemaRef: '#/components/schemas/StockLevelSchema', operationId: 'listStockLevels', summary: 'List stock levels', description: 'Returns quantity per Product × Location. Id is synthetic <productId>:<locationId>.' }) },
  '/v1/stock-levels/{id}': { get: getOp({ tag: 'StockLevels', schemaRef: '#/components/schemas/StockLevelSchema', operationId: 'getStockLevel', summary: 'Get stock level', description: 'Fetches a single stock level.' }) },
  '/v1/locations': { get: listOp({ tag: 'Locations', schemaRef: '#/components/schemas/LocationSchema', operationId: 'listLocations', summary: 'List locations', description: 'Returns warehouses / stores / virtual locations. Hierarchy via parentLocationId.' }) },
  '/v1/locations/{id}': { get: getOp({ tag: 'Locations', schemaRef: '#/components/schemas/LocationSchema', operationId: 'getLocation', summary: 'Get location', description: 'Fetches a single location.' }) },
  '/v1/suppliers': { get: listOp({ tag: 'Suppliers', schemaRef: '#/components/schemas/SupplierSchema', operationId: 'listSuppliers', summary: 'List suppliers', description: 'Returns vendors / sources. PII-minimal — banking details refused.' }) },
  '/v1/suppliers/{id}': { get: getOp({ tag: 'Suppliers', schemaRef: '#/components/schemas/SupplierSchema', operationId: 'getSupplier', summary: 'Get supplier', description: 'Fetches a single supplier.' }) },
  '/v1/purchase-orders': { get: listOp({ tag: 'PurchaseOrders', schemaRef: '#/components/schemas/PurchaseOrderSchema', operationId: 'listPurchaseOrders', summary: 'List purchase orders', description: 'Returns inbound stock orders with nested line items.' }) },
  '/v1/purchase-orders/{id}': { get: getOp({ tag: 'PurchaseOrders', schemaRef: '#/components/schemas/PurchaseOrderSchema', operationId: 'getPurchaseOrder', summary: 'Get purchase order', description: 'Fetches a single purchase order.' }) },
  '/v1/stock-transfers': { get: listOp({ tag: 'StockTransfers', schemaRef: '#/components/schemas/StockTransferSchema', operationId: 'listStockTransfers', summary: 'List stock transfers', description: 'Returns movements between Locations.' }) },
  '/v1/stock-transfers/{id}': { get: getOp({ tag: 'StockTransfers', schemaRef: '#/components/schemas/StockTransferSchema', operationId: 'getStockTransfer', summary: 'Get stock transfer', description: 'Fetches a single stock transfer.' }) },
  '/v1/stock-adjustments': { get: listOp({ tag: 'StockAdjustments', schemaRef: '#/components/schemas/StockAdjustmentSchema', operationId: 'listStockAdjustments', summary: 'List stock adjustments', description: 'Cycle-counts, damage write-offs, audit moves.' }) },
  '/v1/stock-adjustments/{id}': { get: getOp({ tag: 'StockAdjustments', schemaRef: '#/components/schemas/StockAdjustmentSchema', operationId: 'getStockAdjustment', summary: 'Get stock adjustment', description: 'Fetches a single stock adjustment.' }) },
  '/webhooks/{platform}': {
    post: {
      tags: ['Webhooks'],
      summary: 'Receive a platform webhook',
      operationId: 'receiveInventoryWebhook',
      description: 'Verifies the incoming webhook signature and emits canonical WebhookEvents.',
      parameters: [authPlatformParam],
      requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', additionalProperties: true } } } },
      responses: { '200': { description: 'Webhook received.' }, '400': { $ref: '#/components/responses/BadRequest' }, '401': { description: 'Invalid signature.' } },
    },
  },
  '/health': { get: { tags: [], summary: 'Liveness probe', operationId: 'inventoryHealth', responses: { '200': { description: 'Service is up', content: { 'application/json': { schema: { type: 'object', properties: { status: { type: 'string', enum: ['ok'] } } } } } } } } },
}

export function buildSpec(): Record<string, unknown> {
  return {
    openapi: '3.1.0',
    info: {
      title: 'Inventory API',
      version: '0.1.0',
      license: { name: 'Elastic-2.0', url: 'https://github.com/open-steward/opensteward/blob/main/LICENSE' },
      description: `Unified REST API for inventory / stock-of-record platforms.

## Refused at the schema level

- **Product images / 3D assets / file URLs** — not part of the inventory schema
- **Supplier banking details / payment terms** — use accounting vertical
- **Manufacturing BOM / kit components / work orders** — not part of the inventory schema
- **Operator/admin user list** — not part of the inventory schema
- **Customer-facing order data** — ecommerce vertical
- **Cost-method details (FIFO/LIFO/avg)** — only the final cost is surfaced

## Hierarchy

Locations: flat-with-parent-pointer (\`parentLocationId\`) for warehouse → zone → bin chains.
Products: variants flat-with-parent-pointer (\`parentProductId\`) for SKU master + variants.

## Authentication

Tenant mode (\`Bearer oi_…\`). Per-account-subdomain platforms (NetSuite Inventory) require \`tenantSubdomain\`.

## Response envelopes

- List: \`{ data: T[] }\`
- Single: \`{ data: T }\`
`,
    },
    servers: [{ url: 'http://localhost:3010', description: 'Local' }],
    tags: [
      { name: 'Products', description: 'SKU master records.' },
      { name: 'StockLevels', description: 'Qty per Product × Location.' },
      { name: 'Locations', description: 'Warehouses / stores / virtual locations.' },
      { name: 'Suppliers', description: 'Vendors / sources.' },
      { name: 'PurchaseOrders', description: 'Inbound stock orders.' },
      { name: 'StockTransfers', description: 'Movements between locations.' },
      { name: 'StockAdjustments', description: 'Cycle counts, write-offs, audit moves.' },
      { name: 'Sync', description: 'Background full-sync at /v1/inventory/sync.' },
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
}
