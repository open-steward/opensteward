/**
 * CartPanda adapter for the ecommerce vertical.
 *
 * Maps the CartPanda REST API (`https://app.cartpanda.com/api/v2/{slug}/`)
 * to the canonical ecommerce resources.
 *
 * Authentication uses a long-lived Bearer token generated in the CartPanda
 * dashboard — there is no OAuth code-exchange flow. The store slug (subdomain
 * before `.cartpanda.com`) must be passed alongside the token.
 *
 * Supported resources (CartPanda public API):
 *   - Products (list, get, create, update, delete) + Variants (list, get, update)
 *   - Customers (list, get, create, update)
 *   - Orders (list, get, create, update, cancel)
 *   - Fulfillments (create)
 *
 * Unsupported (auto-501, not in CartPanda's public API):
 *   Collections, Locations, Inventory, Refunds, Transactions, Discounts.
 *
 * Docs: https://dev.cartpanda.com/docs/cartx-api-doc
 */

// ── Resource coverage ──────────────────────────────────────────────
// Unavailable: inventory   — No dedicated endpoint; stock is a field on variant (quantity).
// Unavailable: location    — No locations API exists in CartPanda.
// Unavailable: refund      — No REST endpoint; surfaces only as order.refunded webhook + id stubs on order.
// Unavailable: transaction — No REST endpoint; surfaces only as id stubs nested on order.
// Unverified:  collection  — CartPanda v3 API has indexed doc pages for collections, but Stoplight docs are JS-rendered and unreadable; v3 base URL/auth vs v2 adapter unconfirmed.
// Unverified:  discount    — CartPanda v2 API has indexed doc pages for GET/POST /discounts, but Stoplight docs are JS-rendered and response field names cannot be confirmed.

import { customForm } from '@opensteward/shared'
import type { Credentials, QueryParams } from '@opensteward/shared'
import type { EcommerceAdapter } from '../../adapter/interface'
import type { Product, ProductVariant } from '../../schema/product'
import type { Customer } from '../../schema/customer'
import type { Order } from '../../schema/order'
import type { Fulfillment } from '../../schema/fulfillment'
import type { WebhookEvent } from '../../schema/webhook'

import { buildAuthUrl, exchangeCode as cartpandaExchangeCode } from './auth'
import { CartpandaClient } from './client'
import { DEFAULT_PAGE_SIZE } from './constants'
import { verifyCartpandaWebhook, parseCartpandaWebhookEvents } from './webhook'

import {
  transformProduct,
  untransformProduct,
  transformVariant,
  untransformVariant,
  type RawCartpandaProduct,
  type RawCartpandaVariant,
} from './transform/product'
import {
  transformCustomer,
  untransformCustomer,
  type RawCartpandaCustomer,
} from './transform/customer'
import {
  transformOrder,
  untransformOrder,
  type RawCartpandaOrder,
} from './transform/order'
import {
  transformFulfillment,
  untransformFulfillment,
  type RawCartpandaFulfillment,
} from './transform/fulfillment'

export interface CartpandaAdapterConfig {
  /**
   * Store slug (the part before `.cartpanda.com` in the store URL,
   * e.g. `mystore` for `mystore.cartpanda.com`).
   * May also be supplied per-connection via `credentials.extra.slug`.
   */
  slug?: string
}

// Connect Link form: single API key + slug.
const CREDENTIAL_FORM = customForm({
  fields: [
    {
      name: 'apiKey',
      label: 'API token',
      type: 'password' as const,
      required: true,
      helpText:
        'Find your token in the CartPanda dashboard under Profile → Token.',
    },
    {
      name: 'slug',
      label: 'Store slug',
      type: 'text' as const,
      required: true,
      placeholder: 'mystore',
      helpText:
        'The part before .cartpanda.com in your store URL, e.g. "mystore" for mystore.cartpanda.com.',
    },
  ],
  async exchange(fields): Promise<Credentials> {
    const token = (fields['apiKey'] ?? '').trim()
    const slug = (fields['slug'] ?? '').trim()
    if (!token) throw new Error('API token is required.')
    if (!slug) throw new Error('Store slug is required.')
    return { accessToken: token, extra: { slug } }
  },
})

export class CartpandaAdapter implements EcommerceAdapter {
  readonly platform = 'cartpanda'
  readonly version = '0.1.0'

  // Connect Link support.
  credentialFields = CREDENTIAL_FORM.credentialFields
  exchangeCredentials = CREDENTIAL_FORM.exchangeCredentials

  private configSlug: string | undefined

  constructor(config: CartpandaAdapterConfig = {}) {
    this.configSlug = config.slug
  }

  // ── Auth ──────────────────────────────────────────────────────────────────

  /**
   * Returns the CartPanda dashboard profile URL where the API token can be
   * found. CartPanda has no OAuth authorize URL.
   */
  getAuthUrl(_state: string): string {
    return buildAuthUrl()
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    // Throws a descriptive error — see ./auth.ts.
    return cartpandaExchangeCode()
  }

  /**
   * CartPanda tokens are long-lived and do not expire. Returning credentials
   * unchanged is correct.
   */
  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return credentials
  }

  // ── Webhooks ──────────────────────────────────────────────────────────────

  verifyWebhook(
    payload: Buffer,
    headers: Record<string, string>,
    secret: string,
  ): boolean {
    return verifyCartpandaWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    const topic =
      (payload['__topic'] as string | undefined) ??
      (payload['topic'] as string | undefined) ??
      (payload['event'] as string | undefined)
    return parseCartpandaWebhookEvents(payload, topic)
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private clientFor(credentials: Credentials): CartpandaClient {
    return new CartpandaClient(credentials, this.configSlug)
  }

  private listParams(params: QueryParams): Record<string, unknown> {
    const out: Record<string, unknown> = {
      per_page: params.limit ?? DEFAULT_PAGE_SIZE,
    }
    if (params.page != null) out['page'] = params.page
    if (params.updatedAfter) {
      out['updated_at_min'] = params.updatedAfter.toISOString()
    }
    return out
  }

  // ── Products ──────────────────────────────────────────────────────────────

  async listProducts(credentials: Credentials, params: QueryParams): Promise<Product[]> {
    const res = await this.clientFor(credentials).listWithPage<RawCartpandaProduct>(
      'products',
      'products',
      this.listParams(params),
    )
    return res.items.map((p) => transformProduct(p))
  }

  async getProduct(credentials: Credentials, id: string): Promise<Product> {
    const res = await this.clientFor(credentials).get<{ product: RawCartpandaProduct }>(
      `products/${id}`,
    )
    return transformProduct(res.product)
  }

  async createProduct(credentials: Credentials, data: Partial<Product>): Promise<Product> {
    const res = await this.clientFor(credentials).post<{ product: RawCartpandaProduct }>(
      'products',
      { product: untransformProduct(data) },
    )
    return transformProduct(res.product)
  }

  async updateProduct(
    credentials: Credentials,
    id: string,
    data: Partial<Product>,
  ): Promise<Product> {
    const res = await this.clientFor(credentials).put<{ product: RawCartpandaProduct }>(
      `products/${id}`,
      { product: { id, ...untransformProduct(data) } },
    )
    return transformProduct(res.product)
  }

  async deleteProduct(credentials: Credentials, id: string): Promise<void> {
    await this.clientFor(credentials).delete(`products/${id}`)
  }

  // ── Variants ──────────────────────────────────────────────────────────────

  async listVariants(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<ProductVariant[]> {
    const productId = (params['productId'] ?? params['product_id']) as string | undefined
    const client = this.clientFor(credentials)

    if (productId) {
      // Fetch variants nested under the product.
      const res = await client.get<{ variants: RawCartpandaVariant[] }>(
        `products/${productId}/variants`,
        this.listParams(params),
      )
      return (res.variants ?? []).map((v) => transformVariant(v))
    }

    // Fallback: list products and flatten their variants.
    const productsRes = await client.listWithPage<RawCartpandaProduct>(
      'products',
      'products',
      this.listParams(params),
    )
    return productsRes.items.flatMap((p) =>
      (p.variants ?? []).map((v) => transformVariant(v, 'BRL', p.options)),
    )
  }

  async getVariant(credentials: Credentials, id: string): Promise<ProductVariant> {
    // CartPanda variant ids may be scoped to a product. Support composite
    // `productId:variantId` ids — fall back to a bare id.
    const [first, second] = id.split(':')
    const client = this.clientFor(credentials)
    if (second) {
      const res = await client.get<{ variant: RawCartpandaVariant }>(
        `products/${first}/variants/${second}`,
      )
      return transformVariant(res.variant)
    }
    const res = await client.get<{ variant: RawCartpandaVariant }>(`variants/${id}`)
    return transformVariant(res.variant)
  }

  async updateVariant(
    credentials: Credentials,
    id: string,
    data: Partial<ProductVariant>,
  ): Promise<ProductVariant> {
    const [first, second] = id.split(':')
    const client = this.clientFor(credentials)
    if (second) {
      const res = await client.put<{ variant: RawCartpandaVariant }>(
        `products/${first}/variants/${second}`,
        { variant: { id: second, ...untransformVariant(data) } },
      )
      return transformVariant(res.variant)
    }
    const res = await client.put<{ variant: RawCartpandaVariant }>(
      `variants/${id}`,
      { variant: { id, ...untransformVariant(data) } },
    )
    return transformVariant(res.variant)
  }

  // ── Customers ─────────────────────────────────────────────────────────────

  async listCustomers(credentials: Credentials, params: QueryParams): Promise<Customer[]> {
    const res = await this.clientFor(credentials).listWithPage<RawCartpandaCustomer>(
      'customers',
      'customers',
      this.listParams(params),
    )
    return res.items.map(transformCustomer)
  }

  async getCustomer(credentials: Credentials, id: string): Promise<Customer> {
    const res = await this.clientFor(credentials).get<{ customer: RawCartpandaCustomer }>(
      `customers/${id}`,
    )
    return transformCustomer(res.customer)
  }

  async createCustomer(
    credentials: Credentials,
    data: Partial<Customer>,
  ): Promise<Customer> {
    const res = await this.clientFor(credentials).post<{ customer: RawCartpandaCustomer }>(
      'customers',
      { customer: untransformCustomer(data) },
    )
    return transformCustomer(res.customer)
  }

  async updateCustomer(
    credentials: Credentials,
    id: string,
    data: Partial<Customer>,
  ): Promise<Customer> {
    const res = await this.clientFor(credentials).put<{ customer: RawCartpandaCustomer }>(
      `customers/${id}`,
      { customer: { id, ...untransformCustomer(data) } },
    )
    return transformCustomer(res.customer)
  }

  // ── Orders ────────────────────────────────────────────────────────────────

  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const res = await this.clientFor(credentials).listWithPage<RawCartpandaOrder>(
      'orders',
      'orders',
      this.listParams(params),
    )
    return res.items.map(transformOrder)
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const res = await this.clientFor(credentials).get<{ order: RawCartpandaOrder }>(
      `orders/${id}`,
    )
    return transformOrder(res.order)
  }

  async createOrder(credentials: Credentials, data: Partial<Order>): Promise<Order> {
    const res = await this.clientFor(credentials).post<{ order: RawCartpandaOrder }>(
      'orders',
      { order: untransformOrder(data) },
    )
    return transformOrder(res.order)
  }

  async updateOrder(
    credentials: Credentials,
    id: string,
    data: Partial<Order>,
  ): Promise<Order> {
    const res = await this.clientFor(credentials).put<{ order: RawCartpandaOrder }>(
      `orders/${id}`,
      { order: { id, ...untransformOrder(data) } },
    )
    return transformOrder(res.order)
  }

  async cancelOrder(
    credentials: Credentials,
    id: string,
    data?: { reason?: string },
  ): Promise<Order> {
    const res = await this.clientFor(credentials).post<{ order: RawCartpandaOrder }>(
      `orders/${id}/cancel`,
      { reason: data?.reason },
    )
    return transformOrder(res.order)
  }

  // ── Fulfillments ──────────────────────────────────────────────────────────

  async createFulfillment(
    credentials: Credentials,
    data: Partial<Fulfillment>,
  ): Promise<Fulfillment> {
    if (!data.orderId) throw new Error('createFulfillment requires orderId')
    const res = await this.clientFor(credentials).post<{ fulfillment: RawCartpandaFulfillment }>(
      `orders/${data.orderId}/fulfillments`,
      { fulfillment: untransformFulfillment(data) },
    )
    return transformFulfillment(res.fulfillment)
  }
}
