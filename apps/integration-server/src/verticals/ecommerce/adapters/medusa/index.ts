import { CONNECT_FORM } from './connect-form'
/**
 * Medusa v2 adapter for the ecommerce vertical.
 *
 * Maps the Medusa v2 Admin REST API (`/admin/`) to the canonical
 * ecommerce resources. Medusa uses API key auth — there is no OAuth
 * code-exchange flow — and has a rich inventory module with stock
 * locations. Webhooks are omitted since Medusa v2 uses event
 * subscribers rather than outgoing HTTPS webhooks.
 *
 * ── Resource coverage ──────────────────────────────────────────────
 * All 10 canonical resources are available:
 *   collection, customer, discount, fulfillment, inventory, location,
 *   order, product, refund, transaction.
 * Transaction: mapped from GET /admin/payments (AdminPayment). Payment
 *   creation is owned by the checkout flow — createTransaction is not
 *   implemented (no POST /admin/payments endpoint exists).
 */

import {
  connectionScope,
  cursorPagerKey,
  pageByRows,
  pageOffset,
  reportUpstreamPage,
} from '@opensteward/shared'
import type { Credentials, QueryParams, UpstreamPageMeta } from '@opensteward/shared'
import type { EcommerceAdapter } from '../../adapter/interface'
import type { Product, ProductVariant } from '../../schema/product'
import type { Collection } from '../../schema/collection'
import type { Location } from '../../schema/location'
import type { InventoryLevel } from '../../schema/inventory'
import type { Customer } from '../../schema/customer'
import type { Order } from '../../schema/order'
import type { Fulfillment } from '../../schema/fulfillment'
import type { Refund } from '../../schema/refund'
import type { Discount } from '../../schema/discount'
import type { Transaction } from '../../schema/transaction'

import { buildAuthUrl, exchangeCode as medusaExchangeCode } from './auth'
import { MedusaClient } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

import {
  transformProduct,
  untransformProduct,
  transformProductVariant,
  untransformProductVariant,
  type RawMedusaProduct,
  type RawMedusaVariant,
} from './transform/product'
import {
  transformCollection,
  untransformCollection,
  type RawMedusaCollection,
} from './transform/collection'
import {
  transformLocation,
  type RawMedusaStockLocation,
} from './transform/location'
import {
  transformInventoryLevel,
  type RawMedusaInventoryItem,
} from './transform/inventory'
import {
  transformCustomer,
  untransformCustomer,
  type RawMedusaCustomer,
} from './transform/customer'
import {
  transformOrder,
  untransformOrder,
  type RawMedusaOrder,
} from './transform/order'
import {
  transformFulfillment,
  untransformFulfillment,
  type RawMedusaFulfillment,
} from './transform/fulfillment'
import {
  transformRefund,
  untransformRefund,
  type RawMedusaRefund,
} from './transform/refund'
import {
  transformDiscount,
  untransformDiscount,
  type RawMedusaPromotion,
} from './transform/discount'
import {
  transformTransaction,
  type RawMedusaPayment,
} from './transform/transaction'

export interface MedusaAdapterConfig {
  /** Medusa backend host, e.g. `https://my-medusa.example.com`. */
  host?: string
  /** Admin API key (secret key). */
  apiKey?: string
}


export class MedusaAdapter implements EcommerceAdapter {

  // Connect Link support — see ./connect-form.ts for the fields collected.

  credentialFields = CONNECT_FORM.credentialFields

  exchangeCredentials = CONNECT_FORM.exchangeCredentials

  readonly platform = 'medusa'
  readonly version = '0.1.0'
  /** Honours `params.search`; see AdapterCapabilities. Declared so the
   *  router can refuse the parameter on adapters that would drop it. */
  readonly capabilities = { search: true }

  private configHost: string | undefined
  private configApiKey: string | undefined

  constructor(config: MedusaAdapterConfig = {}) {
    this.configHost = config.host
    this.configApiKey = config.apiKey
  }

  // ── Auth ──────────────────────────────────────────────────────────────────

  getAuthUrl(_state: string): string {
    return buildAuthUrl(this.configHost ?? 'https://your-medusa-backend.example')
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    return medusaExchangeCode()
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return credentials
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private clientFor(credentials: Credentials): MedusaClient {
    const apiKey = credentials.accessToken || this.configApiKey
    const host =
      (credentials.extra?.['host'] as string | undefined) ?? this.configHost

    if (!apiKey || !host) {
      throw new Error(
        'Medusa adapter is missing apiKey/host — ' +
          'either configure them in apps/integration-server/config/config.yml under adapters.medusa, ' +
          'or POST them to /v1/connections with credentials: {apiKey, host}.',
      )
    }

    const mergedCreds: Credentials = {
      ...credentials,
      accessToken: apiKey,
      extra: { ...credentials.extra, host },
    }
    return new MedusaClient(mergedCreds)
  }

  /** Filters forwarded to every list endpoint; paging is added by the callers. */
  private listParams(params: QueryParams): Record<string, unknown> {
    const out: Record<string, unknown> = {}
    if (params.updatedAfter) out['updated_at'] = { gte: params.updatedAfter.toISOString() }
    if (params.search) out['q'] = params.search
    return out
  }

  /**
   * One caller page of an offset-paginated Medusa list. Medusa documents
   * offset/limit paging with a `count` total: "if the limit is 50, at page 1
   * the offset should be 0; at page 2 the offset should be 50"
   * (https://docs.medusajs.com/api/admin#pagination). No maximum `limit` is
   * documented; the adapter asks for at most MAX_PAGE_SIZE rows and strides
   * the offset by the size it actually sent, reporting that size.
   */
  private async offsetPage<T>(
    client: MedusaClient,
    path: string,
    key: string,
    params: QueryParams,
  ): Promise<T[]> {
    const size = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
    const offset = pageOffset(params, size)
    const res = await client.listWithOffset<T>(path, key, {
      ...this.listParams(params),
      limit: size,
      offset,
    })
    const meta: UpstreamPageMeta = { pageSize: size }
    if (res.count !== undefined) {
      meta.totalCount = res.count
      meta.hasMore = res.items.length > 0 && offset + res.items.length < res.count
    }
    reportUpstreamPage(params, meta)
    return res.items
  }

  // ── Products ──────────────────────────────────────────────────────────────

  async listProducts(credentials: Credentials, params: QueryParams): Promise<Product[]> {
    const client = this.clientFor(credentials)
    const items = await this.offsetPage<RawMedusaProduct>(client, '/products', 'products', params)
    return items.map((p) => transformProduct(p))
  }

  async getProduct(credentials: Credentials, id: string): Promise<Product> {
    const client = this.clientFor(credentials)
    const res = await client.get<{ product: RawMedusaProduct }>(`/products/${id}`)
    return transformProduct(res.product)
  }

  async createProduct(credentials: Credentials, data: Partial<Product>): Promise<Product> {
    const client = this.clientFor(credentials)
    const res = await client.post<{ product: RawMedusaProduct }>(
      '/products',
      untransformProduct(data),
    )
    return transformProduct(res.product)
  }

  async updateProduct(
    credentials: Credentials,
    id: string,
    data: Partial<Product>,
  ): Promise<Product> {
    const client = this.clientFor(credentials)
    const res = await client.post<{ product: RawMedusaProduct }>(
      `/products/${id}`,
      untransformProduct(data),
    )
    return transformProduct(res.product)
  }

  async deleteProduct(credentials: Credentials, id: string): Promise<void> {
    await this.clientFor(credentials).delete(`/products/${id}`)
  }

  // ── Variants ──────────────────────────────────────────────────────────────

  async listVariants(credentials: Credentials, params: QueryParams): Promise<ProductVariant[]> {
    const productId = (params['productId'] ?? params['product_id']) as string | undefined
    if (productId == null) {
      throw new Error(
        'Medusa requires ?product_id= for listVariants; variants are nested under products.',
      )
    }
    const client = this.clientFor(credentials)
    const res = await client.get<{ product: RawMedusaProduct }>(`/products/${productId}`)
    return (res.product.variants ?? []).map((v) =>
      transformProductVariant(v, productId),
    )
  }

  async getVariant(credentials: Credentials, id: string): Promise<ProductVariant> {
    const client = this.clientFor(credentials)
    // Medusa v2 has /admin/products/{productId}/variants/{variantId}
    // but we can also query the variant directly via product expansion.
    // Try the product_id from query or fall back to searching.
    const res = await client.get<{ variant: RawMedusaVariant }>(`/variants/${id}`)
    return transformProductVariant(res.variant, res.variant.product_id ?? '')
  }

  async createVariant(
    credentials: Credentials,
    data: Partial<ProductVariant>,
  ): Promise<ProductVariant> {
    const productId = data.productId
    if (!productId) throw new Error('createVariant requires productId')
    const client = this.clientFor(credentials)
    const res = await client.post<{ product: RawMedusaProduct }>(
      `/products/${productId}/variants`,
      untransformProductVariant(data),
    )
    const created = res.product.variants?.find((v) => v.sku === data.sku)
    if (created) return transformProductVariant(created, productId)
    // Fallback: return the last variant
    const variants = res.product.variants ?? []
    return transformProductVariant(variants[variants.length - 1]!, productId)
  }

  async updateVariant(
    credentials: Credentials,
    id: string,
    data: Partial<ProductVariant>,
  ): Promise<ProductVariant> {
    const productId = data.productId
    if (!productId) throw new Error('updateVariant requires productId in data')
    const client = this.clientFor(credentials)
    const res = await client.post<{ product: RawMedusaProduct }>(
      `/products/${productId}/variants/${id}`,
      untransformProductVariant(data),
    )
    const updated = res.product.variants?.find((v) => v.id === id)
    if (updated) return transformProductVariant(updated, productId)
    return transformProductVariant(
      (res.product.variants ?? [])[0]!,
      productId,
    )
  }

  async deleteVariant(credentials: Credentials, id: string): Promise<void> {
    // Medusa v2 variant deletion requires the product id in the path.
    // The caller should provide the composite id or we fetch the variant first.
    const client = this.clientFor(credentials)
    const variantRes = await client.get<{ variant: RawMedusaVariant }>(`/variants/${id}`)
    const productId = variantRes.variant.product_id
    if (!productId) throw new Error('Cannot determine product_id for variant deletion')
    await client.delete(`/products/${productId}/variants/${id}`)
  }

  // ── Collections ───────────────────────────────────────────────────────────

  async listCollections(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<Collection[]> {
    const client = this.clientFor(credentials)
    const items = await this.offsetPage<RawMedusaCollection>(client, '/collections', 'collections', params)
    return items.map(transformCollection)
  }

  async getCollection(credentials: Credentials, id: string): Promise<Collection> {
    const client = this.clientFor(credentials)
    const res = await client.get<{ collection: RawMedusaCollection }>(`/collections/${id}`)
    return transformCollection(res.collection)
  }

  async createCollection(
    credentials: Credentials,
    data: Partial<Collection>,
  ): Promise<Collection> {
    const client = this.clientFor(credentials)
    const res = await client.post<{ collection: RawMedusaCollection }>(
      '/collections',
      untransformCollection(data),
    )
    return transformCollection(res.collection)
  }

  async updateCollection(
    credentials: Credentials,
    id: string,
    data: Partial<Collection>,
  ): Promise<Collection> {
    const client = this.clientFor(credentials)
    const res = await client.post<{ collection: RawMedusaCollection }>(
      `/collections/${id}`,
      untransformCollection(data),
    )
    return transformCollection(res.collection)
  }

  async deleteCollection(credentials: Credentials, id: string): Promise<void> {
    await this.clientFor(credentials).delete(`/collections/${id}`)
  }

  // ── Locations ─────────────────────────────────────────────────────────────

  async listLocations(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<Location[]> {
    const client = this.clientFor(credentials)
    const items = await this.offsetPage<RawMedusaStockLocation>(client, '/stock-locations', 'stock_locations', params)
    return items.map(transformLocation)
  }

  async getLocation(credentials: Credentials, id: string): Promise<Location> {
    const client = this.clientFor(credentials)
    const res = await client.get<{ stock_location: RawMedusaStockLocation }>(
      `/stock-locations/${id}`,
    )
    return transformLocation(res.stock_location)
  }

  // ── Inventory ─────────────────────────────────────────────────────────────

  async listInventoryLevels(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<InventoryLevel[]> {
    const client = this.clientFor(credentials)
    // Levels are flattened out of inventory items (one per location level),
    // so one upstream page of items is not one caller page of levels: walk
    // fixed-size item pages by offset and cut the caller's rows from them.
    const filters = this.listParams(params)
    const host = (credentials.extra?.['host'] as string | undefined) ?? this.configHost ?? ''
    const key = cursorPagerKey(
      connectionScope(host, {
        accessToken: credentials.accessToken || this.configApiKey || '',
        refreshToken: credentials.refreshToken,
      }),
      'inventory-levels',
      { ...filters, limit: MAX_PAGE_SIZE },
    )
    const { items } = await pageByRows<InventoryLevel, number>(
      key,
      params,
      async (cursor) => {
        const offset = cursor ?? 0
        const res = await client.listWithOffset<RawMedusaInventoryItem>(
          '/inventory-items',
          'inventory_items',
          { ...filters, limit: MAX_PAGE_SIZE, offset },
        )
        const levels: InventoryLevel[] = []
        for (const item of res.items) {
          for (const ll of item.location_levels ?? []) {
            // Use the inventory item id as the variant id — in practice the
            // adapter caller should resolve variant → inventory_item mapping.
            levels.push(transformInventoryLevel(item, ll, item.id))
          }
        }
        const end = offset + res.items.length
        const more =
          res.items.length > 0 &&
          (res.count !== undefined ? end < res.count : res.items.length >= MAX_PAGE_SIZE)
        return { items: levels, next: more ? end : null }
      },
      { defaultLimit: DEFAULT_PAGE_SIZE },
    )
    return items
  }

  async getInventoryLevel(credentials: Credentials, id: string): Promise<InventoryLevel> {
    // id format: variantId:locationId
    const [variantId, locationId] = id.split(':')
    if (!variantId) throw new Error('Invalid inventory level id')
    const client = this.clientFor(credentials)
    const res = await client.get<{ inventory_item: RawMedusaInventoryItem }>(
      `/inventory-items/${variantId}`,
    )
    const item = res.inventory_item
    const ll = (item.location_levels ?? []).find(
      (l) => l.location_id === locationId,
    )
    if (!ll) {
      throw new Error(
        `No location level found for inventory item ${variantId} at location ${locationId}`,
      )
    }
    return transformInventoryLevel(item, ll, variantId)
  }

  async adjustInventoryLevel(
    credentials: Credentials,
    data: { variantId: string; locationId: string; delta: number },
  ): Promise<InventoryLevel> {
    const client = this.clientFor(credentials)
    // Medusa v2: POST /admin/inventory-items/{id}/location-levels/{location_id}
    // with { stocked_quantity: new_value }. We first GET current, then adjust.
    const res = await client.get<{ inventory_item: RawMedusaInventoryItem }>(
      `/inventory-items/${data.variantId}`,
    )
    const item = res.inventory_item
    const ll = (item.location_levels ?? []).find(
      (l) => l.location_id === data.locationId,
    )
    const currentQty = ll?.stocked_quantity ?? 0
    const newQty = currentQty + data.delta
    const updated = await client.post<{ inventory_item: RawMedusaInventoryItem }>(
      `/inventory-items/${data.variantId}/location-levels/${data.locationId}`,
      { stocked_quantity: newQty },
    )
    const updatedItem = updated.inventory_item
    const updatedLl = (updatedItem.location_levels ?? []).find(
      (l) => l.location_id === data.locationId,
    ) ?? { location_id: data.locationId, stocked_quantity: newQty }
    return transformInventoryLevel(updatedItem, updatedLl, data.variantId)
  }

  async setInventoryLevel(
    credentials: Credentials,
    data: { variantId: string; locationId: string; available: number },
  ): Promise<InventoryLevel> {
    const client = this.clientFor(credentials)
    const updated = await client.post<{ inventory_item: RawMedusaInventoryItem }>(
      `/inventory-items/${data.variantId}/location-levels/${data.locationId}`,
      { stocked_quantity: data.available },
    )
    const updatedItem = updated.inventory_item
    const updatedLl = (updatedItem.location_levels ?? []).find(
      (l) => l.location_id === data.locationId,
    ) ?? { location_id: data.locationId, stocked_quantity: data.available }
    return transformInventoryLevel(updatedItem, updatedLl, data.variantId)
  }

  // ── Customers ─────────────────────────────────────────────────────────────

  async listCustomers(credentials: Credentials, params: QueryParams): Promise<Customer[]> {
    const client = this.clientFor(credentials)
    const items = await this.offsetPage<RawMedusaCustomer>(client, '/customers', 'customers', params)
    return items.map(transformCustomer)
  }

  async getCustomer(credentials: Credentials, id: string): Promise<Customer> {
    const client = this.clientFor(credentials)
    const res = await client.get<{ customer: RawMedusaCustomer }>(`/customers/${id}`)
    return transformCustomer(res.customer)
  }

  async createCustomer(credentials: Credentials, data: Partial<Customer>): Promise<Customer> {
    const client = this.clientFor(credentials)
    const res = await client.post<{ customer: RawMedusaCustomer }>(
      '/customers',
      untransformCustomer(data),
    )
    return transformCustomer(res.customer)
  }

  async updateCustomer(
    credentials: Credentials,
    id: string,
    data: Partial<Customer>,
  ): Promise<Customer> {
    const client = this.clientFor(credentials)
    const res = await client.post<{ customer: RawMedusaCustomer }>(
      `/customers/${id}`,
      untransformCustomer(data),
    )
    return transformCustomer(res.customer)
  }

  async deleteCustomer(credentials: Credentials, id: string): Promise<void> {
    await this.clientFor(credentials).delete(`/customers/${id}`)
  }

  // ── Orders ────────────────────────────────────────────────────────────────

  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const client = this.clientFor(credentials)
    const items = await this.offsetPage<RawMedusaOrder>(client, '/orders', 'orders', params)
    return items.map(transformOrder)
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const client = this.clientFor(credentials)
    const res = await client.get<{ order: RawMedusaOrder }>(`/orders/${id}`)
    return transformOrder(res.order)
  }

  async createOrder(credentials: Credentials, data: Partial<Order>): Promise<Order> {
    const client = this.clientFor(credentials)
    const res = await client.post<{ order: RawMedusaOrder }>(
      '/orders',
      untransformOrder(data),
    )
    return transformOrder(res.order)
  }

  async updateOrder(
    credentials: Credentials,
    id: string,
    data: Partial<Order>,
  ): Promise<Order> {
    const client = this.clientFor(credentials)
    const res = await client.post<{ order: RawMedusaOrder }>(
      `/orders/${id}`,
      untransformOrder(data),
    )
    return transformOrder(res.order)
  }

  async cancelOrder(
    credentials: Credentials,
    id: string,
    _data?: { reason?: string },
  ): Promise<Order> {
    const client = this.clientFor(credentials)
    const res = await client.post<{ order: RawMedusaOrder }>(
      `/orders/${id}/cancel`,
    )
    return transformOrder(res.order)
  }

  // ── Fulfillments ──────────────────────────────────────────────────────────

  async listFulfillments(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<Fulfillment[]> {
    const orderId = (params['order_id'] ?? params['orderId']) as string | undefined
    if (orderId == null) {
      throw new Error('listFulfillments requires `order_id` in query params')
    }
    const client = this.clientFor(credentials)
    const res = await client.get<{ order: RawMedusaOrder }>(`/orders/${orderId}`)
    return (res.order.fulfillments ?? []).map((f) => {
      const raw = f as unknown as RawMedusaFulfillment
      return transformFulfillment(raw, orderId)
    })
  }

  async getFulfillment(credentials: Credentials, id: string): Promise<Fulfillment> {
    const client = this.clientFor(credentials)
    const res = await client.get<{ fulfillment: RawMedusaFulfillment }>(
      `/fulfillments/${id}`,
    )
    return transformFulfillment(res.fulfillment)
  }

  async createFulfillment(
    credentials: Credentials,
    data: Partial<Fulfillment>,
  ): Promise<Fulfillment> {
    if (!data.orderId) throw new Error('createFulfillment requires orderId')
    const client = this.clientFor(credentials)
    const res = await client.post<{ order: RawMedusaOrder }>(
      `/orders/${data.orderId}/fulfillments`,
      untransformFulfillment(data),
    )
    // Return the latest fulfillment from the order
    const fulfillments = res.order.fulfillments ?? []
    const latest = fulfillments[fulfillments.length - 1] as unknown as RawMedusaFulfillment
    return transformFulfillment(latest ?? { id: 'unknown' }, data.orderId)
  }

  async cancelFulfillment(credentials: Credentials, id: string): Promise<Fulfillment> {
    const client = this.clientFor(credentials)
    const res = await client.post<{ fulfillment: RawMedusaFulfillment }>(
      `/fulfillments/${id}/cancel`,
    )
    return transformFulfillment(res.fulfillment)
  }

  // ── Refunds ───────────────────────────────────────────────────────────────

  async listRefunds(credentials: Credentials, params: QueryParams): Promise<Refund[]> {
    const orderId = (params['order_id'] ?? params['orderId']) as string | undefined
    if (orderId == null) {
      throw new Error('listRefunds requires `order_id` in query params')
    }
    const client = this.clientFor(credentials)
    const res = await client.get<{ order: RawMedusaOrder }>(`/orders/${orderId}`)
    const currency = res.order.currency_code ?? 'USD'
    return (res.order.refunds ?? []).map((r) => {
      const raw = r as unknown as RawMedusaRefund
      return transformRefund(raw, orderId, currency)
    })
  }

  async getRefund(credentials: Credentials, id: string): Promise<Refund> {
    // Medusa doesn't have a direct refund GET — parse composite id
    const [orderId, refundId] = id.split(':')
    if (!orderId || !refundId) {
      throw new Error('Invalid refund id format: expected `orderId:refundId`')
    }
    const client = this.clientFor(credentials)
    const res = await client.get<{ order: RawMedusaOrder }>(`/orders/${orderId}`)
    const currency = res.order.currency_code ?? 'USD'
    const refund = (res.order.refunds ?? []).find(
      (r) => r.id === refundId,
    ) as unknown as RawMedusaRefund | undefined
    if (!refund) throw new Error(`Refund ${refundId} not found on order ${orderId}`)
    return transformRefund(refund, orderId, currency)
  }

  async createRefund(credentials: Credentials, data: Partial<Refund>): Promise<Refund> {
    if (!data.orderId) throw new Error('createRefund requires orderId')
    const client = this.clientFor(credentials)
    const res = await client.post<{ order: RawMedusaOrder }>(
      `/orders/${data.orderId}/refunds`,
      untransformRefund(data),
    )
    const currency = res.order.currency_code ?? 'USD'
    const refunds = res.order.refunds ?? []
    const latest = refunds[refunds.length - 1] as unknown as RawMedusaRefund
    return transformRefund(latest ?? { id: 'unknown' }, data.orderId, currency)
  }

  // ── Transactions ──────────────────────────────────────────────────────────
  // Medusa v2 exposes payments via GET /admin/payments (list) and
  // GET /admin/payments/{id} (single). Payments are the closest analogue to
  // the canonical Transaction resource. Payment creation belongs to the
  // checkout/payment-session flow — there is no POST /admin/payments endpoint,
  // so createTransaction is intentionally not implemented.

  async listTransactions(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<Transaction[]> {
    const client = this.clientFor(credentials)
    const items = await this.offsetPage<RawMedusaPayment>(client, '/payments', 'payments', params)
    return items.map((p) => transformTransaction(p))
  }

  async getTransaction(credentials: Credentials, id: string): Promise<Transaction> {
    const client = this.clientFor(credentials)
    const res = await client.get<{ payment: RawMedusaPayment }>(`/payments/${id}`)
    return transformTransaction(res.payment)
  }

  // ── Discounts ─────────────────────────────────────────────────────────────

  async listDiscounts(credentials: Credentials, params: QueryParams): Promise<Discount[]> {
    const client = this.clientFor(credentials)
    const items = await this.offsetPage<RawMedusaPromotion>(client, '/promotions', 'promotions', params)
    return items.map(transformDiscount)
  }

  async getDiscount(credentials: Credentials, id: string): Promise<Discount> {
    const client = this.clientFor(credentials)
    const res = await client.get<{ promotion: RawMedusaPromotion }>(`/promotions/${id}`)
    return transformDiscount(res.promotion)
  }

  async createDiscount(credentials: Credentials, data: Partial<Discount>): Promise<Discount> {
    const client = this.clientFor(credentials)
    const res = await client.post<{ promotion: RawMedusaPromotion }>(
      '/promotions',
      untransformDiscount(data),
    )
    return transformDiscount(res.promotion)
  }

  async updateDiscount(
    credentials: Credentials,
    id: string,
    data: Partial<Discount>,
  ): Promise<Discount> {
    const client = this.clientFor(credentials)
    const res = await client.post<{ promotion: RawMedusaPromotion }>(
      `/promotions/${id}`,
      untransformDiscount(data),
    )
    return transformDiscount(res.promotion)
  }

  async deleteDiscount(credentials: Credentials, id: string): Promise<void> {
    await this.clientFor(credentials).delete(`/promotions/${id}`)
  }
}
