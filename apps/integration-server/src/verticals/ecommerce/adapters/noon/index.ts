/**
 * Noon Seller Platform adapter for the ecommerce vertical.
 *
 * Maps Noon's Seller API to the canonical ecommerce resources. Noon is a
 * leading MENA marketplace operating in the UAE, Saudi Arabia, and Egypt,
 * with Arabic locale support throughout.
 *
 * Slug: `noon` | Platform identifier: `noon`
 *
 * -- Coverage -----------------------------------------------------------------
 *
 * Implemented (15):
 *
 *   Products:      list, get, create, update, delete   (/seller/products)
 *   Variants:      list, get                           (extracted from product detail)
 *   Inventory:     list, get, set                      (/seller/inventory)
 *   Orders:        list, get, cancel                   (/seller/orders)
 *   Fulfillments:  list, get, create                   (/seller/fulfillments)
 *   Webhooks:      verify + parse                      (HMAC-SHA256 push notifications)
 *
 * Omitted (27) -- the registry will return HTTP 501 automatically:
 *
 *   Variant mutations (3) -- create/update/delete: go through product endpoints.
 *   Inventory adjust (1)  -- Noon only supports absolute stock sets.
 *   Collections (5)       -- Noon has categories but no user-mutable collections.
 *   Locations (2)         -- Noon manages warehouses internally.
 *   Customers (5)         -- No buyer data API exposed to sellers.
 *   Order mutations (2)   -- create/update: marketplace-controlled.
 *   Fulfillment mutations (2) -- update/cancel: marketplace-controlled.
 *   Refunds (3)           -- Handled via Noon's return/dispute system.
 *   Transactions (3)      -- No financial transaction API.
 *   Discounts (5)         -- Promotions API too limited to map to canonical
 *                            discounts.
 *
 * ── Resource coverage ──────────────────────────────────────────────────────────
 * Unavailable: collection    — Noon manages its own category taxonomy; sellers cannot create or query user-mutable collections via the Seller API.
 * Unavailable: customer      — Noon withholds buyer PII from sellers by platform policy; no customer data API is exposed to seller integrations.
 * Unavailable: discount      — Promotions are expressed as a price/MSRP differential on product listings; no dedicated seller-facing discounts API exists.
 * Unavailable: location      — Noon assigns warehouses internally and manages fulfilment centres through Seller Lab; no seller-facing location listing API exists.
 * Unavailable: refund        — Returns are processed by Noon's own dispute/return resolution system; sellers cannot programmatically access or create refund records.
 * Unavailable: transaction   — No financial transaction API is exposed to sellers; settlement and payout data is available only via the Seller Lab UI.
 */

import type { Credentials, QueryParams } from '@opensteward/shared'
import type { EcommerceAdapter } from '../../adapter/interface'
import type { Product } from '../../schema/product'
import type { ProductVariant } from '../../schema/product'
import type { InventoryLevel } from '../../schema/inventory'
import type { Order } from '../../schema/order'
import type { Fulfillment } from '../../schema/fulfillment'
import type { WebhookEvent } from '../../schema/webhook'

import {
  buildAuthUrl,
  exchangeCode as noonExchangeCode,
  refreshCredentials as noonRefreshCredentials,
} from './auth'
import { NoonClient } from './client'
import {
  DEFAULT_PAGE_SIZE,
  PLATFORM_SLUG,
  PRODUCTS_LIST,
  PRODUCT_GET,
  PRODUCT_CREATE,
  PRODUCT_UPDATE,
  PRODUCT_DELETE,
  INVENTORY_LIST,
  INVENTORY_UPDATE,
  ORDERS_LIST,
  ORDER_GET,
  ORDER_CANCEL,
  FULFILLMENTS_LIST,
  FULFILLMENT_GET,
  FULFILLMENT_CREATE,
  currencyForLocale,
} from './constants'
import {
  transformProduct,
  untransformProduct,
  type RawNoonProduct,
} from './transform/product'
import {
  transformOrder,
  type RawNoonOrder,
} from './transform/order'
import {
  transformFulfillment,
  transformFulfillments,
  type RawNoonFulfillment,
} from './transform/fulfillment'
import {
  transformInventoryLevel,
  type RawNoonStockItem,
} from './transform/inventory'
import { extractVariants, findVariant } from './transform/variant'
import {
  verifyWebhookSignature,
  parseWebhookEvents as parseWebhook,
} from './webhook'

export interface NoonAdapterConfig {
  /** Noon OAuth2 client ID. Optional -- may come from credentials. */
  clientId?: string
  /** Noon OAuth2 client secret or API key. Optional -- may come from credentials. */
  clientSecret?: string
  /** Default locale code (ae, sa, eg). Defaults to `ae`. */
  locale?: string
  /** Webhook secret for signature verification. */
  webhookSecret?: string
}

// -- Response envelopes -------------------------------------------------------

interface NoonProductsEnvelope {
  data?: {
    items?: RawNoonProduct[]
  }
  pagination?: {
    total?: number
  }
  error?: { code?: string; message?: string }
}

interface NoonProductEnvelope {
  data?: RawNoonProduct
  error?: { code?: string; message?: string }
}

interface NoonOrdersEnvelope {
  data?: {
    items?: RawNoonOrder[]
  }
  pagination?: {
    total?: number
  }
  error?: { code?: string; message?: string }
}

interface NoonOrderEnvelope {
  data?: RawNoonOrder
  error?: { code?: string; message?: string }
}

interface NoonFulfillmentsEnvelope {
  data?: {
    items?: RawNoonFulfillment[]
  }
  pagination?: {
    total?: number
  }
  error?: { code?: string; message?: string }
}

interface NoonFulfillmentEnvelope {
  data?: RawNoonFulfillment
  error?: { code?: string; message?: string }
}

interface NoonStockEnvelope {
  data?: {
    items?: RawNoonStockItem[]
  }
  error?: { code?: string; message?: string }
}

interface NoonActionEnvelope {
  data?: Record<string, unknown>
  error?: { code?: string; message?: string }
}

export class NoonAdapter implements EcommerceAdapter {
  readonly platform = PLATFORM_SLUG
  readonly version = '0.1.0'

  private configClientId: string | undefined
  private configClientSecret: string | undefined
  private configLocale: string
  private configWebhookSecret: string

  constructor(config: NoonAdapterConfig = {}) {
    this.configClientId = config.clientId
    this.configClientSecret = config.clientSecret
    this.configLocale = config.locale ?? 'ae'
    this.configWebhookSecret = config.webhookSecret ?? ''
  }

  // -- Auth -------------------------------------------------------------------

  getAuthUrl(state: string): string {
    const clientId = this.configClientId
    if (!clientId) {
      throw new Error('Noon adapter: clientId is required to build the auth URL.')
    }
    return buildAuthUrl(clientId, '', state)
  }

  async exchangeCode(code: string, redirectUri: string): Promise<Credentials> {
    const clientId = this.configClientId
    const clientSecret = this.configClientSecret
    if (!clientId || !clientSecret) {
      throw new Error(
        'Noon adapter: clientId and clientSecret are required for code exchange.',
      )
    }
    return noonExchangeCode(code, clientId, clientSecret, redirectUri)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return noonRefreshCredentials(credentials)
  }

  // -- Webhooks ---------------------------------------------------------------

  verifyWebhookSignature(body: string, signature: string): boolean {
    const secret =
      this.configWebhookSecret
    return verifyWebhookSignature(body, signature, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parseWebhook(payload)
  }

  // -- Private helpers --------------------------------------------------------

  private clientFor(credentials: Credentials): NoonClient {
    const locale =
      (credentials.extra?.['locale'] as string | undefined) ?? this.configLocale
    const merged: Credentials = {
      ...credentials,
      extra: {
        ...credentials.extra,
        locale,
      },
    }
    return new NoonClient(merged)
  }

  private currencyFor(credentials: Credentials): string {
    const locale =
      (credentials.extra?.['locale'] as string | undefined) ?? this.configLocale
    return (credentials.extra?.['currency'] as string | undefined) ?? currencyForLocale(locale)
  }

  // -- Products ---------------------------------------------------------------

  async listProducts(credentials: Credentials, params: QueryParams): Promise<Product[]> {
    const client = this.clientFor(credentials)
    const currency = this.currencyFor(credentials)
    const res = await client.get<NoonProductsEnvelope>(PRODUCTS_LIST, {
      limit: params.limit ?? DEFAULT_PAGE_SIZE,
      page: (params['page'] as number | undefined) ?? 1,
      ...(params['status'] ? { status: params['status'] } : {}),
    })
    if (res.error?.code) {
      throw new Error(`Noon listProducts failed: ${res.error.code} -- ${res.error.message ?? 'unknown'}`)
    }
    const products = res.data?.items ?? []
    return products.map((p) => transformProduct(p, currency))
  }

  async getProduct(credentials: Credentials, id: string): Promise<Product> {
    const client = this.clientFor(credentials)
    const currency = this.currencyFor(credentials)
    const res = await client.get<NoonProductEnvelope>(`${PRODUCT_GET}/${id}`)
    if (res.error?.code) {
      throw new Error(`Noon getProduct failed: ${res.error.code} -- ${res.error.message ?? 'unknown'}`)
    }
    if (!res.data) {
      throw new Error(`Noon getProduct: empty response for product_id '${id}'`)
    }
    return transformProduct(res.data, currency)
  }

  async createProduct(credentials: Credentials, data: Partial<Product>): Promise<Product> {
    const client = this.clientFor(credentials)
    const currency = this.currencyFor(credentials)
    const payload = untransformProduct(data)
    const res = await client.post<NoonActionEnvelope>(PRODUCT_CREATE, payload)
    if (res.error?.code) {
      throw new Error(`Noon createProduct failed: ${res.error.code} -- ${res.error.message ?? 'unknown'}`)
    }
    const productId = res.data?.['product_id'] as string | number | undefined
    if (productId) {
      return this.getProduct(credentials, String(productId))
    }
    return transformProduct(
      { product_id: undefined, title: data.title, ...data.metadata } as unknown as RawNoonProduct,
      currency,
    )
  }

  async updateProduct(
    credentials: Credentials,
    id: string,
    data: Partial<Product>,
  ): Promise<Product> {
    const client = this.clientFor(credentials)
    const payload = untransformProduct({ ...data, id })
    const res = await client.put<NoonActionEnvelope>(`${PRODUCT_UPDATE}/${id}`, payload)
    if (res.error?.code) {
      throw new Error(`Noon updateProduct failed: ${res.error.code} -- ${res.error.message ?? 'unknown'}`)
    }
    return this.getProduct(credentials, id)
  }

  async deleteProduct(credentials: Credentials, id: string): Promise<void> {
    const client = this.clientFor(credentials)
    const res = await client.delete<NoonActionEnvelope>(`${PRODUCT_DELETE}/${id}`)
    if (res.error?.code) {
      throw new Error(`Noon deleteProduct failed: ${res.error.code} -- ${res.error.message ?? 'unknown'}`)
    }
  }

  // -- Variants (read-only, extracted from product detail) --------------------

  async listVariants(credentials: Credentials, params: QueryParams): Promise<ProductVariant[]> {
    const productId = (params['productId'] ?? params['product_id']) as string | undefined
    if (!productId) {
      throw new Error('Noon listVariants requires `productId` in query params.')
    }
    const product = await this.getProduct(credentials, productId)
    const currency = this.currencyFor(credentials)
    return extractVariants(product.metadata as unknown as RawNoonProduct, currency)
  }

  async getVariant(credentials: Credentials, id: string): Promise<ProductVariant> {
    // Variant id may be `${productId}:${sku}` or just `${sku}`.
    const parts = id.split(':')
    const productId = parts.length > 1 ? parts[0]! : undefined
    const variantId = parts.length > 1 ? parts[1]! : id

    if (!productId) {
      throw new Error(
        'Noon getVariant requires a composite id formatted as `productId:sku`.',
      )
    }

    const client = this.clientFor(credentials)
    const currency = this.currencyFor(credentials)
    const res = await client.get<NoonProductEnvelope>(`${PRODUCT_GET}/${productId}`)
    if (!res.data) {
      throw new Error(`Noon getVariant: empty response for product '${productId}'`)
    }
    const variant = findVariant(res.data, variantId, currency)
    if (!variant) {
      throw new Error(`Noon getVariant: no SKU '${variantId}' on product '${productId}'`)
    }
    return variant
  }

  // -- Inventory --------------------------------------------------------------

  async listInventoryLevels(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<InventoryLevel[]> {
    const client = this.clientFor(credentials)
    const res = await client.get<NoonStockEnvelope>(INVENTORY_LIST, {
      limit: params.limit ?? DEFAULT_PAGE_SIZE,
      page: (params['page'] as number | undefined) ?? 1,
    })
    if (res.error?.code) {
      throw new Error(`Noon listInventoryLevels failed: ${res.error.code} -- ${res.error.message ?? 'unknown'}`)
    }
    const items = res.data?.items ?? []
    return items.map(transformInventoryLevel)
  }

  async getInventoryLevel(credentials: Credentials, id: string): Promise<InventoryLevel> {
    const variantId = id.includes(':') ? id.split(':')[0]! : id
    const levels = await this.listInventoryLevels(credentials, {} as QueryParams)
    const found = levels.find(
      (l) => l.variantId === variantId || l.id === id,
    )
    if (!found) {
      throw new Error(`Noon getInventoryLevel: no stock found for '${variantId}'`)
    }
    return found
  }

  async setInventoryLevel(
    credentials: Credentials,
    data: { variantId: string; locationId: string; available: number },
  ): Promise<InventoryLevel> {
    const client = this.clientFor(credentials)
    const payload = {
      sku: data.variantId,
      warehouse_id: data.locationId !== 'noon-default' ? data.locationId : undefined,
      available_quantity: data.available,
    }
    const res = await client.put<NoonActionEnvelope>(INVENTORY_UPDATE, payload)
    if (res.error?.code) {
      throw new Error(`Noon setInventoryLevel failed: ${res.error.code} -- ${res.error.message ?? 'unknown'}`)
    }
    return this.getInventoryLevel(credentials, data.variantId)
  }

  // -- Orders -----------------------------------------------------------------

  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const client = this.clientFor(credentials)
    const currency = this.currencyFor(credentials)
    const res = await client.get<NoonOrdersEnvelope>(ORDERS_LIST, {
      limit: params.limit ?? DEFAULT_PAGE_SIZE,
      page: (params['page'] as number | undefined) ?? 1,
      ...(params['status'] ? { status: params['status'] } : {}),
      ...(params.updatedAfter
        ? { updated_after: params.updatedAfter.toISOString() }
        : {}),
    })
    if (res.error?.code) {
      throw new Error(`Noon listOrders failed: ${res.error.code} -- ${res.error.message ?? 'unknown'}`)
    }
    const orders = res.data?.items ?? []
    return orders.map((o) => transformOrder(o, currency))
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const client = this.clientFor(credentials)
    const currency = this.currencyFor(credentials)
    const res = await client.get<NoonOrderEnvelope>(`${ORDER_GET}/${id}`)
    if (res.error?.code) {
      throw new Error(`Noon getOrder failed: ${res.error.code} -- ${res.error.message ?? 'unknown'}`)
    }
    if (!res.data) {
      throw new Error(`Noon getOrder: empty response for order '${id}'`)
    }
    return transformOrder(res.data, currency)
  }

  async cancelOrder(
    credentials: Credentials,
    id: string,
    data?: { reason?: string },
  ): Promise<Order> {
    const client = this.clientFor(credentials)
    const currency = this.currencyFor(credentials)
    const res = await client.post<NoonOrderEnvelope>(
      `${ORDER_CANCEL}/${id}/cancel`,
      { reason: data?.reason },
    )
    if (res.error?.code) {
      throw new Error(`Noon cancelOrder failed: ${res.error.code} -- ${res.error.message ?? 'unknown'}`)
    }
    if (!res.data) {
      return this.getOrder(credentials, id)
    }
    return transformOrder(res.data, currency)
  }

  // -- Fulfillments -----------------------------------------------------------

  async listFulfillments(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<Fulfillment[]> {
    const client = this.clientFor(credentials)
    const orderId = (params['orderId'] ?? params['order_id']) as string | undefined
    const res = await client.get<NoonFulfillmentsEnvelope>(FULFILLMENTS_LIST, {
      limit: params.limit ?? DEFAULT_PAGE_SIZE,
      page: (params['page'] as number | undefined) ?? 1,
      ...(orderId ? { order_id: orderId } : {}),
    })
    if (res.error?.code) {
      throw new Error(`Noon listFulfillments failed: ${res.error.code} -- ${res.error.message ?? 'unknown'}`)
    }
    return transformFulfillments(res.data?.items)
  }

  async getFulfillment(credentials: Credentials, id: string): Promise<Fulfillment> {
    const client = this.clientFor(credentials)
    const res = await client.get<NoonFulfillmentEnvelope>(`${FULFILLMENT_GET}/${id}`)
    if (res.error?.code) {
      throw new Error(`Noon getFulfillment failed: ${res.error.code} -- ${res.error.message ?? 'unknown'}`)
    }
    if (!res.data) {
      throw new Error(`Noon getFulfillment: empty response for fulfillment '${id}'`)
    }
    return transformFulfillment(res.data)
  }

  async createFulfillment(
    credentials: Credentials,
    data: Partial<Fulfillment>,
  ): Promise<Fulfillment> {
    const client = this.clientFor(credentials)
    const orderId = data.orderId
    if (!orderId) {
      throw new Error('Noon createFulfillment requires `orderId` in the fulfillment data.')
    }
    const payload = {
      order_id: orderId,
      tracking_number: data.trackingNumber,
      carrier: data.carrier,
      service_type: data.service,
      items: (data.lineItems ?? []).map((li) => ({
        order_item_id: li.lineItemId,
        quantity: li.quantity,
      })),
    }
    const res = await client.post<NoonFulfillmentEnvelope>(FULFILLMENT_CREATE, payload)
    if (res.error?.code) {
      throw new Error(
        `Noon createFulfillment failed: ${res.error.code} -- ${res.error.message ?? 'unknown'}`,
      )
    }
    if (res.data) {
      return transformFulfillment(res.data)
    }
    return {
      id: `${orderId}:pending`,
      orderId,
      status: 'PENDING',
      trackingNumber: data.trackingNumber,
      carrier: data.carrier,
      lineItems: data.lineItems,
      metadata: { createResponse: res },
    }
  }
}
