/**
 * MyCashflow adapter for the ecommerce vertical.
 *
 * Maps the MyCashflow REST API (v1) to the canonical ecommerce resources.
 * Authentication is HTTP Basic Auth — a store admin creates an API user
 * account and its credentials are used on every request.
 *
 * Supported resources:
 *  - Products + Variations (CRUD)
 *  - Categories → Collections (CRUD)
 *  - Stock Locations → Locations (list/get)
 *  - Stock → InventoryLevel (list + set/adjust)
 *  - Customers (CRUD)
 *  - Orders (list/get/create/update/cancel)
 *  - Shipments → Fulfillments (list/get)
 *  - Campaigns → Discounts (list/get, v0 endpoint)
 *
 * Resources not natively available in the MyCashflow API (refunds as a
 * standalone list, transactions as a standalone list) are omitted — the
 * registry returns 501 for those methods automatically.
 *
 * Docs: https://support.mycashflow.com/api/
 */

import { customForm, pageLocally } from '@opensteward/shared'
import type { Credentials, QueryParams } from '@opensteward/shared'
import type { EcommerceAdapter } from '../../adapter/interface'
import type { Product, ProductVariant } from '../../schema/product'
import type { Collection } from '../../schema/collection'
import type { Location } from '../../schema/location'
import type { InventoryLevel } from '../../schema/inventory'
import type { Customer } from '../../schema/customer'
import type { Order } from '../../schema/order'
import type { Fulfillment } from '../../schema/fulfillment'
import type { Discount } from '../../schema/discount'

import { MyCashflowClient } from './client'
import { DEFAULT_PAGE_SIZE } from './constants'
import { exchangeCredentials } from './auth'

import {
  transformProduct,
  untransformProduct,
  transformVariant,
  untransformVariant,
  type RawMyCashflowProduct,
  type RawMyCashflowVariation,
} from './transform/product'
import {
  transformCollection,
  untransformCollection,
  type RawMyCashflowCategory,
} from './transform/collection'
import { transformLocation, type RawMyCashflowLocation } from './transform/location'
import { transformInventoryLevel, type RawMyCashflowStockItem } from './transform/inventory'
import {
  transformCustomer,
  untransformCustomer,
  type RawMyCashflowCustomer,
} from './transform/customer'
import { transformOrder, untransformOrder, type RawMyCashflowOrder } from './transform/order'
import { transformFulfillment, type RawMyCashflowShipment } from './transform/fulfillment'
import { transformDiscount, type RawMyCashflowCampaign } from './transform/discount'

// ── Credential form ───────────────────────────────────────────────────────────

const CREDENTIAL_FORM = customForm({
  fields: [
    {
      name: 'storeName',
      label: 'Store name',
      type: 'text',
      placeholder: 'myshop',
      helpText: 'The subdomain of your MyCashflow store (e.g. myshop for myshop.mycashflow.fi).',
      required: true,
    },
    {
      name: 'username',
      label: 'API username',
      type: 'text',
      helpText: 'API user account name created under Account → Extensions → API.',
      required: true,
    },
    {
      name: 'password',
      label: 'API password / key',
      type: 'password',
      helpText: 'API user account password created under Account → Extensions → API.',
      required: true,
    },
  ],
  exchange: exchangeCredentials,
})

// ── Adapter ───────────────────────────────────────────────────────────────────

export interface MycashflowAdapterConfig {
  /** Store subdomain (e.g. `myshop` for `myshop.mycashflow.fi`). */
  storeName?: string
  /** API user account name. */
  username?: string
  /** API user account password / key. */
  password?: string
}

export class MycashflowAdapter implements EcommerceAdapter {
  readonly platform = 'mycashflow'
  readonly version = '0.1.0'

  // Connect Link support.
  credentialFields = CREDENTIAL_FORM.credentialFields
  exchangeCredentials = CREDENTIAL_FORM.exchangeCredentials

  private configStoreName: string | undefined
  private configUsername: string | undefined
  private configPassword: string | undefined

  constructor(config: MycashflowAdapterConfig = {}) {
    this.configStoreName = config.storeName
    this.configUsername = config.username
    this.configPassword = config.password
  }

  // ── Auth ──────────────────────────────────────────────────────────────────

  getAuthUrl(_state: string): string {
    const storeName = this.configStoreName ?? 'your-store'
    return `https://${storeName}.mycashflow.fi/admin/extensions/api`
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    throw new Error(
      'MyCashflow does not use OAuth code exchange. ' +
        'Create an API user under Account → Extensions → API, ' +
        'then POST credentials to /v1/connections with ' +
        '{ platform: "mycashflow", credentials: { storeName, username, password } }.',
    )
  }

  /** Basic Auth credentials do not expire — refresh is a no-op. */
  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return credentials
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private clientFor(credentials: Credentials): MyCashflowClient {
    const storeName =
      (credentials.extra?.['storeName'] as string | undefined) ?? this.configStoreName
    const username = (credentials.extra?.['username'] as string | undefined) ?? this.configUsername
    const password = (credentials.extra?.['password'] as string | undefined) ?? this.configPassword

    if (!storeName || !username || !password) {
      throw new Error(
        'MyCashflow adapter is missing storeName/username/password — ' +
          'configure them in apps/integration-server/config/config.yml under adapters.mycashflow, ' +
          'or POST them to /v1/connections with credentials: { storeName, username, password }.',
      )
    }

    const mergedCreds: Credentials = {
      ...credentials,
      extra: { ...credentials.extra, storeName, username, password },
    }
    return new MyCashflowClient(mergedCreds)
  }

  private listParams(params: QueryParams): Record<string, unknown> {
    const out: Record<string, unknown> = {
      page_size: params.limit ?? DEFAULT_PAGE_SIZE,
    }
    if (params.page != null) out['page'] = params.page
    return out
  }

  // ── Products ──────────────────────────────────────────────────────────────

  async listProducts(credentials: Credentials, params: QueryParams): Promise<Product[]> {
    const res = await this.clientFor(credentials).listWithPage<RawMyCashflowProduct>(
      'products',
      this.listParams(params),
    )
    return res.items.map((p) => transformProduct(p))
  }

  async getProduct(credentials: Credentials, id: string): Promise<Product> {
    const res = await this.clientFor(credentials).get<{ data: RawMyCashflowProduct }>(
      `products/${id}`,
    )
    return transformProduct(res.data)
  }

  async createProduct(credentials: Credentials, data: Partial<Product>): Promise<Product> {
    const res = await this.clientFor(credentials).post<{ data: RawMyCashflowProduct }>(
      'products',
      untransformProduct(data),
    )
    return transformProduct(res.data)
  }

  async updateProduct(
    credentials: Credentials,
    id: string,
    data: Partial<Product>,
  ): Promise<Product> {
    const res = await this.clientFor(credentials).patch<{ data: RawMyCashflowProduct }>(
      `products/${id}`,
      untransformProduct(data),
    )
    return transformProduct(res.data)
  }

  async deleteProduct(credentials: Credentials, id: string): Promise<void> {
    await this.clientFor(credentials).delete(`products/${id}`)
  }

  // ── Variants ──────────────────────────────────────────────────────────────

  async listVariants(credentials: Credentials, params: QueryParams): Promise<ProductVariant[]> {
    const productId = (params['productId'] ?? params['product_id']) as string | number | undefined
    if (productId == null) {
      throw new Error(
        'MyCashflow requires ?product_id= for listVariants; variations are nested under parent products.',
      )
    }
    const pid = String(productId)
    const res = await this.clientFor(credentials).listWithPage<RawMyCashflowVariation>(
      `products/${pid}/variations`,
      this.listParams(params),
    )
    return res.items.map((v) => transformVariant(v, pid))
  }

  async getVariant(credentials: Credentials, id: string): Promise<ProductVariant> {
    const [productId, variantId] = id.split(':')
    if (!productId || !variantId) {
      throw new Error('Invalid variant id format: expected `productId:variantId`')
    }
    const res = await this.clientFor(credentials).get<{ data: RawMyCashflowVariation }>(
      `products/${productId}/variations/${variantId}`,
    )
    return transformVariant(res.data, productId)
  }

  async createVariant(
    credentials: Credentials,
    data: Partial<ProductVariant>,
  ): Promise<ProductVariant> {
    const productId = data.productId
    if (!productId) throw new Error('createVariant requires productId')
    const res = await this.clientFor(credentials).post<{ data: RawMyCashflowVariation }>(
      `products/${productId}/variations`,
      untransformVariant(data),
    )
    return transformVariant(res.data, productId)
  }

  async updateVariant(
    credentials: Credentials,
    id: string,
    data: Partial<ProductVariant>,
  ): Promise<ProductVariant> {
    const [productId, variantId] = id.split(':')
    if (!productId || !variantId) {
      throw new Error('Invalid variant id format: expected `productId:variantId`')
    }
    const res = await this.clientFor(credentials).patch<{ data: RawMyCashflowVariation }>(
      `products/${productId}/variations/${variantId}`,
      untransformVariant(data),
    )
    return transformVariant(res.data, productId)
  }

  async deleteVariant(credentials: Credentials, id: string): Promise<void> {
    const [productId, variantId] = id.split(':')
    if (!productId || !variantId) {
      throw new Error('Invalid variant id format: expected `productId:variantId`')
    }
    await this.clientFor(credentials).delete(`products/${productId}/variations/${variantId}`)
  }

  // ── Collections ───────────────────────────────────────────────────────────

  async listCollections(credentials: Credentials, params: QueryParams): Promise<Collection[]> {
    const res = await this.clientFor(credentials).listWithPage<RawMyCashflowCategory>(
      'categories',
      this.listParams(params),
    )
    return res.items.map((c) => transformCollection(c))
  }

  async getCollection(credentials: Credentials, id: string): Promise<Collection> {
    const res = await this.clientFor(credentials).get<{ data: RawMyCashflowCategory }>(
      `categories/${id}`,
    )
    return transformCollection(res.data)
  }

  async createCollection(credentials: Credentials, data: Partial<Collection>): Promise<Collection> {
    const res = await this.clientFor(credentials).post<{ data: RawMyCashflowCategory }>(
      'categories',
      untransformCollection(data),
    )
    return transformCollection(res.data)
  }

  async updateCollection(
    credentials: Credentials,
    id: string,
    data: Partial<Collection>,
  ): Promise<Collection> {
    const res = await this.clientFor(credentials).patch<{ data: RawMyCashflowCategory }>(
      `categories/${id}`,
      untransformCollection(data),
    )
    return transformCollection(res.data)
  }

  async deleteCollection(credentials: Credentials, id: string): Promise<void> {
    await this.clientFor(credentials).delete(`categories/${id}`)
  }

  // ── Locations ─────────────────────────────────────────────────────────────

  /**
   * `GET /v1/stock-locations` (indexStockLocations) declares no parameters
   * and answers `{ data: Stock Location[] }` with no `meta`: the whole
   * collection in one response, sliced here into the caller's page.
   */
  async listLocations(credentials: Credentials, params: QueryParams): Promise<Location[]> {
    const res = await this.clientFor(credentials).get<{ data?: RawMyCashflowLocation[] }>(
      'stock-locations',
    )
    return pageLocally((res.data ?? []).map(transformLocation), params)
  }

  /** `GET /v1/stock-locations/{locationCode}` (getStockLocation). */
  async getLocation(credentials: Credentials, id: string): Promise<Location> {
    const res = await this.clientFor(credentials).get<{ data: RawMyCashflowLocation }>(
      `stock-locations/${encodeURIComponent(id)}`,
    )
    return transformLocation(res.data)
  }

  // ── Inventory ─────────────────────────────────────────────────────────────

  async listInventoryLevels(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<InventoryLevel[]> {
    const res = await this.clientFor(credentials).listWithPage<RawMyCashflowStockItem>(
      'stock',
      this.listParams(params),
    )
    return res.items.map(transformInventoryLevel)
  }

  async setInventoryLevel(
    credentials: Credentials,
    data: { variantId: string; locationId: string; available: number },
  ): Promise<InventoryLevel> {
    // MyCashflow stock items are addressed by product code (variation code).
    // The variantId here is `productId:variationId` — we POST a balance update
    // to /v1/stock/{stockItemID}/balance where stockItemID is the variation id.
    const [, variationId] = data.variantId.split(':')
    const stockItemId = variationId ?? data.variantId
    const res = await this.clientFor(credentials).post<{ data: RawMyCashflowStockItem }>(
      `stock/${stockItemId}/balance`,
      {
        quantity: data.available,
        location_id: data.locationId !== 'default' ? Number(data.locationId) : undefined,
      },
    )
    return transformInventoryLevel(res.data)
  }

  async adjustInventoryLevel(
    credentials: Credentials,
    data: { variantId: string; locationId: string; delta: number },
  ): Promise<InventoryLevel> {
    // Fetch current quantity, then set to current + delta.
    const [, variationId] = data.variantId.split(':')
    const stockItemId = variationId ?? data.variantId
    const current = await this.clientFor(credentials).get<{ data: RawMyCashflowStockItem }>(
      `stock/${stockItemId}`,
    )
    const currentQty = current.data.quantity ?? 0
    return this.setInventoryLevel(credentials, {
      variantId: data.variantId,
      locationId: data.locationId,
      available: currentQty + data.delta,
    })
  }

  // ── Customers ─────────────────────────────────────────────────────────────

  async listCustomers(credentials: Credentials, params: QueryParams): Promise<Customer[]> {
    const res = await this.clientFor(credentials).listWithPage<RawMyCashflowCustomer>(
      'customers',
      this.listParams(params),
    )
    return res.items.map(transformCustomer)
  }

  async getCustomer(credentials: Credentials, id: string): Promise<Customer> {
    const res = await this.clientFor(credentials).get<{ data: RawMyCashflowCustomer }>(
      `customers/${id}`,
    )
    return transformCustomer(res.data)
  }

  async createCustomer(credentials: Credentials, data: Partial<Customer>): Promise<Customer> {
    const res = await this.clientFor(credentials).post<{ data: RawMyCashflowCustomer }>(
      'customers',
      untransformCustomer(data),
    )
    return transformCustomer(res.data)
  }

  async updateCustomer(
    credentials: Credentials,
    id: string,
    data: Partial<Customer>,
  ): Promise<Customer> {
    const res = await this.clientFor(credentials).patch<{ data: RawMyCashflowCustomer }>(
      `customers/${id}`,
      untransformCustomer(data),
    )
    return transformCustomer(res.data)
  }

  // ── Orders ────────────────────────────────────────────────────────────────

  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const res = await this.clientFor(credentials).listWithPage<RawMyCashflowOrder>(
      'orders',
      this.listParams(params),
    )
    return res.items.map(transformOrder)
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const res = await this.clientFor(credentials).get<{ data: RawMyCashflowOrder }>(`orders/${id}`)
    return transformOrder(res.data)
  }

  async createOrder(credentials: Credentials, data: Partial<Order>): Promise<Order> {
    const res = await this.clientFor(credentials).post<{ data: RawMyCashflowOrder }>(
      'orders',
      untransformOrder(data),
    )
    return transformOrder(res.data)
  }

  async updateOrder(credentials: Credentials, id: string, data: Partial<Order>): Promise<Order> {
    const res = await this.clientFor(credentials).patch<{ data: RawMyCashflowOrder }>(
      `orders/${id}`,
      untransformOrder(data),
    )
    return transformOrder(res.data)
  }

  async cancelOrder(
    credentials: Credentials,
    id: string,
    _data?: { reason?: string },
  ): Promise<Order> {
    // MyCashflow uses a dedicated cancel action endpoint.
    const res = await this.clientFor(credentials).post<{ data: RawMyCashflowOrder }>(
      `orders/${id}/cancel`,
    )
    return transformOrder(res.data)
  }

  // ── Fulfillments ──────────────────────────────────────────────────────────

  async listFulfillments(credentials: Credentials, params: QueryParams): Promise<Fulfillment[]> {
    const orderId = (params['order_id'] ?? params['orderId']) as string | number | undefined
    if (orderId == null) {
      throw new Error('listFulfillments requires `order_id` in query params')
    }
    const oid = String(orderId)
    const res = await this.clientFor(credentials).listWithPage<RawMyCashflowShipment>(
      `orders/${oid}/shipments`,
      this.listParams(params),
    )
    return res.items.map((s) => transformFulfillment(s, oid))
  }

  async getFulfillment(credentials: Credentials, id: string): Promise<Fulfillment> {
    const [orderId, shipmentId] = id.split(':')
    if (!orderId || !shipmentId) {
      throw new Error('Invalid fulfillment id format: expected `orderId:shipmentId`')
    }
    const res = await this.clientFor(credentials).get<{ data: RawMyCashflowShipment }>(
      `orders/${orderId}/shipments/${shipmentId}`,
    )
    return transformFulfillment(res.data, orderId)
  }

  // ── Discounts (Campaigns, v0 endpoint) ────────────────────────────────────

  async listDiscounts(credentials: Credentials, params: QueryParams): Promise<Discount[]> {
    // MyCashflow campaigns (discount rules) live under the v0 API endpoint.
    // The client exposes a dedicated `listWithPageV0` helper that targets
    // the /api/v0 base URL instead of /api/v1.
    const res = await this.clientFor(credentials).listWithPageV0<RawMyCashflowCampaign>(
      'campaigns',
      this.listParams(params),
    )
    return res.items.map(transformDiscount)
  }

  async getDiscount(credentials: Credentials, id: string): Promise<Discount> {
    const res = await this.clientFor(credentials).getV0<{ data: RawMyCashflowCampaign }>(
      `campaigns/${id}`,
    )
    return transformDiscount(res.data)
  }
}
