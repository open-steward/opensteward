/**
 * Builds the payments-vertical OpenAPI document. Imported by the unified
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
import { CustomerSchema } from './schema/customer'
import { PaymentMethodSchema } from './schema/payment-method'
import { ChargeSchema } from './schema/charge'
import { RefundSchema } from './schema/refund'
import { SubscriptionSchema } from './schema/subscription'
import { InvoiceSchema, InvoiceLineItemSchema } from './schema/invoice'
import { PayoutSchema } from './schema/payout'
import { DisputeSchema } from './schema/dispute'
import { PlanSchema, PriceSchema, ProductSchema } from './schema/plan'
import { BalanceTransactionSchema } from './schema/balance-transaction'

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
  description: 'Platform slug (e.g. `stripe`, `paypal`, `adyen`).',
  schema: { type: 'string', enum: PLATFORM_SLUGS },
}

const connectionIdParam = {
  name: 'connection_id',
  in: 'query',
  required: true,
  description:
    'UUID of the stored connection to use. Returned by the OAuth callback (`GET /auth/{platform}/callback`). Store it against your end-user record and pass it on every request.',
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

const listQueryParams = [connectionIdParam, limitParam, pageParam, cursorParam, updatedAfterParam]
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

function listOp(meta: OpMeta) {
  return {
    tags: [meta.tag],
    operationId: meta.operationId,
    summary: meta.summary,
    description: meta.description,
    parameters: listQueryParams,
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
// (sibling of `schema`). Used on the flagship Charge resource.
function withSingleExamples<T>(op: T, examples: Record<string, unknown>): T {
  const responses = (op as { responses: Record<string, { content?: Record<string, Record<string, unknown>> }> }).responses
  const content = responses['200']?.content?.['application/json']
  if (content) content['examples'] = examples
  return op
}

// Flagship Charge state examples — succeeded vs refunded, sharing the Acme /
// Jane Doe / stripe story; only the status and refund fields vary. Each is a
// full valid Charge body wrapped in the single-resource envelope.
const chargeBase = {
  id: 'ch_1042',
  externalId: 'ch_1042',
  amount: 125000,
  currency: 'USD',
  amountCaptured: 125000,
  captured: true,
  capturedAt: '2026-01-15T09:30:00Z',
  customerId: 'cus_4Qm2Xa9Lr',
  paymentMethodId: 'pm_1042',
  invoiceId: 'inv_1042',
  description: 'Invoice INV-1042',
  statementDescriptor: 'ACME INV-1042',
  receiptUrl: 'https://pay.stripe.com/receipts/ch_1042',
  receiptEmail: 'jane.doe@acme.example',
  disputeIds: [],
  gateway: 'stripe',
  metadata: { orderId: 'ord_1042' },
  createdAt: '2026-01-15T09:30:00Z',
  updatedAt: '2026-02-01T14:20:00Z',
}
const chargeStateExamples = {
  succeeded: {
    summary: 'Succeeded — captured in full, nothing refunded',
    value: {
      data: { ...chargeBase, status: 'succeeded', amountRefunded: 0, refundIds: [] },
    },
  },
  refunded: {
    summary: 'Refunded — full amount returned to the customer',
    value: {
      data: {
        ...chargeBase,
        status: 'refunded',
        amountRefunded: 125000,
        refundIds: ['re_1042'],
        updatedAt: '2026-02-20T00:00:00Z',
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
      '201': { description: 'Created', content: { 'application/json': { schema: singleEnvelope(meta.schemaRef) } } },
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
      '200': { description: 'Updated', content: { 'application/json': { schema: singleEnvelope(meta.schemaRef) } } },
      '400': errorResponse400,
      '401': errorResponse401,
      '404': errorResponse404,
      '501': errorResponse501,
    },
  }
}

function deleteOp(tag: string, operationId: string, summary: string, description: string) {
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

componentSchemas.CustomerSchema = toSchema(CustomerSchema, 'CustomerSchema')
componentSchemas.PaymentMethodSchema = toSchema(PaymentMethodSchema, 'PaymentMethodSchema')
componentSchemas.ChargeSchema = toSchema(ChargeSchema, 'ChargeSchema')
componentSchemas.RefundSchema = toSchema(RefundSchema, 'RefundSchema')
componentSchemas.SubscriptionSchema = toSchema(SubscriptionSchema, 'SubscriptionSchema')
componentSchemas.InvoiceSchema = toSchema(InvoiceSchema, 'InvoiceSchema')
componentSchemas.InvoiceLineItemSchema = toSchema(InvoiceLineItemSchema, 'InvoiceLineItemSchema')
componentSchemas.PayoutSchema = toSchema(PayoutSchema, 'PayoutSchema')
componentSchemas.DisputeSchema = toSchema(DisputeSchema, 'DisputeSchema')
componentSchemas.PlanSchema = toSchema(PlanSchema, 'PlanSchema')
componentSchemas.PriceSchema = toSchema(PriceSchema, 'PriceSchema')
componentSchemas.ProductSchema = toSchema(ProductSchema, 'ProductSchema')
componentSchemas.BalanceTransactionSchema = toSchema(
  BalanceTransactionSchema,
  'BalanceTransactionSchema',
)

componentSchemas.ChargeCaptureRequest = {
  type: 'object',
  properties: {
    amount: {
      type: 'integer',
      description: 'Amount to capture in minor units. Defaults to the full authorisation.',
      example: 125000,
    },
  },
}

componentSchemas.SubscriptionCancelRequest = {
  type: 'object',
  properties: {
    atPeriodEnd: {
      type: 'boolean',
      description: 'When true, schedule the cancellation for the end of the current billing period.',
      example: true,
    },
  },
}

componentSchemas.DisputeEvidenceRequest = {
  type: 'object',
  description: 'Free-form bag of gateway-specific evidence fields (varies per platform).',
  additionalProperties: true,
}

Object.assign(componentSchemas, buildSyncOpenapiSchemas())

const paths: Record<string, Record<string, unknown>> = {
  // ── Customers ─────────────────────────────────────────────────────────────
  '/v1/customers': {
    get: listOp({
      tag: 'Customers',
      schemaRef: '#/components/schemas/CustomerSchema',
      operationId: 'listPaymentsCustomers',
      summary: 'List customers',
      description: 'Returns all gateway customer records visible to the authenticated connection.',
    }),
    post: createOp({
      tag: 'Customers',
      schemaRef: '#/components/schemas/CustomerSchema',
      operationId: 'createPaymentsCustomer',
      summary: 'Create customer',
      description: 'Creates a new customer in the upstream gateway.',
    }),
  },
  '/v1/customers/{id}': {
    get: getOp({
      tag: 'Customers',
      schemaRef: '#/components/schemas/CustomerSchema',
      operationId: 'getPaymentsCustomer',
      summary: 'Get customer',
      description: 'Fetches a single customer by ID.',
    }),
    patch: updateOp({
      tag: 'Customers',
      schemaRef: '#/components/schemas/CustomerSchema',
      operationId: 'updatePaymentsCustomer',
      summary: 'Update customer',
      description: 'Partially updates a customer.',
    }),
    delete: deleteOp(
      'Customers',
      'deletePaymentsCustomer',
      'Delete customer',
      'Deletes a customer. Some gateways soft-delete and retain historical charges.',
    ),
  },

  // ── Payment methods ───────────────────────────────────────────────────────
  '/v1/payment_methods': {
    get: listOp({
      tag: 'PaymentMethods',
      schemaRef: '#/components/schemas/PaymentMethodSchema',
      operationId: 'listPaymentMethods',
      summary: 'List payment methods',
      description: 'Returns saved payment methods (cards, bank accounts, wallets, mandates).',
    }),
  },
  '/v1/payment_methods/{id}': {
    get: getOp({
      tag: 'PaymentMethods',
      schemaRef: '#/components/schemas/PaymentMethodSchema',
      operationId: 'getPaymentMethod',
      summary: 'Get payment method',
      description: 'Fetches a single payment method by ID.',
    }),
    delete: deleteOp(
      'PaymentMethods',
      'detachPaymentMethod',
      'Detach payment method',
      'Detaches the payment method from the customer it is currently attached to.',
    ),
  },

  // ── Charges ───────────────────────────────────────────────────────────────
  '/v1/charges': {
    get: listOp({
      tag: 'Charges',
      schemaRef: '#/components/schemas/ChargeSchema',
      operationId: 'listCharges',
      summary: 'List charges',
      description: 'Returns charge / payment intent records with their refund + dispute references.',
    }),
    post: createOp({
      tag: 'Charges',
      schemaRef: '#/components/schemas/ChargeSchema',
      operationId: 'createCharge',
      summary: 'Create charge',
      description: 'Creates a new charge. Some gateways require a separate `capture` step.',
    }),
  },
  '/v1/charges/{id}': {
    get: withSingleExamples(
      getOp({
        tag: 'Charges',
        schemaRef: '#/components/schemas/ChargeSchema',
        operationId: 'getCharge',
        summary: 'Get charge',
        description: 'Fetches a single charge by ID.',
      }),
      chargeStateExamples,
    ),
  },
  '/v1/charges/{id}/capture': {
    post: actionOp(
      {
        tag: 'Charges',
        schemaRef: '#/components/schemas/ChargeSchema',
        operationId: 'captureCharge',
        summary: 'Capture an uncaptured charge',
        description:
          'Captures funds previously authorised. Omit `amount` to capture the full authorisation.',
      },
      '#/components/schemas/ChargeCaptureRequest',
    ),
  },
  '/v1/charges/{id}/cancel': {
    post: actionOp({
      tag: 'Charges',
      schemaRef: '#/components/schemas/ChargeSchema',
      operationId: 'cancelCharge',
      summary: 'Cancel an uncaptured charge',
      description: 'Voids an uncaptured authorisation. Already-captured charges must be refunded instead.',
    }),
  },

  // ── Refunds ───────────────────────────────────────────────────────────────
  '/v1/refunds': {
    get: listOp({
      tag: 'Refunds',
      schemaRef: '#/components/schemas/RefundSchema',
      operationId: 'listRefunds',
      summary: 'List refunds',
      description: 'Returns refund records — partial or full — issued against charges.',
    }),
    post: createOp({
      tag: 'Refunds',
      schemaRef: '#/components/schemas/RefundSchema',
      operationId: 'createRefund',
      summary: 'Create refund',
      description: 'Issues a refund against an existing charge.',
    }),
  },
  '/v1/refunds/{id}': {
    get: getOp({
      tag: 'Refunds',
      schemaRef: '#/components/schemas/RefundSchema',
      operationId: 'getRefund',
      summary: 'Get refund',
      description: 'Fetches a single refund by ID.',
    }),
  },

  // ── Subscriptions ─────────────────────────────────────────────────────────
  '/v1/subscriptions': {
    get: listOp({
      tag: 'Subscriptions',
      schemaRef: '#/components/schemas/SubscriptionSchema',
      operationId: 'listSubscriptions',
      summary: 'List subscriptions',
      description: 'Returns recurring-billing records with their items and dunning state.',
    }),
    post: createOp({
      tag: 'Subscriptions',
      schemaRef: '#/components/schemas/SubscriptionSchema',
      operationId: 'createSubscription',
      summary: 'Create subscription',
      description: 'Subscribes a customer to one or more prices/plans.',
    }),
  },
  '/v1/subscriptions/{id}': {
    get: getOp({
      tag: 'Subscriptions',
      schemaRef: '#/components/schemas/SubscriptionSchema',
      operationId: 'getSubscription',
      summary: 'Get subscription',
      description: 'Fetches a single subscription by ID.',
    }),
    patch: updateOp({
      tag: 'Subscriptions',
      schemaRef: '#/components/schemas/SubscriptionSchema',
      operationId: 'updateSubscription',
      summary: 'Update subscription',
      description: 'Adjusts items, payment methods, or scheduling on an active subscription.',
    }),
  },
  '/v1/subscriptions/{id}/cancel': {
    post: actionOp(
      {
        tag: 'Subscriptions',
        schemaRef: '#/components/schemas/SubscriptionSchema',
        operationId: 'cancelSubscription',
        summary: 'Cancel subscription',
        description: 'Cancels a subscription immediately, or at the period end when `atPeriodEnd: true`.',
      },
      '#/components/schemas/SubscriptionCancelRequest',
    ),
  },

  // ── Invoices ──────────────────────────────────────────────────────────────
  '/v1/invoices': {
    get: listOp({
      tag: 'Invoices',
      schemaRef: '#/components/schemas/InvoiceSchema',
      operationId: 'listInvoices',
      summary: 'List invoices',
      description: 'Returns invoices including subscription-generated invoices and standalone invoices.',
    }),
    post: createOp({
      tag: 'Invoices',
      schemaRef: '#/components/schemas/InvoiceSchema',
      operationId: 'createInvoice',
      summary: 'Create invoice',
      description: 'Drafts a new invoice on the gateway.',
    }),
  },
  '/v1/invoices/{id}': {
    get: getOp({
      tag: 'Invoices',
      schemaRef: '#/components/schemas/InvoiceSchema',
      operationId: 'getInvoice',
      summary: 'Get invoice',
      description: 'Fetches a single invoice by ID.',
    }),
    patch: updateOp({
      tag: 'Invoices',
      schemaRef: '#/components/schemas/InvoiceSchema',
      operationId: 'updateInvoice',
      summary: 'Update invoice',
      description: 'Updates a draft invoice. Finalised invoices are typically immutable.',
    }),
  },
  '/v1/invoices/{id}/void': {
    post: actionOp({
      tag: 'Invoices',
      schemaRef: '#/components/schemas/InvoiceSchema',
      operationId: 'voidInvoice',
      summary: 'Void invoice',
      description: 'Marks an open invoice as void. Amount due drops to zero.',
    }),
  },
  '/v1/invoices/{id}/pay': {
    post: actionOp({
      tag: 'Invoices',
      schemaRef: '#/components/schemas/InvoiceSchema',
      operationId: 'payInvoice',
      summary: 'Pay invoice',
      description: "Charges the invoice's default payment method.",
    }),
  },
  '/v1/invoices/{id}/line_items': {
    get: {
      tags: ['Invoices'],
      operationId: 'listInvoiceLineItems',
      summary: 'List invoice line items',
      description: 'Returns the line items on the given invoice.',
      parameters: [connectionIdParam, idPathParam, limitParam, pageParam, cursorParam],
      responses: {
        '200': {
          description: 'Success',
          content: {
            'application/json': { schema: listEnvelope('#/components/schemas/InvoiceLineItemSchema') },
          },
        },
        '400': errorResponse400,
        '401': errorResponse401,
        '404': errorResponse404,
        '501': errorResponse501,
      },
    },
  },

  // ── Payouts ───────────────────────────────────────────────────────────────
  '/v1/payouts': {
    get: listOp({
      tag: 'Payouts',
      schemaRef: '#/components/schemas/PayoutSchema',
      operationId: 'listPayouts',
      summary: 'List payouts',
      description: 'Returns gateway-to-bank settlement records.',
    }),
  },
  '/v1/payouts/{id}': {
    get: getOp({
      tag: 'Payouts',
      schemaRef: '#/components/schemas/PayoutSchema',
      operationId: 'getPayout',
      summary: 'Get payout',
      description: 'Fetches a single payout by ID.',
    }),
  },

  // ── Disputes ──────────────────────────────────────────────────────────────
  '/v1/disputes': {
    get: listOp({
      tag: 'Disputes',
      schemaRef: '#/components/schemas/DisputeSchema',
      operationId: 'listDisputes',
      summary: 'List disputes',
      description: 'Returns chargeback / dispute records with evidence-submission deadlines.',
    }),
  },
  '/v1/disputes/{id}': {
    get: getOp({
      tag: 'Disputes',
      schemaRef: '#/components/schemas/DisputeSchema',
      operationId: 'getDispute',
      summary: 'Get dispute',
      description: 'Fetches a single dispute by ID.',
    }),
  },
  '/v1/disputes/{id}/evidence': {
    post: actionOp(
      {
        tag: 'Disputes',
        schemaRef: '#/components/schemas/DisputeSchema',
        operationId: 'submitDisputeEvidence',
        summary: 'Submit dispute evidence',
        description: 'Uploads merchant evidence to contest a dispute.',
      },
      '#/components/schemas/DisputeEvidenceRequest',
    ),
  },

  // ── Plans / Prices / Products (optional catalog) ─────────────────────────
  '/v1/plans': {
    get: listOp({
      tag: 'Catalog',
      schemaRef: '#/components/schemas/PlanSchema',
      operationId: 'listPlans',
      summary: 'List plans',
      description: 'Catalog: subscription plans. Returns `501` on gateways without a Plan resource.',
    }),
  },
  '/v1/plans/{id}': {
    get: getOp({
      tag: 'Catalog',
      schemaRef: '#/components/schemas/PlanSchema',
      operationId: 'getPlan',
      summary: 'Get plan',
      description: 'Fetches a single plan by ID.',
    }),
  },
  '/v1/prices': {
    get: listOp({
      tag: 'Catalog',
      schemaRef: '#/components/schemas/PriceSchema',
      operationId: 'listPrices',
      summary: 'List prices',
      description: 'Catalog: prices for products. Returns `501` on gateways without a Price resource.',
    }),
  },
  '/v1/prices/{id}': {
    get: getOp({
      tag: 'Catalog',
      schemaRef: '#/components/schemas/PriceSchema',
      operationId: 'getPrice',
      summary: 'Get price',
      description: 'Fetches a single price by ID.',
    }),
  },
  '/v1/products': {
    get: listOp({
      tag: 'Catalog',
      schemaRef: '#/components/schemas/ProductSchema',
      operationId: 'listProducts',
      summary: 'List products',
      description: 'Catalog: products sold under one or more prices.',
    }),
  },
  '/v1/products/{id}': {
    get: getOp({
      tag: 'Catalog',
      schemaRef: '#/components/schemas/ProductSchema',
      operationId: 'getProduct',
      summary: 'Get product',
      description: 'Fetches a single product by ID.',
    }),
  },

  // ── Balance transactions (optional) ──────────────────────────────────────
  '/v1/balance_transactions': {
    get: listOp({
      tag: 'BalanceTransactions',
      schemaRef: '#/components/schemas/BalanceTransactionSchema',
      operationId: 'listBalanceTransactions',
      summary: 'List balance transactions',
      description:
        'Returns the per-line ledger of charges, refunds, payouts, fees, and adjustments that make up the gateway balance.',
    }),
  },
  '/v1/balance_transactions/{id}': {
    get: getOp({
      tag: 'BalanceTransactions',
      schemaRef: '#/components/schemas/BalanceTransactionSchema',
      operationId: 'getBalanceTransaction',
      summary: 'Get balance transaction',
      description: 'Fetches a single balance transaction by ID.',
    }),
  },

  // ── Webhooks ─────────────────────────────────────────────────────────────
  '/webhooks/{platform}': {
    post: {
      tags: ['Webhooks'],
      summary: 'Receive a platform webhook',
      operationId: 'receivePaymentsWebhook',
      description: 'Verifies the incoming webhook signature and emits a canonical payments `WebhookEvent`.',
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
      operationId: 'paymentsHealth',
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
      title: 'Payments API',
      version: '0.1.0',
      license: { name: 'Elastic-2.0', url: 'https://github.com/open-steward/opensteward/blob/main/LICENSE' },
      description: `Unified REST API for payment gateways (Stripe, PayPal, Adyen, Square, Braintree, Mollie, Checkout.com, GoCardless, Razorpay, Mercado Pago, …).

## Money

All amounts are integer **minor units** (e.g. cents, paise, satoshi) paired with an ISO 4217 currency. No floats, no decimal strings. Convert at the edge of your application.

## Authentication

Every \`/v1/*\` request must include the \`connection_id\` query parameter — a UUID returned by the OAuth callback. The connection row carries its own platform, tenant, and credentials, so no \`X-Provider\` / \`X-Tenant-Id\` headers are needed.

## Response envelopes

- **List:** \`{ data: T[] }\`
- **Single:** \`{ data: T }\`

Every resource carries the unmodified upstream payload under \`raw\` (opt-in via \`?include_raw=true\`) and the gateway's own metadata bucket under \`metadata\`.

## Unsupported operations

Unimplemented adapter operations return \`501 Not Implemented\`. Payment gateways diverge widely on capabilities — this is a first-class state, not a bug.
`,
    },
    servers: [
      { url: 'http://localhost:3010', description: 'Local (integration-server via docker compose)' },
    ],
    tags: [
      { name: 'Customers', description: 'Gateway customer records. Full CRUD.' },
      { name: 'PaymentMethods', description: 'Saved cards, bank accounts, wallets, mandates.' },
      { name: 'Charges', description: 'Charges / payment intents. List, get, create, capture, cancel.' },
      { name: 'Refunds', description: 'Full or partial refunds against charges.' },
      { name: 'Subscriptions', description: 'Recurring-billing records. List, get, create, update, cancel.' },
      { name: 'Invoices', description: 'Invoices (subscription-generated and standalone), line items, void, pay.' },
      { name: 'Payouts', description: 'Gateway-to-bank settlements. Read-only.' },
      { name: 'Disputes', description: 'Chargebacks / disputes and evidence submission.' },
      { name: 'Catalog', description: 'Catalog records: plans, prices, products. Absent on many gateways (`501` when unsupported).' },
      { name: 'BalanceTransactions', description: 'Ledger of every balance-affecting event. Absent on many gateways (`501` when unsupported).' },
      { name: 'Auth', description: 'OAuth 2.0 flows — connect, callback, revoke.' },
      { name: 'Sync', description: 'Background full-sync job management at `/v1/payments/sync`.' },
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
