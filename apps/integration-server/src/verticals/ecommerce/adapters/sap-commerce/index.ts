/**
 * SAP Commerce Cloud (formerly Hybris) adapter for the ecommerce vertical.
 *
 * Maps the SAP Commerce Cloud OCC (Omni Commerce Connect) REST API to the
 * canonical ecommerce resources. Key characteristics:
 *
 *  1. **On-premise or cloud deployment.** Every API call is scoped to a
 *     `{baseSiteId}` embedded in the path: `/occ/v2/{baseSiteId}/...`.
 *     The host and base site live on `credentials.extra`.
 *
 *  2. **OAuth2 client_credentials grant.** The caller configures an OAuth
 *     client in Backoffice and supplies `{host, baseSiteId, clientId,
 *     clientSecret}` directly; the adapter exchanges for a Bearer token
 *     against `https://{host}/authorizationserver/oauth/token`.
 *
 *  3. **Standard REST PATCH for updates.** Unlike commercetools'
 *     actions-based updates, SAP Commerce uses PATCH with partial bodies.
 *
 *  4. **Orders are created from carts.** Step 1: create/update a cart.
 *     Step 2: place an order from the cart.
 *
 *  5. **Complex promotion engine.** Discounts are modeled as promotions
 *     with optional coupon codes.
 *
 *  6. **No native webhook API in OCC.** SAP Commerce uses SAP Event Mesh
 *     or custom hot-folders for event-driven integrations. The adapter
 *     therefore omits `verifyWebhook` / `parseWebhookEvents`.
 *
 * Docs: https://help.sap.com/docs/SAP_COMMERCE
 */

import type { Credentials, QueryParams } from '@opensteward/shared'
import type { EcommerceAdapter } from '../../adapter/interface'
import type { Product, ProductVariant } from '../../schema/product'
import type { Collection } from '../../schema/collection'
import type { Location } from '../../schema/location'
import type { InventoryLevel } from '../../schema/inventory'
import type { Customer } from '../../schema/customer'
import type { Order } from '../../schema/order'
import type { Fulfillment } from '../../schema/fulfillment'
import type { Refund } from '../../schema/refund'
import type { Transaction } from '../../schema/transaction'
import type { Discount } from '../../schema/discount'

import { oauth2ClientCredentials } from '@opensteward/shared'
import { requestToken, type SapCommerceAuthInput } from './auth'
import { SapCommerceClient } from './client'
import { DEFAULT_PAGE_SIZE, DEFAULT_BASE_SITE } from './constants'

const CREDENTIAL_FORM = oauth2ClientCredentials({
  tokenUrl: (input) => {
    const host = (input.host ?? '').trim().replace(/^https?:\/\//, '').replace(/\/$/, '')
    if (!host) throw new Error('Host is required.')
    return `https://${host}/authorizationserver/oauth/token`
  },
  additionalFields: [
    {
      name: 'host',
      label: 'Host',
      type: 'text',
      required: true,
      placeholder: 'api.c1234-e5678.demo.hybris.com',
      helpText: 'SAP Commerce Cloud host (no protocol, no trailing slash).',
    },
    {
      name: 'baseSiteId',
      label: 'Base site ID',
      type: 'text',
      required: false,
      placeholder: DEFAULT_BASE_SITE,
      helpText: 'Storefront base site (e.g. "electronics", "powertools").',
    },
  ],
  buildExtra: (input) => ({
    host: (input.host ?? '').trim().replace(/^https?:\/\//, '').replace(/\/$/, ''),
    baseSiteId: (input.baseSiteId ?? '').trim() || DEFAULT_BASE_SITE,
    clientId: (input.clientId ?? '').trim(),
    clientSecret: input.clientSecret ?? '',
  }),
})

import {
  transformProduct,
  untransformProduct,
  buildPatchForProduct,
  type RawSapProduct,
} from './transform/product'
import {
  transformVariantFromProduct,
  transformVariantFromOption,
} from './transform/variant'
import {
  transformCollection,
  type RawSapCategory,
} from './transform/collection'
import {
  transformCustomer,
  untransformCustomer,
  buildPatchForCustomer,
  type RawSapUser,
} from './transform/customer'
import {
  transformOrder,
  untransformOrder,
  type RawSapOrder,
} from './transform/order'
import { transformFulfillment, type RawSapConsignment } from './transform/fulfillment'
import {
  transformRefund,
  untransformRefund,
  type RawSapReturnRequest,
} from './transform/refund'
import {
  transformTransaction,
  type RawSapPaymentTransaction,
} from './transform/transaction'
import {
  transformDiscount,
  type RawSapPromotion,
} from './transform/discount'
import {
  transformLocation,
  type RawSapPointOfService,
} from './transform/location'
import {
  transformInventoryLevel,
  type RawSapStockLevel,
} from './transform/inventory'

export interface SapCommerceAdapterConfig {
  /** SAP Commerce Cloud host (e.g. `api.c1234-e5678.demo.hybris.com`). */
  host?: string
  /** Base site id (e.g. `electronics`, `powertools`). */
  baseSiteId?: string
  /** OAuth2 client id. */
  clientId?: string
  /** OAuth2 client secret. */
  clientSecret?: string
  /** Catalog id for category/product operations. */
  catalogId?: string
  /** Catalog version (e.g. `Online`, `Staged`). */
  catalogVersion?: string
}

export class SapCommerceAdapter implements EcommerceAdapter {
  readonly platform = 'sap-commerce'
  readonly version = '0.1.0'
  /** Honours `params.search`; see AdapterCapabilities. Declared so the
   *  router can refuse the parameter on adapters that would drop it. */
  readonly capabilities = { search: true }

  credentialFields = CREDENTIAL_FORM.credentialFields
  exchangeCredentials = CREDENTIAL_FORM.exchangeCredentials

  private configHost: string | undefined
  private configBaseSiteId: string
  private configClientId: string | undefined
  private configClientSecret: string | undefined
  private configCatalogId: string
  private configCatalogVersion: string

  constructor(config: SapCommerceAdapterConfig = {}) {
    this.configHost = config.host
    this.configBaseSiteId = config.baseSiteId ?? DEFAULT_BASE_SITE
    this.configClientId = config.clientId
    this.configClientSecret = config.clientSecret
    this.configCatalogId = config.catalogId ?? 'electronicsProductCatalog'
    this.configCatalogVersion = config.catalogVersion ?? 'Online'
  }

  // ── Auth ──────────────────────────────────────────────────────────────────

  /**
   * SAP Commerce has no interactive authorize URL for server-to-server
   * access. Returns a pointer to the Backoffice admin.
   */
  getAuthUrl(_state: string): string {
    const host = this.configHost ?? '{host}'
    return `https://${host}/backoffice/`
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    const input = this.resolveAuthInput()
    return requestToken(input)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    const extra = credentials.extra ?? {}
    const input: SapCommerceAuthInput = {
      host: (extra['host'] as string | undefined) ?? this.configHost ?? '',
      baseSiteId: (extra['baseSiteId'] as string | undefined) ?? this.configBaseSiteId,
      clientId: (extra['clientId'] as string | undefined) ?? this.configClientId ?? '',
      clientSecret: (extra['clientSecret'] as string | undefined) ?? this.configClientSecret ?? '',
    }
    if (!input.host || !input.clientId || !input.clientSecret) {
      throw new Error(
        'sap-commerce refreshCredentials: missing host/clientId/clientSecret in credentials.extra',
      )
    }
    return requestToken(input)
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private resolveAuthInput(): SapCommerceAuthInput {
    if (!this.configHost || !this.configClientId || !this.configClientSecret) {
      throw new Error(
        'sap-commerce adapter is missing host/clientId/clientSecret — ' +
          'configure them under apps/integration-server/config/config.yml adapters.sap-commerce, or POST ' +
          'them to /v1/connections under credentials.extra {host, baseSiteId, clientId, clientSecret}.',
      )
    }
    return {
      host: this.configHost,
      baseSiteId: this.configBaseSiteId,
      clientId: this.configClientId,
      clientSecret: this.configClientSecret,
    }
  }

  private clientFor(credentials: Credentials): SapCommerceClient {
    const extra = { ...(credentials.extra ?? {}) }
    if (!extra['host'] && this.configHost) {
      extra['host'] = this.configHost
    }
    if (!extra['baseSiteId']) {
      extra['baseSiteId'] = this.configBaseSiteId
    }
    if (!credentials.accessToken) {
      throw new Error(
        'sap-commerce clientFor: credentials.accessToken is required (run exchangeCode first)',
      )
    }
    const merged: Credentials = { ...credentials, extra }
    return new SapCommerceClient(merged)
  }

  private listParams(params: QueryParams): Record<string, unknown> {
    const out: Record<string, unknown> = {
      limit: params.limit ?? DEFAULT_PAGE_SIZE,
    }
    if (typeof params.page === 'number' && params.page > 0) {
      out['currentPage'] = params.page - 1 // SAP Commerce uses 0-based pages
    }
    if (params.search) out['query'] = params.search
    return out
  }

  // ── Products ──────────────────────────────────────────────────────────────

  async listProducts(credentials: Credentials, params: QueryParams): Promise<Product[]> {
    const client = this.clientFor(credentials)
    const queryParams = this.listParams(params)
    const searchQuery = queryParams['query'] ? String(queryParams['query']) : ''
    delete queryParams['query']

    const res = await client.listWithPagination<RawSapProduct>(
      searchQuery ? `/products/search?query=${encodeURIComponent(searchQuery)}` : '/products/search',
      'products',
      queryParams,
    )
    return res.items.map(transformProduct)
  }

  async getProduct(credentials: Credentials, id: string): Promise<Product> {
    const client = this.clientFor(credentials)
    const raw = await client.get<RawSapProduct>(
      `/products/${encodeURIComponent(id)}`,
      { fields: 'FULL' },
    )
    return transformProduct(raw)
  }

  async createProduct(credentials: Credentials, data: Partial<Product>): Promise<Product> {
    const client = this.clientFor(credentials)
    const raw = await client.post<RawSapProduct>('/products', untransformProduct(data))
    return transformProduct(raw)
  }

  async updateProduct(
    credentials: Credentials,
    id: string,
    data: Partial<Product>,
  ): Promise<Product> {
    const client = this.clientFor(credentials)
    const patch = buildPatchForProduct(data)
    await client.patch(`/products/${encodeURIComponent(id)}`, patch)
    // Re-fetch to get the updated product
    return this.getProduct(credentials, id)
  }

  async deleteProduct(credentials: Credentials, id: string): Promise<void> {
    const client = this.clientFor(credentials)
    await client.delete(`/products/${encodeURIComponent(id)}`)
  }

  // ── Variants ──────────────────────────────────────────────────────────────

  async listVariants(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<ProductVariant[]> {
    const productId = params['productId'] ?? params['product_id']
    if (productId == null) {
      throw new Error(
        'sap-commerce requires ?productId= for listVariants; variants are nested under parent products.',
      )
    }
    const pid = String(productId)
    const client = this.clientFor(credentials)
    const product = await client.get<RawSapProduct>(
      `/products/${encodeURIComponent(pid)}`,
      { fields: 'FULL' },
    )
    const allVariantOpts = [
      ...(product.variantOptions ?? []),
      ...(product.baseOptions?.flatMap((bo) => bo.options ?? []) ?? []),
    ]
    if (allVariantOpts.length === 0) {
      // Single-variant product — return the product itself as a variant
      return [transformVariantFromProduct(product, pid, 1)]
    }
    return allVariantOpts.map((vo, idx) =>
      transformVariantFromOption(vo, pid, idx + 1),
    )
  }

  async getVariant(credentials: Credentials, id: string): Promise<ProductVariant> {
    const client = this.clientFor(credentials)
    const raw = await client.get<RawSapProduct>(
      `/products/${encodeURIComponent(id)}`,
      { fields: 'FULL' },
    )
    return transformVariantFromProduct(raw, raw.baseProduct)
  }

  // ── Collections (SAP Commerce categories) ─────────────────────────────────

  async listCollections(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<Collection[]> {
    const client = this.clientFor(credentials)
    const res = await client.listWithPagination<RawSapCategory>(
      `/catalogs/${this.configCatalogId}/${this.configCatalogVersion}/categories`,
      'subcategories',
      this.listParams(params),
    )
    return res.items.map(transformCollection)
  }

  async getCollection(credentials: Credentials, id: string): Promise<Collection> {
    const client = this.clientFor(credentials)
    const raw = await client.get<RawSapCategory>(
      `/catalogs/${this.configCatalogId}/${this.configCatalogVersion}/categories/${encodeURIComponent(id)}`,
    )
    return transformCollection(raw)
  }

  // ── Locations (SAP Commerce points of service) ────────────────────────────

  async listLocations(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<Location[]> {
    const client = this.clientFor(credentials)
    const res = await client.listWithPagination<RawSapPointOfService>(
      '/stores',
      'stores',
      this.listParams(params),
    )
    return res.items.map(transformLocation)
  }

  async getLocation(credentials: Credentials, id: string): Promise<Location> {
    const client = this.clientFor(credentials)
    const raw = await client.get<RawSapPointOfService>(
      `/stores/${encodeURIComponent(id)}`,
      { fields: 'FULL' },
    )
    return transformLocation(raw)
  }

  // ── Inventory ─────────────────────────────────────────────────────────────

  async listInventoryLevels(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<InventoryLevel[]> {
    // SAP Commerce doesn't have a dedicated inventory list endpoint in OCC.
    // We can get stock info from products. The caller should pass productId.
    const productId = params['productId'] ?? params['product_id']
    if (productId == null) {
      throw new Error('sap-commerce listInventoryLevels requires `productId` in query params')
    }
    const client = this.clientFor(credentials)
    const product = await client.get<RawSapProduct>(
      `/products/${encodeURIComponent(String(productId))}`,
      { fields: 'FULL' },
    )
    if (!product.stock) return []
    const level: RawSapStockLevel = {
      productCode: product.code,
      warehouseCode: 'default',
      stockLevel: product.stock.stockLevel,
      available: product.stock.stockLevel,
    }
    return [transformInventoryLevel(level)]
  }

  async getInventoryLevel(
    credentials: Credentials,
    id: string,
  ): Promise<InventoryLevel> {
    const [productCode] = id.split(':')
    const client = this.clientFor(credentials)
    const product = await client.get<RawSapProduct>(
      `/products/${encodeURIComponent(productCode!)}`,
      { fields: 'FULL' },
    )
    const level: RawSapStockLevel = {
      productCode: product.code,
      warehouseCode: 'default',
      stockLevel: product.stock?.stockLevel,
      available: product.stock?.stockLevel,
    }
    return transformInventoryLevel(level)
  }

  // ── Customers (SAP Commerce users) ────────────────────────────────────────

  async listCustomers(credentials: Credentials, params: QueryParams): Promise<Customer[]> {
    const client = this.clientFor(credentials)
    const res = await client.listWithPagination<RawSapUser>(
      '/users',
      'users',
      this.listParams(params),
    )
    return res.items.map(transformCustomer)
  }

  async getCustomer(credentials: Credentials, id: string): Promise<Customer> {
    const client = this.clientFor(credentials)
    const raw = await client.get<RawSapUser>(
      `/users/${encodeURIComponent(id)}`,
      { fields: 'FULL' },
    )
    return transformCustomer(raw)
  }

  async createCustomer(
    credentials: Credentials,
    data: Partial<Customer>,
  ): Promise<Customer> {
    const client = this.clientFor(credentials)
    const body = {
      ...untransformCustomer(data),
      password: (data.metadata?.['password'] as string | undefined) ?? 'TempPass123!',
      titleCode: (data.metadata?.['titleCode'] as string | undefined) ?? 'mr',
    }
    const raw = await client.post<RawSapUser>('/users', body)
    return transformCustomer(raw)
  }

  async updateCustomer(
    credentials: Credentials,
    id: string,
    data: Partial<Customer>,
  ): Promise<Customer> {
    const client = this.clientFor(credentials)
    const patch = buildPatchForCustomer(data)
    await client.patch(`/users/${encodeURIComponent(id)}`, patch)
    return this.getCustomer(credentials, id)
  }

  async deleteCustomer(credentials: Credentials, id: string): Promise<void> {
    const client = this.clientFor(credentials)
    await client.delete(`/users/${encodeURIComponent(id)}`)
  }

  // ── Orders ────────────────────────────────────────────────────────────────

  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const userId = (params['userId'] ?? params['user_id'] ?? 'current') as string
    const client = this.clientFor(credentials)
    const res = await client.listWithPagination<RawSapOrder>(
      `/users/${encodeURIComponent(userId)}/orders`,
      'orders',
      this.listParams(params),
    )
    return res.items.map(transformOrder)
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const client = this.clientFor(credentials)
    // Try to get order by code. SAP Commerce scopes orders under users,
    // but some installations support direct order lookup.
    const raw = await client.get<RawSapOrder>(
      `/users/current/orders/${encodeURIComponent(id)}`,
      { fields: 'FULL' },
    )
    return transformOrder(raw)
  }

  /**
   * SAP Commerce orders are created FROM a Cart. Step 1: POST /users/{userId}/carts
   * to produce a cart. Step 2: Add entries. Step 3: POST /users/{userId}/orders
   * with the cart id.
   */
  async createOrder(credentials: Credentials, data: Partial<Order>): Promise<Order> {
    const userId = (data.customerId ?? 'current')
    const client = this.clientFor(credentials)

    // Step 1: Create a cart
    const cart = await client.post<{ code: string; guid?: string }>(
      `/users/${encodeURIComponent(userId)}/carts`,
      {},
    )
    const cartId = cart.code ?? cart.guid

    // Step 2: Add line items to cart
    const cartBody = untransformOrder(data)
    if (Array.isArray(cartBody['entries'])) {
      for (const entry of cartBody['entries'] as Array<Record<string, unknown>>) {
        await client.post(
          `/users/${encodeURIComponent(userId)}/carts/${cartId}/entries`,
          {
            product: entry['product'],
            quantity: entry['quantity'],
          },
        )
      }
    }

    // Step 3: Place the order
    const order = await client.post<RawSapOrder>(
      `/users/${encodeURIComponent(userId)}/orders`,
      { cartId },
    )
    return transformOrder(order)
  }

  async updateOrder(
    credentials: Credentials,
    id: string,
    _data: Partial<Order>,
  ): Promise<Order> {
    // SAP Commerce OCC has limited order update support.
    // Re-fetch and return current state.
    return this.getOrder(credentials, id)
  }

  async cancelOrder(credentials: Credentials, id: string): Promise<Order> {
    const client = this.clientFor(credentials)
    await client.post(`/users/current/orders/${encodeURIComponent(id)}/cancellation`, {})
    return this.getOrder(credentials, id)
  }

  // ── Fulfillments ──────────────────────────────────────────────────────────

  async listFulfillments(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<Fulfillment[]> {
    const userId = (params['userId'] ?? params['user_id'] ?? 'current') as string
    const client = this.clientFor(credentials)
    const res = await client.listWithPagination<RawSapOrder>(
      `/users/${encodeURIComponent(userId)}/orders`,
      'orders',
      this.listParams(params),
    )
    return res.items.map((o) => transformFulfillment(o))
  }

  async getFulfillment(credentials: Credentials, id: string): Promise<Fulfillment> {
    const client = this.clientFor(credentials)
    const order = await client.get<RawSapOrder>(
      `/users/current/orders/${encodeURIComponent(id)}`,
      { fields: 'FULL' },
    )
    // Check for consignment data
    const consignments = (order as Record<string, unknown>)['consignments'] as
      | RawSapConsignment[]
      | undefined
    return transformFulfillment(order, consignments?.[0])
  }

  // ── Refunds ───────────────────────────────────────────────────────────────

  async listRefunds(credentials: Credentials, params: QueryParams): Promise<Refund[]> {
    const orderId = params['order_id'] ?? params['orderId']
    if (orderId == null) {
      throw new Error('sap-commerce listRefunds requires `order_id` in query params')
    }
    const client = this.clientFor(credentials)
    const order = await client.get<RawSapOrder & { returnRequests?: RawSapReturnRequest[] }>(
      `/users/current/orders/${encodeURIComponent(String(orderId))}`,
      { fields: 'FULL' },
    )
    return (order.returnRequests ?? []).map((rr) => transformRefund(rr, order.code))
  }

  async getRefund(credentials: Credentials, id: string): Promise<Refund> {
    // SAP Commerce doesn't have a direct return request lookup in OCC.
    // Attempt to find it by scanning recent orders.
    const client = this.clientFor(credentials)
    const res = await client.listWithPagination<RawSapOrder & { returnRequests?: RawSapReturnRequest[] }>(
      '/users/current/orders',
      'orders',
      { limit: 50, fields: 'FULL' },
    )
    for (const order of res.items) {
      const rr = order.returnRequests?.find((r) => r.rma === id || r.code === id)
      if (rr) return transformRefund(rr, order.code)
    }
    throw new Error(`sap-commerce refund ${id} not found`)
  }

  async createRefund(credentials: Credentials, data: Partial<Refund>): Promise<Refund> {
    if (!data.orderId) throw new Error('createRefund requires orderId')
    const client = this.clientFor(credentials)
    const body = untransformRefund(data)
    const raw = await client.post<RawSapReturnRequest>(
      `/users/current/orders/${encodeURIComponent(data.orderId)}/returns`,
      body,
    )
    return transformRefund(raw, data.orderId)
  }

  // ── Transactions ──────────────────────────────────────────────────────────

  async listTransactions(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<Transaction[]> {
    const orderId = params['order_id'] ?? params['orderId']
    if (orderId == null) {
      throw new Error('sap-commerce listTransactions requires `order_id` in query params')
    }
    const client = this.clientFor(credentials)
    const order = await client.get<RawSapOrder & { paymentTransactions?: RawSapPaymentTransaction[] }>(
      `/users/current/orders/${encodeURIComponent(String(orderId))}`,
      { fields: 'FULL' },
    )
    return (order.paymentTransactions ?? []).map((pt) =>
      transformTransaction(pt, order.code),
    )
  }

  async getTransaction(credentials: Credentials, id: string): Promise<Transaction> {
    // SAP Commerce doesn't expose individual transactions via OCC.
    // Scan recent orders to find the transaction.
    const client = this.clientFor(credentials)
    const res = await client.listWithPagination<RawSapOrder & { paymentTransactions?: RawSapPaymentTransaction[] }>(
      '/users/current/orders',
      'orders',
      { limit: 50, fields: 'FULL' },
    )
    for (const order of res.items) {
      const tx = order.paymentTransactions?.find((t) => t.id === id || t.code === id)
      if (tx) return transformTransaction(tx, order.code)
    }
    throw new Error(`sap-commerce transaction ${id} not found`)
  }

  // ── Discounts (SAP Commerce promotions) ───────────────────────────────────

  async listDiscounts(credentials: Credentials, params: QueryParams): Promise<Discount[]> {
    const client = this.clientFor(credentials)
    const queryParams = this.listParams(params)
    const type = (params['type'] ?? 'all') as string
    const res = await client.listWithPagination<RawSapPromotion>(
      `/promotions?type=${encodeURIComponent(type)}`,
      'promotions',
      queryParams,
    )
    return res.items.map((p) => transformDiscount(p))
  }

  async getDiscount(credentials: Credentials, id: string): Promise<Discount> {
    const client = this.clientFor(credentials)
    const raw = await client.get<RawSapPromotion>(
      `/promotions/${encodeURIComponent(id)}`,
    )
    return transformDiscount(raw)
  }
}
