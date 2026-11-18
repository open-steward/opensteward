/**
 * Builds the logistics-vertical OpenAPI document.
 *
 * The unified generator (apps/integration-server/scripts/generate-openapi.ts)
 * imports `buildSpec()`, prefixes it with `/v1/logistics/...`, and merges
 * it with the other verticals into a single `docs/openapi/openapi.json`.
 */

import fs from 'node:fs'
import path from 'node:path'
import { z } from 'zod'
import { buildSyncOpenapiSchemas } from '@opensteward/shared'

import { ShipmentSchema } from './schema/shipment'
import { OrderSchema } from './schema/order'
import { CarrierSchema } from './schema/carrier'
import { WarehouseSchema } from './schema/warehouse'
import { TrackingEventSchema } from './schema/trackingevent'
import { RateSchema } from './schema/rate'
import { LabelSchema } from './schema/label'
import { ManifestSchema } from './schema/manifest'
import { PickupSchema } from './schema/pickup'
import { AddressSchema, PackageSchema } from './schema/shared'
import { WebhookEventSchema } from './schema/webhook'

// ── helpers ───────────────────────────────────────────────────────────────────

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
  description: 'Platform slug (e.g. `fedex`, `ups`, `shippo`).',
  schema: { type: 'string', enum: PLATFORM_SLUGS },
}

// Zod 4 native JSON-Schema export. Spec targets OpenAPI 3.1, whose dialect is
// compatible with JSON Schema draft-2020-12. Strip `$schema` since the parent
// document uses the default OAS dialect.
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
// The connection row carries its own `platform` and `tenant_id`, so
// `connection_id` alone fully disambiguates the request — no `X-Provider`,
// no `X-Tenant-Id`, no `?platform=`.
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
]

const getQueryParams = [connectionIdParam]

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

const stdSecurity = [{ ApiKeyAuth: [] }]

// Whole-body `empty` example for a list 200 — the populated case is already
// composed from each resource schema's field examples, so only the empty
// first-page scenario is added here (matches the ListMeta shape).
const emptyListExamples = {
  empty: {
    summary: 'No records match — empty first page',
    value: {
      data: [],
      meta: {
        platform: 'shippo',
        totalCount: 0,
        page: 1,
        limit: 50,
        hasMore: false,
        fetchedAt: '2026-02-01T14:20:00Z',
      },
    },
  },
}

function listGet(tag: string, schemaRef: string, summary: string, extraParams: unknown[] = []) {
  return {
    tags: [tag],
    summary,
    security: stdSecurity,
    parameters: [...listQueryParams, ...extraParams],
    responses: {
      '200': { description: 'Success', content: { 'application/json': { schema: listEnvelope(schemaRef), examples: emptyListExamples } } },
      '400': { $ref: '#/components/responses/BadRequest' },
      '401': { $ref: '#/components/responses/Unauthorized' },
      '501': { $ref: '#/components/responses/NotImplemented' },
    },
  }
}

function singleGet(tag: string, schemaRef: string, summary: string, pathParam: unknown = idParam) {
  return {
    tags: [tag],
    summary,
    security: stdSecurity,
    parameters: [pathParam, ...getQueryParams],
    responses: {
      '200': { description: 'Success', content: { 'application/json': { schema: singleEnvelope(schemaRef) } } },
      '400': { $ref: '#/components/responses/BadRequest' },
      '401': { $ref: '#/components/responses/Unauthorized' },
      '404': { $ref: '#/components/responses/NotFound' },
      '501': { $ref: '#/components/responses/NotImplemented' },
    },
  }
}

// Attach named whole-body `examples` to a single-GET operation's 200 response
// (sibling of `schema`). Used on the flagship Shipment resource.
function withSingleExamples<T>(op: T, examples: Record<string, unknown>): T {
  const responses = (op as { responses: Record<string, { content?: Record<string, Record<string, unknown>> }> }).responses
  const content = responses['200']?.content?.['application/json']
  if (content) content['examples'] = examples
  return op
}

// Flagship Shipment state examples — in_transit vs delivered, sharing the Acme
// / shippo story; only status and delivery timestamps vary. Each is a full
// valid Shipment body wrapped in the single-resource envelope.
const shipmentSingleMeta = { platform: 'shippo', fetchedAt: '2026-02-01T14:20:00Z' }
const shipmentBase = {
  id: 'shp_1042',
  trackingNumber: '1Z999AA10123456784',
  carrierId: 'ups',
  serviceCode: 'ups_ground',
  warehouseId: 'wh_sfo1',
  labelUrl: 'https://labels.acme.example/shp_1042.pdf',
  cost: { amount: 1200, currency: 'USD' },
  reference: 'ORD-1042',
  notes: 'Leave at front desk.',
  mode: 'parcel',
  estimatedDeliveryAt: '2026-02-01T14:20:00Z',
  createdAt: '2026-01-15T09:30:00Z',
  updatedAt: '2026-02-01T14:20:00Z',
}
const shipmentStateExamples = {
  in_transit: {
    summary: 'In transit — picked up, not yet delivered',
    value: {
      data: { ...shipmentBase, status: 'IN_TRANSIT' },
      meta: shipmentSingleMeta,
    },
  },
  delivered: {
    summary: 'Delivered — actual delivery recorded',
    value: {
      data: { ...shipmentBase, status: 'DELIVERED', actualDeliveryAt: '2026-02-01T14:20:00Z' },
      meta: shipmentSingleMeta,
    },
  },
}

function createPost(tag: string, schemaRef: string, summary: string) {
  return {
    tags: [tag],
    summary,
    security: stdSecurity,
    parameters: [connectionIdParam],
    requestBody: { required: true, content: { 'application/json': { schema: { $ref: schemaRef } } } },
    responses: {
      '201': { description: 'Created', content: { 'application/json': { schema: singleEnvelope(schemaRef) } } },
      '400': { $ref: '#/components/responses/BadRequest' },
      '401': { $ref: '#/components/responses/Unauthorized' },
      '501': { $ref: '#/components/responses/NotImplemented' },
    },
  }
}

// Keyed under `patch:` to match router/orders.ts (`fastify.patch`).
// Accounting uses PUT; crm, ecommerce and payments use PATCH.
function updatePatch(tag: string, schemaRef: string, summary: string) {
  return {
    tags: [tag],
    summary,
    security: stdSecurity,
    parameters: [idParam, ...getQueryParams],
    requestBody: { required: true, content: { 'application/json': { schema: { $ref: schemaRef } } } },
    responses: {
      '200': { description: 'Updated', content: { 'application/json': { schema: singleEnvelope(schemaRef) } } },
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
    security: stdSecurity,
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

// ── pickups ───────────────────────────────────────────────────────────────────

// Class B like rates: RPC-shaped, no sync entry, no cache. Every pickup
// operation carries an EXPLICIT operationId. The unified generator only
// synthesises ids for `/{resource}` and `/{resource}/{id}`
// (generate-openapi.ts, SYNTH_OPID_VERTICALS — a three-segment path whose last
// segment is not a parameter is skipped), so `/pickups/{id}/cancel` would ship
// without one, and the CLI generator skips every operation that lacks an id.
// The three that could be synthesised are named here too, so the four read as
// one set rather than three derived and one hand-written.

// The body of `POST /pickups` is a request, not a `Pickup` — `createPost` would
// document the response schema as the input. Address and package shapes are
// inlined from the canonical Zod schemas so their per-field examples travel.
const pickupRequestBody = {
  required: true,
  content: {
    'application/json': {
      schema: {
        type: 'object',
        required: ['address', 'readyAt'],
        description:
          'Platform-specific keys (account numbers, `carrierCode`, `serviceCode`, …) pass through to the adapter.',
        properties: {
          address: { ...toSchema(AddressSchema, 'Address'), description: 'Where the carrier collects.' },
          readyAt: { type: 'string', format: 'date-time', description: 'Earliest time the packages are ready for collection.', example: '2026-01-15T09:30:00Z' },
          closeAt: { type: 'string', format: 'date-time', description: 'Latest time the carrier may still collect — the close of the pickup window.', example: '2026-01-15T17:00:00Z' },
          carrierId: { type: 'string', description: 'Carrier to dispatch, on platforms that front several.', example: 'ups' },
          shipmentIds: { type: 'array', items: { type: 'string' }, description: 'Shipments (or labels / transactions) the pickup covers.', example: ['shp_8f3a2b9c4d'] },
          packages: { type: 'array', items: toSchema(PackageSchema, 'Package'), description: 'Packages the carrier sizes the pickup by.' },
          instructions: { type: 'string', description: 'Free-text note for the driver.', example: 'Ring the bell at the loading dock.' },
        },
        additionalProperties: true,
      },
    },
  },
}

const pickupCancelRequestBody = {
  required: false,
  content: {
    'application/json': {
      schema: {
        type: 'object',
        description:
          'Optional. Carriers that cannot cancel by id alone read their extra keys from here — FedEx `carrierCode`, `scheduledDate`, `location`; DHL `requestorName`.',
        properties: {
          reason: { type: 'string', description: 'Why the pickup is being cancelled, where the carrier records one.', example: 'Shipment not ready.' },
        },
        additionalProperties: true,
      },
    },
  },
}

// ── static schemas ────────────────────────────────────────────────────────────

const providerInfoSchema = {
  type: 'object',
  properties: {
    slug: { type: 'string', description: 'Unique adapter identifier', example: 'shippo' },
    name: { type: 'string', example: 'Shippo' },
    category: {
      type: 'string',
      enum: [
        'global_carrier', 'integration_platform', 'north_america', 'europe',
        'apac', 'latam', 'africa_mena', 'tms_visibility', 'ocean_carrier',
        'container_visibility', 'last_mile_crowdsourced', 'last_mile_orchestration', 'wms_3pl',
      ],
      example: 'integration_platform',
    },
    authType: { type: 'string', enum: ['oauth2', 'api_key', 'basic', 'session'], example: 'api_key' },
    website: { type: 'string', format: 'uri', example: 'https://goshippo.com' },
    logo: {
      description: 'Base64-encoded SVG logo, or null if not yet added',
      oneOf: [{ type: 'string' }, { type: 'null' }],
    },
  },
}

// ── build document ────────────────────────────────────────────────────────────

export function buildSpec(): Record<string, unknown> {
  const doc = {
  openapi: '3.1.0',

  info: {
    title: 'Open Logistics Integration',
    version: (JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../../package.json'), 'utf8')) as { version: string }).version,
    license: { name: 'Elastic-2.0', url: 'https://github.com/open-steward/opensteward/blob/main/LICENSE' },
    contact: {
      name: 'Open Logistics Integration',
      url: 'https://github.com/open-steward/opensteward',
    },
    description: `Self-hosted logistics aggregation service that maps any shipping or freight
platform's data to a unified REST API. No sign-up, no gateway — \`git clone\`, configure, run.

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

Unimplemented adapter operations return \`501 Not Implemented\` with \`code: "NOT_IMPLEMENTED"\`.`,
  },

  servers: [
    { url: 'http://localhost:3010', description: 'Local development server' },
    {
      url: 'https://{host}',
      description: 'Self-hosted deployment',
      variables: { host: { default: 'integration.example.com', description: 'Your self-hosted domain' } },
    },
  ],

  tags: [
    { name: 'auth', description: 'OAuth2 connect / callback / revoke flows' },
    { name: 'connections', description: 'List and manage stored platform connections' },
    { name: 'providers', description: 'List available adapters and their metadata' },
    { name: 'shipments', description: 'Shipment CRUD and status' },
    { name: 'orders', description: 'Fulfilment order CRUD' },
    { name: 'carriers', description: 'Carrier and service listing' },
    { name: 'warehouses', description: 'Warehouse / fulfilment centre listing' },
    { name: 'trackingevents', description: 'Parcel tracking event history' },
    { name: 'rates', description: 'Shipping rate quotes' },
    { name: 'labels', description: 'Shipping label purchase and management' },
    { name: 'manifests', description: 'End-of-day carrier manifests' },
    { name: 'pickups', description: 'Carrier pickup scheduling and cancellation' },
    { name: 'webhooks', description: 'Inbound carrier webhook receiver' },
    { name: 'Sync', description: 'Background full-sync job management at `/v1/logistics/sync`. Auth: tenant-scoped Bearer key with `vertical:logistics` scope. Routes are mounted only when `dataStore.mode != passthrough`.' },
  ],

  paths: {
    '/health': {
      get: {
        summary: 'Health check',
        security: [],
        responses: {
          '200': {
            description: 'Service is healthy',
            content: {
              'application/json': {
                schema: { type: 'object', properties: { status: { type: 'string', enum: ['ok'] } } },
              },
            },
          },
        },
      },
    },

    // Auth routes documented in the unified spec — see control-plane-spec.ts.
    // Single `/auth/{vertical}/{platform}/*` covers all four verticals,
    // including the static-API-key POST variant for carriers without OAuth.

    // Connection management lives in the unified spec under the `Connections` tag
    // (see control-plane-spec.ts). Tenant clients use /v1/connections
    // (Bearer); operators use /connections (X-Admin-Secret).

    // Providers documented in the unified spec (control-plane-spec.ts).

    '/v1/shipments': {
      get: listGet('shipments', '#/components/schemas/Shipment', 'List shipments'),
      post: createPost('shipments', '#/components/schemas/Shipment', 'Create a shipment'),
    },
    '/v1/shipments/{id}': {
      get: withSingleExamples(
        singleGet('shipments', '#/components/schemas/Shipment', 'Get a shipment'),
        shipmentStateExamples,
      ),
      delete: deleteOp('shipments', 'Cancel a shipment'),
    },

    '/v1/orders': {
      get: listGet('orders', '#/components/schemas/Order', 'List orders'),
      post: createPost('orders', '#/components/schemas/Order', 'Create an order'),
    },
    '/v1/orders/{id}': {
      get: singleGet('orders', '#/components/schemas/Order', 'Get an order'),
      patch: updatePatch('orders', '#/components/schemas/Order', 'Update an order'),
      delete: deleteOp('orders', 'Cancel an order'),
    },

    '/v1/carriers': {
      get: listGet('carriers', '#/components/schemas/Carrier', 'List carriers'),
    },
    '/v1/carriers/{id}': {
      get: singleGet('carriers', '#/components/schemas/Carrier', 'Get a carrier'),
    },

    '/v1/warehouses': {
      get: listGet('warehouses', '#/components/schemas/Warehouse', 'List warehouses'),
    },
    '/v1/warehouses/{id}': {
      get: singleGet('warehouses', '#/components/schemas/Warehouse', 'Get a warehouse'),
    },

    // The path is hyphenated (`/v1/tracking-events`); the tag and the
    // router's RESOURCE constant are `trackingevents`.
    '/v1/tracking-events': {
      get: listGet('trackingevents', '#/components/schemas/TrackingEvent', 'List tracking events', [
        { name: 'tracking_number', in: 'query', description: 'Filter by tracking number.', schema: { type: 'string' } },
      ]),
    },
    '/v1/tracking-events/{trackingNumber}': {
      get: singleGet(
        'trackingevents',
        '#/components/schemas/TrackingEvent',
        'Get tracking events by tracking number',
        { name: 'trackingNumber', in: 'path', required: true, description: 'Carrier tracking number.', schema: { type: 'string' } },
      ),
    },

    '/v1/rates': {
      post: {
        tags: ['rates'],
        summary: 'Get shipping rate quotes',
        security: stdSecurity,
        parameters: [connectionIdParam],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['originAddress', 'destinationAddress', 'packages'],
                properties: {
                  originAddress: { type: 'object', description: 'Origin address', additionalProperties: true },
                  destinationAddress: { type: 'object', description: 'Destination address', additionalProperties: true },
                  packages: { type: 'array', items: { type: 'object', additionalProperties: true } },
                  serviceCodes: { type: 'array', items: { type: 'string' } },
                },
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'Rate quotes',
            content: { 'application/json': { schema: listEnvelope('#/components/schemas/Rate') } },
          },
          '400': { $ref: '#/components/responses/BadRequest' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '501': { $ref: '#/components/responses/NotImplemented' },
        },
      },
    },

    '/v1/labels': {
      get: listGet('labels', '#/components/schemas/Label', 'List labels'),
      post: createPost('labels', '#/components/schemas/Label', 'Purchase a shipping label'),
    },
    '/v1/labels/{id}': {
      get: singleGet('labels', '#/components/schemas/Label', 'Get a label'),
      delete: deleteOp('labels', 'Void a label'),
    },

    '/v1/manifests': {
      get: listGet('manifests', '#/components/schemas/Manifest', 'List manifests'),
      post: createPost('manifests', '#/components/schemas/Manifest', 'Create a manifest'),
    },
    '/v1/manifests/{id}': {
      get: singleGet('manifests', '#/components/schemas/Manifest', 'Get a manifest'),
    },

    '/v1/pickups': {
      get: {
        ...listGet('pickups', '#/components/schemas/Pickup', 'List pickups'),
        operationId: 'listPickups',
        description:
          'Only platforms that expose a pickup collection (EasyPost, AfterShip) implement this; carriers that schedule by confirmation number alone answer 501.',
      },
      post: {
        tags: ['pickups'],
        operationId: 'createPickup',
        summary: 'Schedule a pickup',
        security: stdSecurity,
        parameters: [connectionIdParam],
        requestBody: pickupRequestBody,
        responses: {
          '201': { description: 'Scheduled', content: { 'application/json': { schema: singleEnvelope('#/components/schemas/Pickup') } } },
          '400': { $ref: '#/components/responses/BadRequest' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '501': { $ref: '#/components/responses/NotImplemented' },
        },
      },
    },
    '/v1/pickups/{id}': {
      get: {
        ...singleGet('pickups', '#/components/schemas/Pickup', 'Get a pickup'),
        operationId: 'getPickupById',
      },
    },
    '/v1/pickups/{id}/cancel': {
      post: {
        tags: ['pickups'],
        operationId: 'cancelPickup',
        summary: 'Cancel a pickup',
        description:
          'A POST action answering 200 with the pickup in its final state, not a DELETE: FedEx and DHL cannot cancel by id alone, so the request may carry a body.',
        security: stdSecurity,
        parameters: [idParam, ...getQueryParams],
        requestBody: pickupCancelRequestBody,
        responses: {
          '200': { description: 'Cancelled', content: { 'application/json': { schema: singleEnvelope('#/components/schemas/Pickup') } } },
          '400': { $ref: '#/components/responses/BadRequest' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '404': { $ref: '#/components/responses/NotFound' },
          '501': { $ref: '#/components/responses/NotImplemented' },
        },
      },
    },

    // Sync paths live in the unified spec (control-plane-spec.ts).

    '/webhooks/{platform}': {
      post: {
        tags: ['webhooks'],
        summary: 'Inbound carrier webhook receiver',
        security: [],
        parameters: [
          platformPathParam,
          { name: 'x-carrier-signature', in: 'header', schema: { type: 'string' } },
        ],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { type: 'object', additionalProperties: true } } },
        },
        responses: {
          '200': {
            description: 'Webhook acknowledged',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    received: { type: 'boolean' },
                    eventCount: { type: 'integer' },
                  },
                },
              },
            },
          },
          '400': { $ref: '#/components/responses/BadRequest' },
        },
      },
    },
  },

  components: {
    // securitySchemes owned by `control-plane-spec.ts`. See accounting/openapi.ts
    // for context.

    responses: {
      BadRequest: {
        description: 'Bad request',
        content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
      },
      Unauthorized: {
        description: 'Unauthorized',
        content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
      },
      NotFound: {
        description: 'Resource not found',
        content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
      },
      NotImplemented: {
        description: 'This adapter does not implement this operation',
        content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
      },
    },

    schemas: {
      ...buildSyncOpenapiSchemas(),
      Provider: providerInfoSchema,
      Shipment: toSchema(ShipmentSchema, 'Shipment'),
      Order: toSchema(OrderSchema, 'Order'),
      Carrier: toSchema(CarrierSchema, 'Carrier'),
      Warehouse: toSchema(WarehouseSchema, 'Warehouse'),
      TrackingEvent: toSchema(TrackingEventSchema, 'TrackingEvent'),
      Rate: toSchema(RateSchema, 'Rate'),
      Label: toSchema(LabelSchema, 'Label'),
      Manifest: toSchema(ManifestSchema, 'Manifest'),
      Pickup: toSchema(PickupSchema, 'Pickup'),
      WebhookEvent: toSchema(WebhookEventSchema, 'WebhookEvent'),
    },
  },
  }
  return doc
}
