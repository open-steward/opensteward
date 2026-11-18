import { simpleApiKey } from '@opensteward/shared'
/**
 * nopCommerce adapter for the ecommerce vertical.
 *
 * Maps the nopCommerce REST API (`/api/`) to the canonical ecommerce
 * resources. nopCommerce uses bearer-token / API-key authentication —
 * there is no OAuth code-exchange flow.
 *
 * Key differences from WooCommerce:
 *  - Variants are modelled as "product attribute combinations" rather than
 *    first-class objects — limited variant CRUD.
 *  - Stock lives on the product or attribute combination — no separate
 *    inventory ledger.
 *  - No native refund endpoint — refunds are status transitions on orders.
 *  - Categories rather than collections.
 *
 * ~30 of 42 interface methods are implemented.
 *
 * Docs: https://docs.nopcommerce.com/en/developer/web-api/index.html
 */

import type { Credentials, QueryParams } from '@opensteward/shared'
import type { EcommerceAdapter } from '../../adapter/interface'
import type { Product, ProductVariant } from '../../schema/product'
import type { Collection } from '../../schema/collection'
import type { Location } from '../../schema/location'
import type { InventoryLevel } from '../../schema/inventory'
import type { Customer } from '../../schema/customer'
import type { Order } from '../../schema/order'
import type { Discount } from '../../schema/discount'
import type { WebhookEvent } from '../../schema/webhook'
import type { Fulfillment } from '../../schema/fulfillment'
import type { Transaction } from '../../schema/transaction'

import { buildAuthUrl, exchangeCode as nopExchangeCode } from './auth'
import { NopCommerceClient } from './client'
import { DEFAULT_PAGE_SIZE } from './constants'
import {
  verifyNopCommerceWebhook,
  parseNopCommerceWebhookEvents,
} from './webhook'

import {
  transformProduct,
  untransformProduct,
  transformProductVariant,
  untransformProductVariant,
  type RawNopProduct,
  type RawNopAttributeCombination,
} from './transform/product'
import {
  transformCollection,
  untransformCollection,
  type RawNopCategory,
} from './transform/collection'
import {
  transformCustomer,
  untransformCustomer,
  type RawNopCustomer,
} from './transform/customer'
import {
  transformOrder,
  untransformOrder,
  type RawNopOrder,
} from './transform/order'
import {
  transformDiscount,
  untransformDiscount,
  type RawNopDiscount,
} from './transform/discount'
import { syntheticDefaultLocation } from './transform/location'
import {
  transformInventoryLevel,
  type RawNopProductStock,
} from './transform/inventory'
import {
  transformFulfillment,
  type RawNopShipment,
} from './transform/fulfillment'
import {
  transformTransaction,
  type RawNopTransaction,
} from './transform/transaction'

export interface NopCommerceAdapterConfig {
  /** API token (optional — may come from per-connection credentials instead). */
  apiToken?: string
  /** nopCommerce host URL, e.g. `https://shop.example.com`. */
  host?: string
}
const SIMPLE_API_KEY_FORM = simpleApiKey()


export class NopCommerceAdapter implements EcommerceAdapter {

  // Connect Link support — single API-key form.

  credentialFields = SIMPLE_API_KEY_FORM.credentialFields

  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'nopcommerce'
  readonly version = '0.1.0'
  /** Honours `params.search`; see AdapterCapabilities. Declared so the
   *  router can refuse the parameter on adapters that would drop it. */
  readonly capabilities = { search: true }

  private configToken: string | undefined
  private configHost: string | undefined

  constructor(config: NopCommerceAdapterConfig = {}) {
    this.configToken = config.apiToken
    this.configHost = config.host
  }

  // ── Auth ──────────────────────────────────────────────────────────────────

  getAuthUrl(_state: string): string {
    return buildAuthUrl(this.configHost ?? 'https://your-nopcommerce-site.example')
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    return nopExchangeCode()
  }

  /**
   * nopCommerce API tokens do not expire and are not rotated, so
   * `refreshCredentials` is a no-op.
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
    return verifyNopCommerceWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    const topic =
      (payload['event_type'] as string | undefined) ??
      (payload['topic'] as string | undefined)
    return parseNopCommerceWebhookEvents(payload, topic)
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private clientFor(credentials: Credentials): NopCommerceClient {
    const apiToken =
      credentials.accessToken && credentials.accessToken !== 'api-key'
        ? credentials.accessToken
        : this.configToken
    const host = (credentials.extra?.['host'] as string | undefined) ?? this.configHost

    if (!apiToken || !host) {
      throw new Error(
        'nopCommerce adapter is missing apiToken/host — ' +
          'either configure them in apps/integration-server/config/config.yml under adapters.nopcommerce, ' +
          'or POST them to /v1/connections with credentials: {apiToken, host}.',
      )
    }

    const mergedCreds: Credentials = {
      ...credentials,
      accessToken: apiToken,
      extra: { ...credentials.extra, host },
    }
    return new NopCommerceClient(mergedCreds)
  }

  private listParams(params: QueryParams): Record<string, unknown> {
    const out: Record<string, unknown> = {
      limit: params.limit ?? DEFAULT_PAGE_SIZE,
    }
    if (params.page != null) out['page'] = params.page
    if (params.updatedAfter) out['updated_at_min'] = params.updatedAfter.toISOString()
    if (params.search) out['search'] = params.search
    return out
  }

  // ── Products ──────────────────────────────────────────────────────────────

  async listProducts(credentials: Credentials, params: QueryParams): Promise<Product[]> {
    const client = this.clientFor(credentials)
    const res = await client.listWithPage<RawNopProduct>(
      'products',
      'products',
      this.listParams(params),
    )
    return res.items.map((p) => transformProduct(p))
  }

  async getProduct(credentials: Credentials, id: string): Promise<Product> {
    const client = this.clientFor(credentials)
    const res = await client.get<{ products: RawNopProduct[] }>(`products/${id}`)
    const product = res.products?.[0]
    if (!product) throw new Error(`Product ${id} not found`)
    return transformProduct(product)
  }

  async createProduct(
    credentials: Credentials,
    data: Partial<Product>,
  ): Promise<Product> {
    const client = this.clientFor(credentials)
    const res = await client.post<{ products: RawNopProduct[] }>(
      'products',
      { product: untransformProduct(data) },
    )
    const product = res.products?.[0]
    if (!product) throw new Error('Failed to create product')
    return transformProduct(product)
  }

  async updateProduct(
    credentials: Credentials,
    id: string,
    data: Partial<Product>,
  ): Promise<Product> {
    const client = this.clientFor(credentials)
    const res = await client.put<{ products: RawNopProduct[] }>(
      `products/${id}`,
      { product: { id: Number(id), ...untransformProduct(data) } },
    )
    const product = res.products?.[0]
    if (!product) throw new Error(`Failed to update product ${id}`)
    return transformProduct(product)
  }

  async deleteProduct(credentials: Credentials, id: string): Promise<void> {
    await this.clientFor(credentials).delete(`products/${id}`)
  }

  // ── Variants (attribute combinations) ─────────────────────────────────────

  async listVariants(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<ProductVariant[]> {
    const productId = (params['productId'] ?? params['product_id']) as
      | string
      | number
      | undefined
    if (productId == null) {
      throw new Error(
        'nopCommerce requires ?product_id= for listVariants; ' +
          'attribute combinations are nested under parent products.',
      )
    }
    const pid = String(productId)
    const client = this.clientFor(credentials)
    const res = await client.get<{ products: RawNopProduct[] }>(`products/${pid}`)
    const product = res.products?.[0]
    if (!product) throw new Error(`Product ${pid} not found`)

    const combinations = product.product_attribute_combinations ?? []
    return combinations.map((c) =>
      transformProductVariant(
        c,
        pid,
        product.price ?? 0,
        'USD',
        product.product_attribute_mappings,
      ),
    )
  }

  async getVariant(credentials: Credentials, id: string): Promise<ProductVariant> {
    const [productId, combinationId] = id.split(':')
    if (!productId || !combinationId) {
      throw new Error(
        'Invalid variant id format: expected `productId:combinationId`',
      )
    }
    const client = this.clientFor(credentials)
    const res = await client.get<{ products: RawNopProduct[] }>(`products/${productId}`)
    const product = res.products?.[0]
    if (!product) throw new Error(`Product ${productId} not found`)

    const combination = (product.product_attribute_combinations ?? []).find(
      (c) => String(c.id) === combinationId,
    )
    if (!combination) {
      throw new Error(`Attribute combination ${combinationId} not found on product ${productId}`)
    }
    return transformProductVariant(
      combination,
      productId,
      product.price ?? 0,
      'USD',
      product.product_attribute_mappings,
    )
  }

  async createVariant(
    credentials: Credentials,
    data: Partial<ProductVariant>,
  ): Promise<ProductVariant> {
    const productId = data.productId
    if (!productId) throw new Error('createVariant requires productId')
    const client = this.clientFor(credentials)
    // nopCommerce: add attribute combination to the product
    const body = untransformProductVariant(data)
    const res = await client.post<RawNopAttributeCombination>(
      `products/${productId}/attribute_combinations`,
      body,
    )
    return transformProductVariant(res, productId)
  }

  async updateVariant(
    credentials: Credentials,
    id: string,
    data: Partial<ProductVariant>,
  ): Promise<ProductVariant> {
    const [productId, combinationId] = id.split(':')
    if (!productId || !combinationId) {
      throw new Error(
        'Invalid variant id format: expected `productId:combinationId`',
      )
    }
    const client = this.clientFor(credentials)
    const body = { id: Number(combinationId), ...untransformProductVariant(data) }
    const res = await client.put<RawNopAttributeCombination>(
      `products/${productId}/attribute_combinations/${combinationId}`,
      body,
    )
    return transformProductVariant(res, productId)
  }

  async deleteVariant(credentials: Credentials, id: string): Promise<void> {
    const [productId, combinationId] = id.split(':')
    if (!productId || !combinationId) {
      throw new Error(
        'Invalid variant id format: expected `productId:combinationId`',
      )
    }
    await this.clientFor(credentials).delete(
      `products/${productId}/attribute_combinations/${combinationId}`,
    )
  }

  // ── Collections (Categories) ──────────────────────────────────────────────

  async listCollections(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<Collection[]> {
    const client = this.clientFor(credentials)
    const res = await client.listWithPage<RawNopCategory>(
      'categories',
      'categories',
      this.listParams(params),
    )
    return res.items.map((c) => transformCollection(c))
  }

  async getCollection(credentials: Credentials, id: string): Promise<Collection> {
    const client = this.clientFor(credentials)
    const res = await client.get<{ categories: RawNopCategory[] }>(`categories/${id}`)
    const category = res.categories?.[0]
    if (!category) throw new Error(`Category ${id} not found`)
    return transformCollection(category)
  }

  async createCollection(
    credentials: Credentials,
    data: Partial<Collection>,
  ): Promise<Collection> {
    const client = this.clientFor(credentials)
    const res = await client.post<{ categories: RawNopCategory[] }>(
      'categories',
      { category: untransformCollection(data) },
    )
    const category = res.categories?.[0]
    if (!category) throw new Error('Failed to create category')
    return transformCollection(category)
  }

  async updateCollection(
    credentials: Credentials,
    id: string,
    data: Partial<Collection>,
  ): Promise<Collection> {
    const client = this.clientFor(credentials)
    const res = await client.put<{ categories: RawNopCategory[] }>(
      `categories/${id}`,
      { category: { id: Number(id), ...untransformCollection(data) } },
    )
    const category = res.categories?.[0]
    if (!category) throw new Error(`Failed to update category ${id}`)
    return transformCollection(category)
  }

  async deleteCollection(credentials: Credentials, id: string): Promise<void> {
    await this.clientFor(credentials).delete(`categories/${id}`)
  }

  // ── Locations ─────────────────────────────────────────────────────────────

  async listLocations(
    _credentials: Credentials,
    _params: QueryParams,
  ): Promise<Location[]> {
    return [syntheticDefaultLocation(this.configHost ?? 'default')]
  }

  async getLocation(_credentials: Credentials, id: string): Promise<Location> {
    if (id !== 'default') {
      throw new Error(`nopCommerce has no native location endpoints; unknown location id '${id}'`)
    }
    return syntheticDefaultLocation(this.configHost ?? 'default')
  }

  // ── Inventory mutations ───────────────────────────────────────────────────

  async adjustInventoryLevel(
    credentials: Credentials,
    data: { variantId: string; locationId: string; delta: number },
  ): Promise<InventoryLevel> {
    const [productId, combinationId] = data.variantId.split(':')
    if (!productId || !combinationId) {
      throw new Error(
        'nopCommerce adjustInventoryLevel requires composite variantId `productId:combinationId`',
      )
    }
    const client = this.clientFor(credentials)

    if (combinationId === 'default') {
      // Simple product — stock is on the product itself
      const current = await client.get<{ products: RawNopProductStock[] }>(`products/${productId}`)
      const product = current.products?.[0]
      if (!product) throw new Error(`Product ${productId} not found`)
      const newQty = (product.stock_quantity ?? 0) + data.delta
      const updated = await client.put<{ products: RawNopProductStock[] }>(
        `products/${productId}`,
        { product: { id: Number(productId), stock_quantity: newQty } },
      )
      const result = updated.products?.[0]
      if (!result) throw new Error(`Failed to update product ${productId}`)
      return transformInventoryLevel(result, productId)
    }

    // Attribute combination — stock is on the combination
    const productRes = await client.get<{ products: RawNopProduct[] }>(`products/${productId}`)
    const product = productRes.products?.[0]
    if (!product) throw new Error(`Product ${productId} not found`)
    const combo = (product.product_attribute_combinations ?? []).find(
      (c) => String(c.id) === combinationId,
    )
    if (!combo) throw new Error(`Combination ${combinationId} not found`)
    const newQty = (combo.stock_quantity ?? 0) + data.delta
    const updated = await client.put<RawNopProductStock>(
      `products/${productId}/attribute_combinations/${combinationId}`,
      { id: Number(combinationId), stock_quantity: newQty },
    )
    return transformInventoryLevel(
      { ...updated, id: updated.id ?? combo.id! },
      productId,
    )
  }

  async setInventoryLevel(
    credentials: Credentials,
    data: { variantId: string; locationId: string; available: number },
  ): Promise<InventoryLevel> {
    const [productId, combinationId] = data.variantId.split(':')
    if (!productId || !combinationId) {
      throw new Error(
        'nopCommerce setInventoryLevel requires composite variantId `productId:combinationId`',
      )
    }
    const client = this.clientFor(credentials)

    if (combinationId === 'default') {
      const updated = await client.put<{ products: RawNopProductStock[] }>(
        `products/${productId}`,
        { product: { id: Number(productId), stock_quantity: data.available } },
      )
      const result = updated.products?.[0]
      if (!result) throw new Error(`Failed to update product ${productId}`)
      return transformInventoryLevel(result, productId)
    }

    const updated = await client.put<RawNopProductStock>(
      `products/${productId}/attribute_combinations/${combinationId}`,
      { id: Number(combinationId), stock_quantity: data.available },
    )
    return transformInventoryLevel(
      { ...updated, id: updated.id ?? Number(combinationId) },
      productId,
    )
  }

  // ── Customers ─────────────────────────────────────────────────────────────

  async listCustomers(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<Customer[]> {
    const client = this.clientFor(credentials)
    const res = await client.listWithPage<RawNopCustomer>(
      'customers',
      'customers',
      this.listParams(params),
    )
    return res.items.map(transformCustomer)
  }

  async getCustomer(credentials: Credentials, id: string): Promise<Customer> {
    const client = this.clientFor(credentials)
    const res = await client.get<{ customers: RawNopCustomer[] }>(`customers/${id}`)
    const customer = res.customers?.[0]
    if (!customer) throw new Error(`Customer ${id} not found`)
    return transformCustomer(customer)
  }

  async createCustomer(
    credentials: Credentials,
    data: Partial<Customer>,
  ): Promise<Customer> {
    const client = this.clientFor(credentials)
    const res = await client.post<{ customers: RawNopCustomer[] }>(
      'customers',
      { customer: untransformCustomer(data) },
    )
    const customer = res.customers?.[0]
    if (!customer) throw new Error('Failed to create customer')
    return transformCustomer(customer)
  }

  async updateCustomer(
    credentials: Credentials,
    id: string,
    data: Partial<Customer>,
  ): Promise<Customer> {
    const client = this.clientFor(credentials)
    const res = await client.put<{ customers: RawNopCustomer[] }>(
      `customers/${id}`,
      { customer: { id: Number(id), ...untransformCustomer(data) } },
    )
    const customer = res.customers?.[0]
    if (!customer) throw new Error(`Failed to update customer ${id}`)
    return transformCustomer(customer)
  }

  async deleteCustomer(credentials: Credentials, id: string): Promise<void> {
    await this.clientFor(credentials).delete(`customers/${id}`)
  }

  // ── Orders ────────────────────────────────────────────────────────────────

  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const client = this.clientFor(credentials)
    const res = await client.listWithPage<RawNopOrder>(
      'orders',
      'orders',
      this.listParams(params),
    )
    return res.items.map(transformOrder)
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const client = this.clientFor(credentials)
    const res = await client.get<{ orders: RawNopOrder[] }>(`orders/${id}`)
    const order = res.orders?.[0]
    if (!order) throw new Error(`Order ${id} not found`)
    return transformOrder(order)
  }

  async createOrder(credentials: Credentials, data: Partial<Order>): Promise<Order> {
    const client = this.clientFor(credentials)
    const res = await client.post<{ orders: RawNopOrder[] }>(
      'orders',
      { order: untransformOrder(data) },
    )
    const order = res.orders?.[0]
    if (!order) throw new Error('Failed to create order')
    return transformOrder(order)
  }

  async updateOrder(
    credentials: Credentials,
    id: string,
    data: Partial<Order>,
  ): Promise<Order> {
    const client = this.clientFor(credentials)
    const res = await client.put<{ orders: RawNopOrder[] }>(
      `orders/${id}`,
      { order: { id: Number(id), ...untransformOrder(data) } },
    )
    const order = res.orders?.[0]
    if (!order) throw new Error(`Failed to update order ${id}`)
    return transformOrder(order)
  }

  async cancelOrder(
    credentials: Credentials,
    id: string,
    _data?: { reason?: string },
  ): Promise<Order> {
    const client = this.clientFor(credentials)
    const res = await client.put<{ orders: RawNopOrder[] }>(
      `orders/${id}`,
      { order: { id: Number(id), order_status: 'Cancelled' } },
    )
    const order = res.orders?.[0]
    if (!order) throw new Error(`Failed to cancel order ${id}`)
    return transformOrder(order)
  }

  // ── Discounts ─────────────────────────────────────────────────────────────

  async listDiscounts(credentials: Credentials, params: QueryParams): Promise<Discount[]> {
    const client = this.clientFor(credentials)
    const res = await client.listWithPage<RawNopDiscount>(
      'discounts',
      'discounts',
      this.listParams(params),
    )
    return res.items.map(transformDiscount)
  }

  async getDiscount(credentials: Credentials, id: string): Promise<Discount> {
    const client = this.clientFor(credentials)
    const res = await client.get<{ discounts: RawNopDiscount[] }>(`discounts/${id}`)
    const discount = res.discounts?.[0]
    if (!discount) throw new Error(`Discount ${id} not found`)
    return transformDiscount(discount)
  }

  async createDiscount(
    credentials: Credentials,
    data: Partial<Discount>,
  ): Promise<Discount> {
    const client = this.clientFor(credentials)
    const res = await client.post<{ discounts: RawNopDiscount[] }>(
      'discounts',
      { discount: untransformDiscount(data) },
    )
    const discount = res.discounts?.[0]
    if (!discount) throw new Error('Failed to create discount')
    return transformDiscount(discount)
  }

  async updateDiscount(
    credentials: Credentials,
    id: string,
    data: Partial<Discount>,
  ): Promise<Discount> {
    const client = this.clientFor(credentials)
    const res = await client.put<{ discounts: RawNopDiscount[] }>(
      `discounts/${id}`,
      { discount: { id: Number(id), ...untransformDiscount(data) } },
    )
    const discount = res.discounts?.[0]
    if (!discount) throw new Error(`Failed to update discount ${id}`)
    return transformDiscount(discount)
  }

  async deleteDiscount(credentials: Credentials, id: string): Promise<void> {
    await this.clientFor(credentials).delete(`discounts/${id}`)
  }

  // ── Fulfillments (nopCommerce Shipments) ──────────────────────────────────

  async listFulfillments(credentials: Credentials, params: QueryParams): Promise<Fulfillment[]> {
    // nopCommerce: list shipments across all orders
    const client = this.clientFor(credentials)
    const res = await client.listWithPage<RawNopShipment>(
      'shipments',
      'shipments',
      this.listParams(params),
    )
    return res.items.map((s) => transformFulfillment(s, String(s.order_id ?? '')))
  }

  async getFulfillment(credentials: Credentials, id: string): Promise<Fulfillment> {
    // id may be composite `orderId:shipmentId`
    const [orderId, shipmentId] = id.includes(':') ? id.split(':') : ['', id]
    const client = this.clientFor(credentials)
    const res = await client.get<{ shipments: RawNopShipment[] }>(`shipments/${shipmentId ?? id}`)
    const shipment = res.shipments?.[0]
    if (!shipment) throw new Error(`Shipment ${id} not found`)
    return transformFulfillment(shipment, orderId ?? String(shipment.order_id ?? ''))
  }

  // ── Transactions ──────────────────────────────────────────────────────────

  async listTransactions(credentials: Credentials, params: QueryParams): Promise<Transaction[]> {
    // nopCommerce: derive transactions from order payment data
    const orders = await this.listOrders(credentials, params)
    // Re-fetch each order as a raw record for payment fields
    const client = this.clientFor(credentials)
    const results: Transaction[] = []
    for (const order of orders) {
      try {
        const raw = await client.get<{ orders: RawNopTransaction[] }>(`orders/${order.id}`)
        const rawOrder = raw.orders?.[0]
        if (rawOrder) results.push(transformTransaction(rawOrder, order.id))
      } catch {
        // skip orders we can't retrieve
      }
    }
    return results
  }
}
