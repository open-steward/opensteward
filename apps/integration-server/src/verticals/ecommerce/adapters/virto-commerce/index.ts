/**
 * Virto Commerce adapter for the ecommerce vertical.
 *
 * Maps the self-hosted Virto Commerce Platform Manager REST API to the
 * canonical ecommerce resources. Verified against the live Swagger of the
 * public demo instance (https://virtostart-demo-admin.govirto.com/docs/index.html,
 * fetched 2026-09-13) — see each `./transform/*.ts` file header for the
 * exact schema paths and shapes used.
 *
 * Auth: a static per-user API key sent via the `api_key` request header
 * (one of several schemes the platform documents; chosen over the
 * password/client-credentials `/connect/token` grant because it needs no
 * refresh flow — see `./connect-form.ts`). No central OAuth app exists;
 * every instance is self-hosted with its own identity server.
 *
 * ── Resource coverage ────────────────────────────────────────────────────
 * Available: product, variant, collection, location, inventory, customer,
 *   order (+ cancel), fulfillment, transaction, discount.
 * Unavailable: refund — see `./metadata.ts`.
 */
import { reportUpstreamPage } from '@opensteward/shared'
import type { Credentials, QueryParams } from '@opensteward/shared'
import type { EcommerceAdapter } from '../../adapter/interface'
import type { Product, ProductVariant } from '../../schema/product'
import type { Collection } from '../../schema/collection'
import type { Location } from '../../schema/location'
import type { InventoryLevel } from '../../schema/inventory'
import type { Customer } from '../../schema/customer'
import type { Order } from '../../schema/order'
import type { Fulfillment } from '../../schema/fulfillment'
import type { Transaction } from '../../schema/transaction'
import type { Discount } from '../../schema/discount'
import type { Money } from '../../schema/shared'

import { buildAuthUrl, exchangeCode as virtoExchangeCode } from './auth'
import { CONNECT_FORM } from './connect-form'
import { VirtoCommerceClient } from './client'
import { DEFAULT_PAGE_SIZE } from './constants'

import {
  transformProduct,
  transformVariant,
  untransformProduct,
  type RawVirtoCatalogProduct,
} from './transform/product'
import { transformCollection, untransformCollection, type RawVirtoCategory } from './transform/collection'
import { transformLocation, type RawVirtoFulfillmentCenter } from './transform/location'
import { transformInventoryLevel, type RawVirtoInventoryInfo } from './transform/inventory'
import { transformCustomer, untransformCustomer, type RawVirtoContact } from './transform/customer'
import { transformOrder, type RawVirtoCustomerOrder } from './transform/order'
import { transformFulfillment, type RawVirtoOrderShipment } from './transform/fulfillment'
import { transformTransaction, type RawVirtoPaymentInDetail } from './transform/transaction'
import {
  transformDiscount,
  untransformDiscount,
  type RawVirtoPromotion,
  type RawVirtoCoupon,
} from './transform/discount'

export type VirtoCommerceAdapterConfig = Record<string, never>

type JsonPatchOp = { op: string; path: string; value?: unknown }

/** Build a JSON Patch (RFC 6902) replacing each given field, skipping `undefined`s. */
function toJsonPatch(fields: Record<string, unknown>): JsonPatchOp[] {
  return Object.entries(fields)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => ({ op: 'replace', path: `/${key}`, value }))
}

function pageCriteria(params: QueryParams): { skip: number; take: number } {
  return { skip: params.page && params.page > 1 ? (params.page - 1) * (params.limit ?? DEFAULT_PAGE_SIZE) : 0, take: params.limit ?? DEFAULT_PAGE_SIZE }
}

export class VirtoCommerceAdapter implements EcommerceAdapter {
  readonly platform = 'virto-commerce'
  readonly version = '0.1.0'
  readonly capabilities = { maxPageSize: 200 }

  credentialFields = CONNECT_FORM.credentialFields
  exchangeCredentials = CONNECT_FORM.exchangeCredentials

  constructor(_config: VirtoCommerceAdapterConfig = {}) {}

  // ── Auth ──────────────────────────────────────────────────────────────────

  getAuthUrl(_state: string): string {
    return buildAuthUrl()
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    return virtoExchangeCode()
  }

  /** Virto Commerce API keys are static and do not expire. */
  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return credentials
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private clientFor(credentials: Credentials): VirtoCommerceClient {
    return new VirtoCommerceClient(credentials)
  }

  /**
   * Resolve a single product/variation's price via the verified
   * `GET /api/products/{id}/prices` endpoint (bare `Price[]`, no wrapper —
   * see `VirtoCommerce.Pricing/swagger.json`). Returns `undefined` when the
   * platform reports no price (no pricelist entry, or one with neither
   * `sale` nor `list` set) rather than fabricate one.
   */
  private async resolvePrice(client: VirtoCommerceClient, productId: string): Promise<Money | undefined> {
    const prices = await client.get<Array<{ sale?: number; list?: number; currency?: string }>>(
      `/api/products/${productId}/prices`,
    )
    const first = prices?.[0]
    if (!first) return undefined
    const amount = first.sale ?? first.list
    if (amount == null || first.currency == null) return undefined
    return { amount: Math.round(amount * 100), currency: first.currency }
  }

  // ── Products ──────────────────────────────────────────────────────────────

  async listProducts(credentials: Credentials, params: QueryParams): Promise<Product[]> {
    const client = this.clientFor(credentials)
    const { skip, take } = pageCriteria(params)
    const res = await client.search<RawVirtoCatalogProduct>(
      '/api/catalog/search/products',
      { skip, take },
      'items',
    )
    reportUpstreamPage(params, { hasMore: skip + res.items.length < res.totalCount, totalCount: res.totalCount })
    return res.items.map((p) => transformProduct(p))
  }

  async getProduct(credentials: Credentials, id: string): Promise<Product> {
    // No `respGroup` param is passed: its accepted values are undocumented
    // in the swagger (a free-text field with no enum), so whether
    // `variations` populates here is whatever the platform's default
    // response group includes — see `./transform/product.ts`.
    const client = this.clientFor(credentials)
    const raw = await client.get<RawVirtoCatalogProduct>(`/api/catalog/products/${id}`)
    const variantIds = raw.variations?.map((v) => v.id) ?? []
    const prices: Record<string, Money> = {}
    await Promise.all(
      variantIds.map(async (vid) => {
        const price = await this.resolvePrice(client, vid)
        if (price) prices[vid] = price
      }),
    )
    return transformProduct(raw, prices)
  }

  async createProduct(credentials: Credentials, data: Partial<Product>): Promise<Product> {
    const raw = await this.clientFor(credentials).post<RawVirtoCatalogProduct>(
      '/api/catalog/products',
      untransformProduct(data),
    )
    return transformProduct(raw)
  }

  async updateProduct(credentials: Credentials, id: string, data: Partial<Product>): Promise<Product> {
    const client = this.clientFor(credentials)
    await client.patch(`/api/catalog/products/${id}`, toJsonPatch(untransformProduct(data)))
    return this.getProduct(credentials, id)
  }

  async deleteProduct(credentials: Credentials, id: string): Promise<void> {
    await this.clientFor(credentials).delete('/api/catalog/products', { ids: [id] })
  }

  // ── Variants (a variation is a CatalogProduct with mainProductId set) ─────

  /**
   * The sync worker calls list methods with only `{ page, limit }`. With a
   * `productId` filter this returns that product's own (price-resolved)
   * variants; without one it pages through the product catalog itself
   * (`/api/catalog/search/products`, the same endpoint `listProducts` uses)
   * and flattens whatever variants each page's products resolve.
   */
  async listVariants(credentials: Credentials, params: QueryParams): Promise<ProductVariant[]> {
    const productId = (params['productId'] ?? params['product_id']) as string | undefined
    if (productId) {
      const product = await this.getProduct(credentials, productId)
      return product.variants ?? []
    }

    const client = this.clientFor(credentials)
    const { skip, take } = pageCriteria(params)
    const res = await client.search<RawVirtoCatalogProduct>(
      '/api/catalog/search/products',
      { skip, take },
      'items',
    )
    reportUpstreamPage(params, { hasMore: skip + res.items.length < res.totalCount, totalCount: res.totalCount })

    const variants: ProductVariant[] = []
    for (const p of res.items) {
      if (!p.variations || p.variations.length === 0) continue
      await Promise.all(
        p.variations.map(async (v) => {
          const price = await this.resolvePrice(client, v.id)
          if (price) variants.push(transformVariant(v, price))
        }),
      )
    }
    return variants
  }

  async getVariant(credentials: Credentials, id: string): Promise<ProductVariant> {
    const client = this.clientFor(credentials)
    const raw = await client.get<RawVirtoCatalogProduct>(`/api/catalog/products/${id}`)
    const price = await this.resolvePrice(client, id)
    if (!price) {
      throw new Error(
        `Virto Commerce variant ${id} has no price in any pricelist — cannot build a valid ` +
          'canonical ProductVariant (price is required).',
      )
    }
    return transformVariant(raw, price)
  }

  async createVariant(credentials: Credentials, data: Partial<ProductVariant>): Promise<ProductVariant> {
    if (!data.productId) throw new Error('createVariant requires productId')
    // The catalog product-create endpoint has no price field — pricing is a
    // separate module — so a real price must come from the caller; there is
    // no honest value to report otherwise.
    if (!data.price) {
      throw new Error(
        'createVariant requires price — Virto Commerce\'s catalog product-create endpoint does ' +
          'not set price (pricing is a separate module); configure it there and pass the same ' +
          'value here to reflect it on the returned variant.',
      )
    }
    const raw = await this.clientFor(credentials).post<RawVirtoCatalogProduct>('/api/catalog/products', {
      name: data.title,
      code: data.sku,
      mainProductId: data.productId,
    })
    return transformVariant(raw, data.price)
  }

  async updateVariant(
    credentials: Credentials,
    id: string,
    data: Partial<ProductVariant>,
  ): Promise<ProductVariant> {
    const client = this.clientFor(credentials)
    const fields: Record<string, unknown> = {}
    if (data.title != null) fields['name'] = data.title
    if (data.sku != null) fields['code'] = data.sku
    await client.patch(`/api/catalog/products/${id}`, toJsonPatch(fields))
    return this.getVariant(credentials, id)
  }

  async deleteVariant(credentials: Credentials, id: string): Promise<void> {
    await this.clientFor(credentials).delete('/api/catalog/products', { ids: [id] })
  }

  // ── Collections (Categories) ─────────────────────────────────────────────

  async listCollections(credentials: Credentials, params: QueryParams): Promise<Collection[]> {
    const { skip, take } = pageCriteria(params)
    const res = await this.clientFor(credentials).search<RawVirtoCategory>(
      '/api/catalog/search/categories',
      { skip, take },
      'items',
    )
    reportUpstreamPage(params, { hasMore: skip + res.items.length < res.totalCount, totalCount: res.totalCount })
    return res.items.map(transformCollection)
  }

  async getCollection(credentials: Credentials, id: string): Promise<Collection> {
    const raw = await this.clientFor(credentials).get<RawVirtoCategory>(`/api/catalog/categories/${id}`)
    return transformCollection(raw)
  }

  async createCollection(credentials: Credentials, data: Partial<Collection>): Promise<Collection> {
    const raw = await this.clientFor(credentials).post<RawVirtoCategory>(
      '/api/catalog/categories',
      untransformCollection(data),
    )
    return transformCollection(raw)
  }

  async updateCollection(
    credentials: Credentials,
    id: string,
    data: Partial<Collection>,
  ): Promise<Collection> {
    const client = this.clientFor(credentials)
    await client.patch(`/api/catalog/categories/${id}`, toJsonPatch(untransformCollection(data)))
    return this.getCollection(credentials, id)
  }

  async deleteCollection(credentials: Credentials, id: string): Promise<void> {
    await this.clientFor(credentials).delete('/api/catalog/categories', { ids: [id] })
  }

  // ── Locations (Fulfillment Centers) ──────────────────────────────────────

  async listLocations(credentials: Credentials, params: QueryParams): Promise<Location[]> {
    const { skip, take } = pageCriteria(params)
    const res = await this.clientFor(credentials).search<RawVirtoFulfillmentCenter>(
      '/api/inventory/fulfillmentcenters/search',
      { skip, take },
      'results',
    )
    reportUpstreamPage(params, { hasMore: skip + res.items.length < res.totalCount, totalCount: res.totalCount })
    return res.items.map(transformLocation)
  }

  async getLocation(credentials: Credentials, id: string): Promise<Location> {
    const raw = await this.clientFor(credentials).get<RawVirtoFulfillmentCenter>(
      `/api/inventory/fulfillmentcenters/${id}`,
    )
    return transformLocation(raw)
  }

  // ── Inventory ─────────────────────────────────────────────────────────────

  async listInventoryLevels(credentials: Credentials, params: QueryParams): Promise<InventoryLevel[]> {
    const productIds = params['productIds'] ?? params['product_id']
    const fulfillmentCenterIds = params['locationIds'] ?? params['location_id']
    const { skip, take } = pageCriteria(params)
    const res = await this.clientFor(credentials).search<RawVirtoInventoryInfo>(
      '/api/inventory/search',
      {
        skip,
        take,
        productIds: productIds != null ? [String(productIds)] : undefined,
        fulfillmentCenterIds: fulfillmentCenterIds != null ? [String(fulfillmentCenterIds)] : undefined,
      },
      'results',
    )
    reportUpstreamPage(params, { hasMore: skip + res.items.length < res.totalCount, totalCount: res.totalCount })
    return res.items.map(transformInventoryLevel)
  }

  async getInventoryLevel(credentials: Credentials, id: string): Promise<InventoryLevel> {
    const [productId, fulfillmentCenterId] = id.split(':')
    if (!productId || !fulfillmentCenterId) {
      throw new Error('Invalid inventory level id format: expected `productId:fulfillmentCenterId`')
    }
    const res = await this.clientFor(credentials).search<RawVirtoInventoryInfo>(
      '/api/inventory/search',
      { productIds: [productId], fulfillmentCenterIds: [fulfillmentCenterId], take: 1 },
      'results',
    )
    const raw = res.items[0]
    if (!raw) throw new Error(`Inventory level not found: ${id}`)
    return transformInventoryLevel(raw)
  }

  private async currentInventory(
    client: VirtoCommerceClient,
    variantId: string,
    locationId: string,
  ): Promise<RawVirtoInventoryInfo> {
    const res = await client.search<RawVirtoInventoryInfo>(
      '/api/inventory/search',
      { productIds: [variantId], fulfillmentCenterIds: [locationId], take: 1 },
      'results',
    )
    return (
      res.items[0] ?? {
        productId: variantId,
        fulfillmentCenterId: locationId,
        inStockQuantity: 0,
      }
    )
  }

  async adjustInventoryLevel(
    credentials: Credentials,
    data: { variantId: string; locationId: string; delta: number },
  ): Promise<InventoryLevel> {
    const client = this.clientFor(credentials)
    const current = await this.currentInventory(client, data.variantId, data.locationId)
    const updated = await client.put<RawVirtoInventoryInfo>(`/api/inventory/products/${data.variantId}`, {
      ...current,
      inStockQuantity: (current.inStockQuantity ?? 0) + data.delta,
    })
    return transformInventoryLevel(updated)
  }

  async setInventoryLevel(
    credentials: Credentials,
    data: { variantId: string; locationId: string; available: number },
  ): Promise<InventoryLevel> {
    const client = this.clientFor(credentials)
    const current = await this.currentInventory(client, data.variantId, data.locationId)
    const updated = await client.put<RawVirtoInventoryInfo>(`/api/inventory/products/${data.variantId}`, {
      ...current,
      inStockQuantity: data.available + (current.reservedQuantity ?? 0),
    })
    return transformInventoryLevel(updated)
  }

  // ── Customers (Contacts) ─────────────────────────────────────────────────

  async listCustomers(credentials: Credentials, params: QueryParams): Promise<Customer[]> {
    const { skip, take } = pageCriteria(params)
    const res = await this.clientFor(credentials).search<RawVirtoContact>(
      '/api/contacts/search',
      { skip, take },
      'results',
    )
    reportUpstreamPage(params, { hasMore: skip + res.items.length < res.totalCount, totalCount: res.totalCount })
    return res.items.map(transformCustomer)
  }

  async getCustomer(credentials: Credentials, id: string): Promise<Customer> {
    const raw = await this.clientFor(credentials).get<RawVirtoContact>(`/api/contacts/${id}`)
    return transformCustomer(raw)
  }

  async createCustomer(credentials: Credentials, data: Partial<Customer>): Promise<Customer> {
    const raw = await this.clientFor(credentials).post<RawVirtoContact>(
      '/api/contacts',
      untransformCustomer(data),
    )
    return transformCustomer(raw)
  }

  async updateCustomer(credentials: Credentials, id: string, data: Partial<Customer>): Promise<Customer> {
    const client = this.clientFor(credentials)
    await client.patch(`/api/contacts/${id}`, toJsonPatch(untransformCustomer(data)))
    return this.getCustomer(credentials, id)
  }

  async deleteCustomer(credentials: Credentials, id: string): Promise<void> {
    await this.clientFor(credentials).delete('/api/contacts', { ids: [id] })
  }

  // ── Orders (Customer Orders) ─────────────────────────────────────────────

  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const { skip, take } = pageCriteria(params)
    const res = await this.clientFor(credentials).search<RawVirtoCustomerOrder>(
      '/api/order/customerOrders/search',
      { skip, take },
      'results',
    )
    reportUpstreamPage(params, { hasMore: skip + res.items.length < res.totalCount, totalCount: res.totalCount })
    return res.items.map(transformOrder)
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const raw = await this.clientFor(credentials).get<RawVirtoCustomerOrder>(
      `/api/order/customerOrders/${id}`,
    )
    return transformOrder(raw)
  }

  async updateOrder(credentials: Credentials, id: string, data: Partial<Order>): Promise<Order> {
    const client = this.clientFor(credentials)
    const fields: Record<string, unknown> = {}
    if (data.note != null) fields['comment'] = data.note
    await client.patch(`/api/order/customerOrders/${id}`, toJsonPatch(fields))
    return this.getOrder(credentials, id)
  }

  async cancelOrder(credentials: Credentials, id: string, data?: { reason?: string }): Promise<Order> {
    const client = this.clientFor(credentials)
    await client.patch(
      `/api/order/customerOrders/${id}`,
      toJsonPatch({ isCancelled: true, cancelReason: data?.reason }),
    )
    return this.getOrder(credentials, id)
  }

  // ── Fulfillments (Shipments) ──────────────────────────────────────────────
  //
  // `orderId` is an optional filter on `ShipmentSearchCriteria` (not a
  // required path/query param), so the sync worker's plain `{ page, limit }`
  // call pages through every shipment; passing `order_id`/`orderId` narrows
  // to one order.

  async listFulfillments(credentials: Credentials, params: QueryParams): Promise<Fulfillment[]> {
    const orderId = params['order_id'] ?? params['orderId']
    const { skip, take } = pageCriteria(params)
    const res = await this.clientFor(credentials).search<RawVirtoOrderShipment>(
      '/api/order/shipments/search',
      { orderId: orderId != null ? String(orderId) : undefined, skip, take },
      'results',
    )
    reportUpstreamPage(params, { hasMore: skip + res.items.length < res.totalCount, totalCount: res.totalCount })
    return res.items.map(transformFulfillment)
  }

  async getFulfillment(credentials: Credentials, id: string): Promise<Fulfillment> {
    const res = await this.clientFor(credentials).search<RawVirtoOrderShipment>(
      '/api/order/shipments/search',
      { ids: [id], take: 1 },
      'results',
    )
    const raw = res.items[0]
    if (!raw) throw new Error(`Fulfillment not found: ${id}`)
    return transformFulfillment(raw)
  }

  async createFulfillment(credentials: Credentials, data: Partial<Fulfillment>): Promise<Fulfillment> {
    if (!data.orderId) throw new Error('createFulfillment requires orderId')
    const raw = await this.clientFor(credentials).post<RawVirtoOrderShipment>('/api/order/shipments', {
      customerOrderId: data.orderId,
      fulfillmentCenterId: data.locationId,
      shipmentMethodCode: data.service,
      trackingNumber: data.trackingNumber,
      trackingUrl: data.trackingUrl,
    })
    return transformFulfillment(raw)
  }

  async updateFulfillment(
    credentials: Credentials,
    id: string,
    data: Partial<Fulfillment>,
  ): Promise<Fulfillment> {
    const client = this.clientFor(credentials)
    const fields: Record<string, unknown> = {}
    if (data.trackingNumber != null) fields['trackingNumber'] = data.trackingNumber
    if (data.trackingUrl != null) fields['trackingUrl'] = data.trackingUrl
    await client.patch(`/api/order/shipments/${id}`, toJsonPatch(fields))
    return this.getFulfillment(credentials, id)
  }

  // ── Transactions (Payments) ───────────────────────────────────────────────
  //
  // `orderId` is an optional filter on `PaymentSearchCriteria`, so the sync
  // worker's plain `{ page, limit }` call pages through every payment.

  async listTransactions(credentials: Credentials, params: QueryParams): Promise<Transaction[]> {
    const orderId = params['order_id'] ?? params['orderId']
    const { skip, take } = pageCriteria(params)
    const res = await this.clientFor(credentials).search<RawVirtoPaymentInDetail>(
      '/api/order/payments/search',
      { orderId: orderId != null ? String(orderId) : undefined, skip, take },
      'results',
    )
    reportUpstreamPage(params, { hasMore: skip + res.items.length < res.totalCount, totalCount: res.totalCount })
    return res.items.map(transformTransaction)
  }

  async getTransaction(credentials: Credentials, id: string): Promise<Transaction> {
    const raw = await this.clientFor(credentials).get<RawVirtoPaymentInDetail>(`/api/order/payments/${id}`)
    return transformTransaction(raw)
  }

  async createTransaction(credentials: Credentials, data: Partial<Transaction>): Promise<Transaction> {
    if (!data.orderId) throw new Error('createTransaction requires orderId')
    const raw = await this.clientFor(credentials).post<RawVirtoPaymentInDetail>('/api/order/payments', {
      orderId: data.orderId,
      gatewayCode: data.gateway,
      total: data.amount ? data.amount.amount / 100 : undefined,
      currency: data.amount?.currency,
    })
    return transformTransaction(raw)
  }

  // ── Discounts (Promotions + Coupons) ─────────────────────────────────────

  async listDiscounts(credentials: Credentials, params: QueryParams): Promise<Discount[]> {
    const client = this.clientFor(credentials)
    const { skip, take } = pageCriteria(params)
    const res = await client.search<RawVirtoPromotion>('/api/marketing/promotions/search', { skip, take }, 'results')
    reportUpstreamPage(params, { hasMore: skip + res.items.length < res.totalCount, totalCount: res.totalCount })
    const promotionIds = res.items.map((p) => p.id)
    const coupons =
      promotionIds.length > 0
        ? await client.search<RawVirtoCoupon>(
            '/api/marketing/promotions/coupons/search',
            { promotionIds, take: promotionIds.length },
            'results',
          )
        : { items: [] as RawVirtoCoupon[], totalCount: 0 }
    const couponByPromotion = new Map(coupons.items.map((c) => [c.promotionId, c]))
    return res.items.map((p) => transformDiscount(p, couponByPromotion.get(p.id)))
  }

  async getDiscount(credentials: Credentials, id: string): Promise<Discount> {
    const client = this.clientFor(credentials)
    const promotion = await client.get<RawVirtoPromotion>(`/api/marketing/promotions/${id}`)
    const coupons = await client.search<RawVirtoCoupon>(
      '/api/marketing/promotions/coupons/search',
      { promotionIds: [id], take: 1 },
      'results',
    )
    return transformDiscount(promotion, coupons.items[0])
  }

  async createDiscount(credentials: Credentials, data: Partial<Discount>): Promise<Discount> {
    const client = this.clientFor(credentials)
    const promotion = await client.post<RawVirtoPromotion>(
      '/api/marketing/promotions',
      untransformDiscount(data),
    )
    let coupon: RawVirtoCoupon | undefined
    if (data.code) {
      const created = await client.post<RawVirtoCoupon[]>('/api/marketing/promotions/coupons/add', [
        { code: data.code, promotionId: promotion.id },
      ])
      coupon = created[0]
    }
    return transformDiscount(promotion, coupon)
  }

  async updateDiscount(credentials: Credentials, id: string, data: Partial<Discount>): Promise<Discount> {
    const client = this.clientFor(credentials)
    const promotion = await client.put<RawVirtoPromotion>('/api/marketing/promotions', {
      id,
      ...untransformDiscount(data),
    })
    return transformDiscount(promotion)
  }

  async deleteDiscount(credentials: Credentials, id: string): Promise<void> {
    await this.clientFor(credentials).delete('/api/marketing/promotions', { ids: [id] })
  }
}
