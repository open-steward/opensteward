/**
 * SendOwl adapter for the ecommerce vertical.
 *
 * Maps SendOwl's REST API (https://dashboard.sendowl.com/developers/api/introduction)
 * to the canonical ecommerce resources. SendOwl is a digital-goods /
 * subscription checkout + delivery backend, not a browsable storefront:
 * there are no variants, collections, physical locations, inventory,
 * fulfillments (delivery is automatic), or a customer-CRUD resource.
 *
 * Auth: HTTP Basic with a static per-merchant API key + secret pair
 * (Settings → Advanced settings → Developer → SendOwl API) — no OAuth.
 *
 * ── Resource coverage ────────────────────────────────────────────────────
 * Available: product, discount, order (list/get/update — no generic create;
 *   orders arise from checkout or `POST /api/v1/products/{id}/issue`),
 *   refund (embedded on the order — see `./transform/refund.ts`).
 * Unavailable: variant, collection, location, inventory, fulfillment,
 *   customer, transaction — see `./metadata.ts` for the documented reason
 *   for each.
 */
import { reportUpstreamPage } from '@opensteward/shared'
import type { Credentials, QueryParams } from '@opensteward/shared'
import type { EcommerceAdapter } from '../../adapter/interface'
import type { Product } from '../../schema/product'
import type { Order } from '../../schema/order'
import type { Refund } from '../../schema/refund'
import type { Discount } from '../../schema/discount'
import type { WebhookEvent } from '../../schema/webhook'

import { buildAuthUrl, exchangeCode as sendowlExchangeCode } from './auth'
import { SendOwlClient } from './client'
import { V1_BASE, DISCOUNTS_BASE, ORDERS_BASE, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'
import { verifySendOwlWebhook, parseSendOwlWebhookEvents } from './webhook'

import {
  transformProduct,
  untransformProduct,
  type RawSendOwlProduct,
} from './transform/product'
import {
  transformDiscount,
  untransformDiscount,
  type RawSendOwlDiscount,
} from './transform/discount'
import {
  transformOrder,
  untransformOrder,
  type RawSendOwlOrder,
} from './transform/order'
import { extractRefunds } from './transform/refund'

// ── Connect Link form (api_key + api_secret) ──────────────────────────────

function credentialFields() {
  return [
    {
      name: 'apiKey',
      label: 'API key',
      type: 'text' as const,
      required: true,
      helpText: 'Settings → Advanced settings → Developer → SendOwl API.',
    },
    {
      name: 'apiSecret',
      label: 'API secret',
      type: 'password' as const,
      required: true,
      helpText: 'Shown next to the API key on the same page.',
    },
  ]
}

async function exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
  const apiKey = (fields['apiKey'] ?? '').trim()
  const apiSecret = (fields['apiSecret'] ?? '').trim()
  if (!apiKey) throw new Error('API key is required.')
  if (!apiSecret) throw new Error('API secret is required.')
  return { accessToken: apiKey, extra: { apiKey, apiSecret } }
}

export type SendowlAdapterConfig = Record<string, never>

export class SendowlAdapter implements EcommerceAdapter {
  readonly platform = 'sendowl'
  readonly version = '0.1.0'
  readonly capabilities = { maxPageSize: MAX_PAGE_SIZE }

  credentialFields = credentialFields
  exchangeCredentials = exchangeCredentials

  constructor(_config: SendowlAdapterConfig = {}) {}

  // ── Auth ──────────────────────────────────────────────────────────────────

  getAuthUrl(_state: string): string {
    return buildAuthUrl()
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    return sendowlExchangeCode()
  }

  /** SendOwl API keys are static and do not expire. */
  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return credentials
  }

  // ── Webhooks ──────────────────────────────────────────────────────────────

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return verifySendOwlWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parseSendOwlWebhookEvents(payload)
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private clientFor(credentials: Credentials): SendOwlClient {
    return new SendOwlClient(credentials)
  }

  private listParams(params: QueryParams): Record<string, unknown> {
    return {
      per_page: params.limit ?? DEFAULT_PAGE_SIZE,
      page: params.page ?? 1,
    }
  }

  // ── Products ──────────────────────────────────────────────────────────────

  async listProducts(credentials: Credentials, params: QueryParams): Promise<Product[]> {
    const res = await this.clientFor(credentials).listWithPage<RawSendOwlProduct>(
      `${V1_BASE}/products`,
      'product',
      this.listParams(params),
    )
    reportUpstreamPage(params, { hasMore: res.hasMore })
    return res.items.map(transformProduct)
  }

  async getProduct(credentials: Credentials, id: string): Promise<Product> {
    const res = await this.clientFor(credentials).get<{ product: RawSendOwlProduct }>(
      `${V1_BASE}/products/${id}`,
    )
    return transformProduct(res.product)
  }

  async createProduct(credentials: Credentials, data: Partial<Product>): Promise<Product> {
    const res = await this.clientFor(credentials).post<{ product: RawSendOwlProduct }>(
      `${V1_BASE}/products`,
      { product: untransformProduct(data) },
    )
    return transformProduct(res.product)
  }

  async updateProduct(
    credentials: Credentials,
    id: string,
    data: Partial<Product>,
  ): Promise<Product> {
    const res = await this.clientFor(credentials).put<{ product: RawSendOwlProduct }>(
      `${V1_BASE}/products/${id}`,
      { product: untransformProduct(data) },
    )
    return transformProduct(res.product)
  }

  async deleteProduct(credentials: Credentials, id: string): Promise<void> {
    await this.clientFor(credentials).delete(`${V1_BASE}/products/${id}`)
  }

  // ── Discounts ─────────────────────────────────────────────────────────────

  async listDiscounts(credentials: Credentials, params: QueryParams): Promise<Discount[]> {
    const res = await this.clientFor(credentials).listWithPage<RawSendOwlDiscount>(
      `${DISCOUNTS_BASE}/discounts`,
      'discount',
      this.listParams(params),
    )
    reportUpstreamPage(params, { hasMore: res.hasMore })
    return res.items.map((d) => transformDiscount(d))
  }

  async getDiscount(credentials: Credentials, id: string): Promise<Discount> {
    const res = await this.clientFor(credentials).get<{ discount: RawSendOwlDiscount }>(
      `${DISCOUNTS_BASE}/discounts/${id}`,
    )
    return transformDiscount(res.discount)
  }

  async createDiscount(credentials: Credentials, data: Partial<Discount>): Promise<Discount> {
    const res = await this.clientFor(credentials).post<{ discount: RawSendOwlDiscount }>(
      `${DISCOUNTS_BASE}/discounts`,
      { discount: untransformDiscount(data) },
    )
    return transformDiscount(res.discount)
  }

  async updateDiscount(
    credentials: Credentials,
    id: string,
    data: Partial<Discount>,
  ): Promise<Discount> {
    const res = await this.clientFor(credentials).put<{ discount: RawSendOwlDiscount }>(
      `${DISCOUNTS_BASE}/discounts/${id}`,
      { discount: untransformDiscount(data) },
    )
    return transformDiscount(res.discount)
  }

  async deleteDiscount(credentials: Credentials, id: string): Promise<void> {
    await this.clientFor(credentials).delete(`${DISCOUNTS_BASE}/discounts/${id}`)
  }

  // ── Orders ────────────────────────────────────────────────────────────────
  //
  // No createOrder / cancelOrder: SendOwl has no generic order-create
  // endpoint ("You cannot create an order containing multiple items through
  // the API" — orders arise from checkout, or from
  // `POST /api/v1/products/{id}/issue` for a single free/comped product,
  // which is not a general "create this order" primitive), and no
  // documented order-cancellation endpoint (only
  // `PUT /api/v1/orders/{id}/cancel_subscription`, which cancels a
  // recurring subscription rather than the order itself).

  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const res = await this.clientFor(credentials).listWithPage<RawSendOwlOrder>(
      `${ORDERS_BASE}/orders`,
      'order',
      this.listParams(params),
    )
    reportUpstreamPage(params, { hasMore: res.hasMore })
    return res.items.map(transformOrder)
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const res = await this.clientFor(credentials).get<{ order: RawSendOwlOrder }>(
      `${ORDERS_BASE}/orders/${id}`,
    )
    return transformOrder(res.order)
  }

  async updateOrder(credentials: Credentials, id: string, data: Partial<Order>): Promise<Order> {
    const res = await this.clientFor(credentials).put<{ order: RawSendOwlOrder }>(
      `${ORDERS_BASE}/orders/${id}`,
      untransformOrder(data),
    )
    return transformOrder(res.order)
  }

  // ── Refunds ───────────────────────────────────────────────────────────────
  //
  // SendOwl has no standalone refund resource — see `./transform/refund.ts`.
  // The sync worker calls list methods with only `{ page, limit }`, so the
  // unscoped path pages through orders (the one thing SendOwl does paginate)
  // and flattens each order's embedded `refund_transactions`. An explicit
  // `order_id`/`orderId` filter (used internally by `getRefund`/
  // `createRefund`, and available to any other caller that has one) scopes
  // to a single order's refunds instead.

  async listRefunds(credentials: Credentials, params: QueryParams): Promise<Refund[]> {
    const orderId = params['order_id'] ?? params['orderId']
    const client = this.clientFor(credentials)
    if (orderId) {
      const res = await client.get<{ order: RawSendOwlOrder }>(`${ORDERS_BASE}/orders/${String(orderId)}`)
      return extractRefunds(String(orderId), res.order.refund_transactions)
    }
    const res = await client.listWithPage<RawSendOwlOrder>(`${ORDERS_BASE}/orders`, 'order', this.listParams(params))
    reportUpstreamPage(params, { hasMore: res.hasMore })
    return res.items.flatMap((order) => extractRefunds(String(order.id), order.refund_transactions))
  }

  async getRefund(credentials: Credentials, id: string): Promise<Refund> {
    const [orderId, index] = id.split(':')
    if (!orderId || index == null) {
      throw new Error('Invalid refund id format: expected `orderId:index`')
    }
    const refunds = await this.listRefunds(credentials, { order_id: orderId })
    const refund = refunds[Number(index)]
    if (!refund) throw new Error(`Refund not found: ${id}`)
    return refund
  }

  async createRefund(credentials: Credentials, data: Partial<Refund>): Promise<Refund> {
    if (!data.orderId) throw new Error('createRefund requires orderId')
    if (!data.amount) throw new Error('createRefund requires amount')
    const amountDecimal = (data.amount.amount / 100).toFixed(2)
    const client = this.clientFor(credentials)
    await client.post(`${V1_BASE}/orders/${data.orderId}/refund`, {
      amount: amountDecimal,
    })
    // The refund endpoint returns only a success status — re-fetch the order
    // to read back the (now-appended) refund_transactions and return the
    // last one, which is the refund we just created.
    const refunds = await this.listRefunds(credentials, { order_id: data.orderId })
    const last = refunds[refunds.length - 1]
    if (!last) throw new Error('Refund succeeded but the order reported no refund_transactions')
    return last
  }
}
