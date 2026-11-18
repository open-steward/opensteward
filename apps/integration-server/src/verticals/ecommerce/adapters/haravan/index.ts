/**
 * Haravan adapter for the ecommerce vertical.
 *
 * Maps Haravan's Omni REST API (Shopify-shaped, but with global OAuth hosts
 * and its own quirks — see auth.ts/client.ts/transform/*.ts for citations) to
 * the canonical ecommerce resources. One partner Connect app serves every
 * merchant; there is no per-customer host to collect.
 *
 * Docs root: https://docs.haravan.com/docs/omni-apis/
 */

import { pageLocally } from '@opensteward/shared'
import type { Credentials, QueryParams } from '@opensteward/shared'
import { reportUpstreamPage } from '@opensteward/shared'
import type { EcommerceAdapter } from '../../adapter/interface'
import type { Product, ProductVariant } from '../../schema/product'
import type { Collection } from '../../schema/collection'
import type { Location } from '../../schema/location'
import type { InventoryLevel } from '../../schema/inventory'
import type { Customer } from '../../schema/customer'
import type { Order } from '../../schema/order'
import type { Refund } from '../../schema/refund'
import type { Transaction } from '../../schema/transaction'
import type { Discount } from '../../schema/discount'
import type { WebhookEvent } from '../../schema/webhook'

import { buildAuthUrl, exchangeCode as haravanExchangeCode, refreshAccessToken } from './auth'
import { HaravanClient } from './client'
import { DEFAULT_SCOPES } from './constants'
import { verifyHaravanWebhook, parseHaravanWebhookEvents } from './webhook'

import {
  transformProduct,
  untransformProduct,
  transformVariant,
  untransformVariant,
  type RawHaravanProduct,
  type RawHaravanVariant,
} from './transform/product'
import { transformCollection, untransformCollection, type RawHaravanCollection } from './transform/collection'
import { transformLocation, type RawHaravanLocation } from './transform/location'
import { transformInventoryLevel } from './transform/inventory'
import { transformCustomer, untransformCustomer, type RawHaravanCustomer } from './transform/customer'
import { transformOrder, untransformOrder, type RawHaravanOrder } from './transform/order'
import { transformRefund, untransformRefund, type RawHaravanRefund } from './transform/refund'
import { transformTransaction, untransformTransaction, type RawHaravanTransaction } from './transform/transaction'
import { transformDiscount, type RawHaravanDiscount } from './transform/discount'

/**
 * Report where a list flattened from a page of PARENTS (orders, products)
 * ends: where the parents' page ends. This adapter declares `maxPageSize`,
 * which tells the sync worker any short page is the last — and 50 orders
 * holding 3 refunds is "short". Without this the sync stopped after one page
 * of orders, vouched for it as the whole collection, and removed every cached
 * refund from the orders it never asked for. `hasMore` is the client's full-
 * page test on the parents' own page, the one the declared ceiling makes sound.
 */
function reportParentPage(params: QueryParams, hasMore: boolean): void {
  reportUpstreamPage(params, { hasMore })
}

export interface HaravanAdapterConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
  scopes?: string[]
}

export class HaravanAdapter implements EcommerceAdapter {
  readonly platform = 'haravan'
  readonly version = '0.1.0'

  /**
   * Every Haravan list endpoint used here defaults to 50 rows/page and
   * documents 50 as the practical ceiling (products, orders, customers,
   * collections, inventory adjustments — see transform/*.ts headers).
   */
  readonly capabilities = { maxPageSize: 50 }

  private clientId: string
  private clientSecret: string
  private redirectUri: string
  private scopes: string[]

  /** Shop currency, fetched once from `GET /shop.json` and cached per access
   *  token — Products/Variants/Discounts carry no currency of their own (see
   *  transform/product.ts), so this is the connection's own source of truth
   *  rather than a hard-coded default. */
  private currencyCache = new Map<string, Promise<string>>()

  constructor(config: HaravanAdapterConfig) {
    this.clientId = config.clientId
    this.clientSecret = config.clientSecret
    this.redirectUri = config.redirectUri
    this.scopes = config.scopes ?? DEFAULT_SCOPES
  }

  // ── Auth ──────────────────────────────────────────────────────────────────

  getAuthUrl(state: string, overrideScopes?: string[]): string {
    return buildAuthUrl(this.clientId, this.redirectUri, overrideScopes ?? this.scopes, state)
  }

  async exchangeCode(code: string, redirectUri: string): Promise<Credentials> {
    return haravanExchangeCode(code, redirectUri, this.clientId, this.clientSecret)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    if (!credentials.refreshToken) return credentials
    return refreshAccessToken(credentials.refreshToken, this.clientId, this.clientSecret)
  }

  // ── Webhooks ──────────────────────────────────────────────────────────────

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return verifyHaravanWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    const topic = (payload['__topic'] as string | undefined) ?? (payload['topic'] as string | undefined)
    return parseHaravanWebhookEvents(payload, topic)
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private client(credentials: Credentials): HaravanClient {
    return new HaravanClient(credentials)
  }

  /** `GET /shop.json`'s `currency`, cached per access token. Real doc example:
   *  https://docs.haravan.com/docs/omni-apis/shop/ → `{ "currency": "VND" }`. */
  private async shopCurrency(credentials: Credentials): Promise<string> {
    const key = credentials.accessToken
    let pending = this.currencyCache.get(key)
    if (!pending) {
      pending = this.client(credentials)
        .get<{ shop: { currency: string } }>('shop.json')
        .then((res) => {
          if (!res.shop?.currency) {
            throw new Error('Haravan GET /shop.json returned no currency — cannot price products without one.')
          }
          return res.shop.currency
        })
      this.currencyCache.set(key, pending)
    }
    return pending
  }

  /** `page`/`limit` only — the sync worker never sends more. */
  private listParams(params: QueryParams): Record<string, unknown> {
    return { page: params.page, limit: params.limit }
  }

  // ── Products ──────────────────────────────────────────────────────────────

  async listProducts(credentials: Credentials, params: QueryParams): Promise<Product[]> {
    const currency = await this.shopCurrency(credentials)
    const res = await this.client(credentials).list<RawHaravanProduct>(
      'products.json',
      'products',
      this.listParams(params),
    )
    return res.items.map((p) => transformProduct(p, currency))
  }

  async getProduct(credentials: Credentials, id: string): Promise<Product> {
    const currency = await this.shopCurrency(credentials)
    const res = await this.client(credentials).get<{ product: RawHaravanProduct }>(`products/${id}.json`)
    return transformProduct(res.product, currency)
  }

  async createProduct(credentials: Credentials, data: Partial<Product>): Promise<Product> {
    const currency = await this.shopCurrency(credentials)
    const res = await this.client(credentials).post<{ product: RawHaravanProduct }>('products.json', {
      product: untransformProduct(data),
    })
    return transformProduct(res.product, currency)
  }

  async updateProduct(credentials: Credentials, id: string, data: Partial<Product>): Promise<Product> {
    const currency = await this.shopCurrency(credentials)
    const res = await this.client(credentials).put<{ product: RawHaravanProduct }>(`products/${id}.json`, {
      product: { id, ...untransformProduct(data) },
    })
    return transformProduct(res.product, currency)
  }

  async deleteProduct(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`products/${id}.json`)
  }

  // ── Variants ──────────────────────────────────────────────────────────────

  async listVariants(credentials: Credentials, params: QueryParams): Promise<ProductVariant[]> {
    const currency = await this.shopCurrency(credentials)
    const productId = params['productId'] ?? params['product_id']
    const client = this.client(credentials)
    if (productId) {
      const res = await client.get<{ variants: RawHaravanVariant[] }>(
        `products/${String(productId)}/variants.json`,
        this.listParams(params),
      )
      return (res.variants ?? []).map((v) => transformVariant(v, currency))
    }
    // No store-wide variants list is documented — flatten from a page of
    // products, same shape as listProducts. The page's end is the products'
    // end, not how many variants it held — see `reportParentPage`.
    const res = await client.list<RawHaravanProduct>('products.json', 'products', this.listParams(params))
    reportParentPage(params, res.hasMore)
    return res.items.flatMap((p) => (p.variants ?? []).map((v) => transformVariant(v, currency, p.options)))
  }

  async getVariant(credentials: Credentials, id: string): Promise<ProductVariant> {
    const currency = await this.shopCurrency(credentials)
    const res = await this.client(credentials).get<{ variant: RawHaravanVariant }>(`variants/${id}.json`)
    return transformVariant(res.variant, currency)
  }

  async updateVariant(credentials: Credentials, id: string, data: Partial<ProductVariant>): Promise<ProductVariant> {
    const currency = await this.shopCurrency(credentials)
    const res = await this.client(credentials).put<{ variant: RawHaravanVariant }>(`variants/${id}.json`, {
      variant: { id, ...untransformVariant(data) },
    })
    return transformVariant(res.variant, currency)
  }

  // ── Collections ───────────────────────────────────────────────────────────

  async listCollections(credentials: Credentials, params: QueryParams): Promise<Collection[]> {
    const client = this.client(credentials)
    const q = this.listParams(params)
    const [custom, smart] = await Promise.all([
      client.list<RawHaravanCollection>('custom_collections.json', 'custom_collections', q),
      client.list<RawHaravanCollection>('smart_collections.json', 'smart_collections', q),
    ])
    return [
      ...custom.items.map((c) => transformCollection(c, 'MANUAL')),
      ...smart.items.map((c) => transformCollection(c, 'SMART')),
    ]
  }

  async getCollection(credentials: Credentials, id: string): Promise<Collection> {
    const client = this.client(credentials)
    try {
      const res = await client.get<{ custom_collection: RawHaravanCollection }>(`custom_collections/${id}.json`)
      return transformCollection(res.custom_collection, 'MANUAL')
    } catch {
      const res = await client.get<{ smart_collection: RawHaravanCollection }>(`smart_collections/${id}.json`)
      return transformCollection(res.smart_collection, 'SMART')
    }
  }

  async createCollection(credentials: Credentials, data: Partial<Collection>): Promise<Collection> {
    const res = await this.client(credentials).post<{ custom_collection: RawHaravanCollection }>(
      'custom_collections.json',
      { custom_collection: untransformCollection(data) },
    )
    return transformCollection(res.custom_collection, 'MANUAL')
  }

  async updateCollection(credentials: Credentials, id: string, data: Partial<Collection>): Promise<Collection> {
    const res = await this.client(credentials).put<{ custom_collection: RawHaravanCollection }>(
      `custom_collections/${id}.json`,
      { custom_collection: { id, ...untransformCollection(data) } },
    )
    return transformCollection(res.custom_collection, 'MANUAL')
  }

  async deleteCollection(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`custom_collections/${id}.json`)
  }

  // ── Locations ─────────────────────────────────────────────────────────────

  async listLocations(credentials: Credentials, params: QueryParams): Promise<Location[]> {
    // Not paginated — one response is every location, paged locally so a
    // caller limit below their count (maxPageSize 50) reaches each one.
    const res = await this.client(credentials).get<{ locations: RawHaravanLocation[] }>('locations.json')
    return pageLocally((res.locations ?? []).map(transformLocation), params)
  }

  async getLocation(credentials: Credentials, id: string): Promise<Location> {
    const res = await this.client(credentials).get<{ location: RawHaravanLocation }>(`locations/${id}.json`)
    return transformLocation(res.location)
  }

  // ── Inventory ─────────────────────────────────────────────────────────────
  //
  // Read (listInventoryLevels/getInventoryLevel) is declared unavailable —
  // see metadata.ts and transform/inventory.ts: `inventory_advance` is a
  // shop-wide aggregate with no location breakdown, so there is no honest
  // `locationId` to report it under. Writes are real: `location_id` is
  // supplied by the caller (from the real `listLocations`), never guessed.

  async adjustInventoryLevel(
    credentials: Credentials,
    data: { variantId: string; locationId: string; delta: number },
  ): Promise<InventoryLevel> {
    const client = this.client(credentials)
    await client.post('inventories/adjustorset.json', {
      inventory: {
        location_id: data.locationId,
        type: 'adjust',
        line_items: [{ product_variant_id: data.variantId, quantity: data.delta }],
      },
    })
    const res = await client.get<{ variant: RawHaravanVariant }>(`variants/${data.variantId}.json`)
    return transformInventoryLevel(res.variant, data.locationId)
  }

  async setInventoryLevel(
    credentials: Credentials,
    data: { variantId: string; locationId: string; available: number },
  ): Promise<InventoryLevel> {
    const client = this.client(credentials)
    await client.post('inventories/adjustorset.json', {
      inventory: {
        location_id: data.locationId,
        type: 'set',
        line_items: [{ product_variant_id: data.variantId, quantity: data.available }],
      },
    })
    const res = await client.get<{ variant: RawHaravanVariant }>(`variants/${data.variantId}.json`)
    return transformInventoryLevel(res.variant, data.locationId)
  }

  // ── Customers ─────────────────────────────────────────────────────────────

  async listCustomers(credentials: Credentials, params: QueryParams): Promise<Customer[]> {
    const res = await this.client(credentials).list<RawHaravanCustomer>(
      'customers.json',
      'customers',
      this.listParams(params),
    )
    return res.items.map(transformCustomer)
  }

  async getCustomer(credentials: Credentials, id: string): Promise<Customer> {
    const res = await this.client(credentials).get<{ customer: RawHaravanCustomer }>(`customers/${id}.json`)
    return transformCustomer(res.customer)
  }

  async createCustomer(credentials: Credentials, data: Partial<Customer>): Promise<Customer> {
    const res = await this.client(credentials).post<{ customer: RawHaravanCustomer }>('customers.json', {
      customer: untransformCustomer(data),
    })
    return transformCustomer(res.customer)
  }

  async updateCustomer(credentials: Credentials, id: string, data: Partial<Customer>): Promise<Customer> {
    const res = await this.client(credentials).put<{ customer: RawHaravanCustomer }>(`customers/${id}.json`, {
      customer: { id, ...untransformCustomer(data) },
    })
    return transformCustomer(res.customer)
  }

  async deleteCustomer(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`customers/${id}.json`)
  }

  // ── Orders ────────────────────────────────────────────────────────────────

  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const res = await this.client(credentials).list<RawHaravanOrder>(
      'orders.json',
      'orders',
      { ...this.listParams(params), status: 'any' },
    )
    return res.items.map(transformOrder)
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const res = await this.client(credentials).get<{ order: RawHaravanOrder }>(`orders/${id}.json`)
    return transformOrder(res.order)
  }

  async updateOrder(credentials: Credentials, id: string, data: Partial<Order>): Promise<Order> {
    const res = await this.client(credentials).put<{ order: RawHaravanOrder }>(`orders/${id}.json`, {
      order: { id, ...untransformOrder(data) },
    })
    return transformOrder(res.order)
  }

  async cancelOrder(credentials: Credentials, id: string, data?: { reason?: string }): Promise<Order> {
    const res = await this.client(credentials).post<{ order: RawHaravanOrder }>(`orders/${id}/cancel.json`, {
      reason: data?.reason,
    })
    return transformOrder(res.order)
  }

  // ── Refunds ───────────────────────────────────────────────────────────────

  async listRefunds(credentials: Credentials, params: QueryParams): Promise<Refund[]> {
    const orderId = params['order_id'] ?? params['orderId']
    const currency = await this.shopCurrency(credentials)
    if (!orderId) {
      // No store-wide refunds list is documented. The Order resource embeds
      // "refunds: [...] — a list of refunds applied to the order"
      // (https://docs.haravan.com/docs/omni-apis/orders/), so an unfiltered
      // call (the sync worker never filters) is answered from one page of
      // orders instead — the same technique the Shopify reference adapter
      // uses for the same documented gap.
      const client = this.client(credentials)
      const res = await client.list<RawHaravanOrder>('orders.json', 'orders', {
        ...this.listParams(params),
        status: 'any',
      })
      reportParentPage(params, res.hasMore)
      return res.items.flatMap((o) =>
        (o.refunds ?? []).map((r) => transformRefund({ ...r, order_id: r.order_id ?? o.id }, currency)),
      )
    }
    const res = await this.client(credentials).get<{ refunds: RawHaravanRefund[] }>(
      `orders/${String(orderId)}/refunds.json`,
      this.listParams(params),
    )
    return (res.refunds ?? []).map((r) => transformRefund(r, currency))
  }

  async getRefund(credentials: Credentials, id: string): Promise<Refund> {
    const [orderId, refundId] = id.split(':')
    if (!orderId || !refundId) throw new Error('Invalid refund id format: expected `orderId:refundId`')
    const currency = await this.shopCurrency(credentials)
    const res = await this.client(credentials).get<{ refund: RawHaravanRefund }>(
      `orders/${orderId}/refunds/${refundId}.json`,
    )
    return transformRefund(res.refund, currency)
  }

  async createRefund(credentials: Credentials, data: Partial<Refund>): Promise<Refund> {
    if (!data.orderId) throw new Error('createRefund requires orderId')
    const currency = await this.shopCurrency(credentials)
    const res = await this.client(credentials).post<{ refund: RawHaravanRefund }>(
      `orders/${data.orderId}/refunds.json`,
      { refund: untransformRefund(data) },
    )
    return transformRefund(res.refund, currency)
  }

  // ── Transactions ──────────────────────────────────────────────────────────

  async listTransactions(credentials: Credentials, params: QueryParams): Promise<Transaction[]> {
    const orderId = params['order_id'] ?? params['orderId']
    if (!orderId) {
      // Same documented gap as refunds — Order embeds
      // "transactions: [...] Information about the transaction"
      // (https://docs.haravan.com/docs/omni-apis/orders/).
      const client = this.client(credentials)
      const res = await client.list<RawHaravanOrder>('orders.json', 'orders', {
        ...this.listParams(params),
        status: 'any',
      })
      reportParentPage(params, res.hasMore)
      return res.items.flatMap((o) =>
        (o.transactions ?? []).map((t) => transformTransaction({ ...t, order_id: t.order_id ?? o.id })),
      )
    }
    const res = await this.client(credentials).get<{ transactions: RawHaravanTransaction[] }>(
      `orders/${String(orderId)}/transactions.json`,
      this.listParams(params),
    )
    return (res.transactions ?? []).map(transformTransaction)
  }

  async getTransaction(credentials: Credentials, id: string): Promise<Transaction> {
    const [orderId, txId] = id.split(':')
    if (!orderId || !txId) throw new Error('Invalid transaction id format: expected `orderId:transactionId`')
    const res = await this.client(credentials).get<{ transaction: RawHaravanTransaction }>(
      `orders/${orderId}/transactions/${txId}.json`,
    )
    return transformTransaction(res.transaction)
  }

  async createTransaction(credentials: Credentials, data: Partial<Transaction>): Promise<Transaction> {
    if (!data.orderId) throw new Error('createTransaction requires orderId')
    // Documented path has this exact misspelling ("transations", not
    // "transactions") — see transform/transaction.ts and
    // https://docs.haravan.com/docs/omni-apis/transactions/.
    const res = await this.client(credentials).post<{ transaction: RawHaravanTransaction }>(
      `orders/${data.orderId}/transations.json`,
      { transaction: untransformTransaction(data) },
    )
    return transformTransaction(res.transaction)
  }

  // ── Discounts ─────────────────────────────────────────────────────────────
  //
  // Read-only: `com.write_discounts` is documented as "Only used by the
  // private app" (https://docs.haravan.com/docs/omni-apis/discount/discount-codes/),
  // so this public Connect OAuth app cannot request it and create/enable/
  // disable/delete are not implemented.

  async listDiscounts(credentials: Credentials, params: QueryParams): Promise<Discount[]> {
    const currency = await this.shopCurrency(credentials)
    const res = await this.client(credentials).list<RawHaravanDiscount>(
      'discounts.json',
      'discounts',
      this.listParams(params),
    )
    return res.items.map((d) => transformDiscount(d, currency))
  }

  async getDiscount(credentials: Credentials, id: string): Promise<Discount> {
    const currency = await this.shopCurrency(credentials)
    const res = await this.client(credentials).get<{ discount: RawHaravanDiscount }>(`discounts/${id}.json`)
    return transformDiscount(res.discount, currency)
  }
}
