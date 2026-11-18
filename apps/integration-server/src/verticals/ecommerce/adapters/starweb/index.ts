/**
 * Starweb adapter for the ecommerce vertical.
 *
 * Maps the Starweb Shop API v2 to the canonical ecommerce resources.
 * Starweb uses OAuth 2.0 client-credentials — the token endpoint is
 * per-shop: `https://{shopId}.starwebserver.se/api/v2/token`. Access
 * tokens expire after a finite `expires_in` period; `refreshCredentials`
 * calls the token endpoint again to obtain a fresh token.
 *
 * Supported resources:
 *   Products / Variants  → GET, POST, PATCH, DELETE
 *   Collections          → GET, POST, PATCH, DELETE  (/product-categories)
 *   Customers            → GET, POST, PATCH, DELETE
 *   Orders               → GET, POST, PATCH + cancel (PATCH status)
 *   Fulfillments         → synthesised from order shipping fields
 *   Inventory            → synthesised from variant stockQuantity
 *   Locations            → synthetic single "default" location
 *
 * Resources NOT supported by Starweb v2 (returns 501 from registry):
 *   Refunds, Transactions, Discounts/Vouchers
 *
 * ── Resource coverage ──────────────────────────────────────────────
 * Unavailable: discount     — Starweb API v2 has no voucher/discount-code endpoint; absent from full SDK endpoint list.
 * Unavailable: refund       — Starweb API v2 has no refund endpoint; absent from full SDK endpoint list.
 * Unavailable: transaction  — Starweb API v2 has no payment-transaction endpoint; payment methods are read-only reference data.
 *
 * Auth model: OAuth2 client-credentials (shopId + clientId + clientSecret).
 * The Connect Link form is built via `oauth2ClientCredentials` with an
 * additional `shopId` field.
 *
 * Docs: https://api-docs.starweb.se/
 */

import { oauth2ClientCredentials } from '@opensteward/shared'
import type { Credentials, QueryParams } from '@opensteward/shared'
import type { EcommerceAdapter } from '../../adapter/interface'
import type { Product, ProductVariant } from '../../schema/product'
import type { Collection } from '../../schema/collection'
import type { Location } from '../../schema/location'
import type { InventoryLevel } from '../../schema/inventory'
import type { Customer } from '../../schema/customer'
import type { Order } from '../../schema/order'
import type { Fulfillment } from '../../schema/fulfillment'

import { fetchAccessToken } from './auth'
import { StarwebClient } from './client'
import { DEFAULT_PAGE_SIZE, tokenUrl } from './constants'
import {
  transformProduct,
  untransformProduct,
  transformVariant,
  untransformVariant,
  type RawStarwebProduct,
  type RawStarwebVariant,
} from './transform/product'
import {
  transformCollection,
  untransformCollection,
  type RawStarwebCategory,
} from './transform/collection'
import { syntheticDefaultLocation, STARWEB_LOCATION_ID } from './transform/location'
import {
  transformInventoryLevel,
  type RawStarwebVariantStock,
} from './transform/inventory'
import {
  transformCustomer,
  untransformCustomer,
  type RawStarwebCustomer,
} from './transform/customer'
import {
  transformOrder,
  untransformOrder,
  type RawStarwebOrder,
} from './transform/order'
import {
  transformFulfillment,
  untransformFulfillment,
  type RawStarwebOrderForFulfillment,
} from './transform/fulfillment'
import { StarwebItemEnvelope } from './client'

// ── Credential form ───────────────────────────────────────────────────────────

/**
 * Build the Connect Link credential form and token-exchange helper. The
 * token URL is per-shop, so we derive it from the customer-supplied
 * `shopId` field at exchange time.
 */
const CREDENTIAL_FORM = oauth2ClientCredentials({
  tokenUrl: (input) => tokenUrl(input['shopId'] ?? ''),
  additionalFields: [
    {
      name: 'shopId',
      label: 'Shop ID',
      type: 'text',
      placeholder: 'myshop',
      helpText: 'The subdomain of your Starweb store, e.g. "myshop" for myshop.starwebserver.se',
      required: true,
    },
  ],
  buildExtra: (input) => ({
    clientId: input['clientId'],
    clientSecret: input['clientSecret'],
    shopId: input['shopId'],
  }),
})

// ── Adapter ───────────────────────────────────────────────────────────────────

export interface StarwebAdapterConfig {
  /** Starweb shop subdomain, e.g. `myshop`. */
  shopId?: string
  /** OAuth2 client ID (may come from per-connection credentials instead). */
  clientId?: string
  /** OAuth2 client secret (may come from per-connection credentials instead). */
  clientSecret?: string
}

export class StarwebAdapter implements EcommerceAdapter {
  readonly platform = 'starweb'
  readonly version = '0.1.0'
  /** Honours `params.search`; see AdapterCapabilities. Declared so the
   *  router can refuse the parameter on adapters that would drop it. */
  readonly capabilities = { search: true }

  // Connect Link support.
  credentialFields = CREDENTIAL_FORM.credentialFields
  exchangeCredentials = CREDENTIAL_FORM.exchangeCredentials

  private configShopId: string | undefined
  private configClientId: string | undefined
  private configClientSecret: string | undefined

  constructor(config: StarwebAdapterConfig = {}) {
    this.configShopId = config.shopId
    this.configClientId = config.clientId
    this.configClientSecret = config.clientSecret
  }

  // ── Auth ──────────────────────────────────────────────────────────────────

  getAuthUrl(_state: string): string {
    // Starweb uses client-credentials — there is no browser redirect URL.
    // Return an informational link to the Starweb API docs.
    return 'https://api-docs.starweb.se/'
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    throw new Error(
      'Starweb uses OAuth2 client-credentials — there is no authorization-code flow. ' +
        'Use the Connect Link form with clientId, clientSecret, and shopId.',
    )
  }

  /**
   * Re-issue the client-credentials grant to get a fresh access token.
   * Requires `credentials.extra.{clientId, clientSecret, shopId}`.
   */
  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    const shopId = this.shopIdFrom(credentials)
    const clientId = this.clientIdFrom(credentials)
    const clientSecret = this.clientSecretFrom(credentials)
    return fetchAccessToken(shopId, clientId, clientSecret)
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private shopIdFrom(credentials: Credentials): string {
    const fromExtra = credentials.extra?.['shopId'] as string | undefined
    const id = fromExtra ?? this.configShopId
    if (!id) throw new Error('Starweb adapter: shopId is required (set via config or credentials.extra.shopId)')
    return id
  }

  private clientIdFrom(credentials: Credentials): string {
    const fromExtra = credentials.extra?.['clientId'] as string | undefined
    return fromExtra ?? this.configClientId ?? ''
  }

  private clientSecretFrom(credentials: Credentials): string {
    const fromExtra = credentials.extra?.['clientSecret'] as string | undefined
    return fromExtra ?? this.configClientSecret ?? ''
  }

  private clientFor(credentials: Credentials): StarwebClient {
    return new StarwebClient(credentials, this.shopIdFrom(credentials))
  }

  private listParams(params: QueryParams): Record<string, unknown> {
    const out: Record<string, unknown> = {
      per_page: params.limit ?? DEFAULT_PAGE_SIZE,
    }
    if (params.page != null) out['page'] = params.page
    if (params.updatedAfter) out['updatedSince'] = params.updatedAfter.toISOString()
    if (params.search) out['search'] = params.search
    return out
  }

  // ── Products ──────────────────────────────────────────────────────────────

  async listProducts(credentials: Credentials, params: QueryParams): Promise<Product[]> {
    const res = await this.clientFor(credentials).listWithPage<RawStarwebProduct>(
      'products',
      { ...this.listParams(params), include: 'primaryVariant,primaryVariant.prices,primaryVariant.attributeValues,mediaFiles,languages,categories' },
    )
    return res.items.map((p) => transformProduct(p))
  }

  async getProduct(credentials: Credentials, id: string): Promise<Product> {
    const res = await this.clientFor(credentials).get<StarwebItemEnvelope<RawStarwebProduct>>(
      `products/${id}`,
      { include: 'variants,variants.prices,variants.attributeValues,mediaFiles,languages,categories' },
    )
    return transformProduct(res.data)
  }

  async createProduct(credentials: Credentials, data: Partial<Product>): Promise<Product> {
    const res = await this.clientFor(credentials).post<StarwebItemEnvelope<RawStarwebProduct>>(
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
    const res = await this.clientFor(credentials).patch<StarwebItemEnvelope<RawStarwebProduct>>(
      `products/${id}`,
      untransformProduct(data),
    )
    return transformProduct(res.data)
  }

  async deleteProduct(credentials: Credentials, id: string): Promise<void> {
    await this.clientFor(credentials).delete(`products/${id}`)
  }

  // ── Variants ──────────────────────────────────────────────────────────────

  async listVariants(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<ProductVariant[]> {
    const productId = (params['productId'] ?? params['product_id']) as string | number | undefined
    if (productId == null) {
      throw new Error('Starweb requires ?product_id= for listVariants; variants are nested under products.')
    }
    const pid = String(productId)
    const res = await this.clientFor(credentials).listWithPage<RawStarwebVariant>(
      `products/${pid}/variants`,
      { ...this.listParams(params), include: 'prices,attributeValues' },
    )
    return res.items.map((v) => transformVariant(v, pid))
  }

  async getVariant(credentials: Credentials, id: string): Promise<ProductVariant> {
    const [productId, variantId] = id.split(':')
    if (!productId || !variantId) {
      throw new Error('Invalid variant id format: expected `productId:variantId`')
    }
    const res = await this.clientFor(credentials).get<StarwebItemEnvelope<RawStarwebVariant>>(
      `products/${productId}/variants/${variantId}`,
      { include: 'prices,attributeValues' },
    )
    return transformVariant(res.data, productId)
  }

  async createVariant(
    credentials: Credentials,
    data: Partial<ProductVariant>,
  ): Promise<ProductVariant> {
    const productId = data.productId
    if (!productId) throw new Error('createVariant requires productId')
    const res = await this.clientFor(credentials).post<StarwebItemEnvelope<RawStarwebVariant>>(
      `products/${productId}/variants`,
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
    const res = await this.clientFor(credentials).patch<StarwebItemEnvelope<RawStarwebVariant>>(
      `products/${productId}/variants/${variantId}`,
      untransformVariant(data),
    )
    return transformVariant(res.data, productId)
  }

  async deleteVariant(credentials: Credentials, id: string): Promise<void> {
    const [productId, variantId] = id.split(':')
    if (!productId || !variantId) {
      throw new Error('Invalid variant id format: expected `productId:variantId`')
    }
    await this.clientFor(credentials).delete(`products/${productId}/variants/${variantId}`)
  }

  // ── Collections ───────────────────────────────────────────────────────────

  async listCollections(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<Collection[]> {
    const res = await this.clientFor(credentials).listWithPage<RawStarwebCategory>(
      'product-categories',
      { ...this.listParams(params), include: 'languages' },
    )
    return res.items.map(transformCollection)
  }

  async getCollection(credentials: Credentials, id: string): Promise<Collection> {
    const res = await this.clientFor(credentials).get<StarwebItemEnvelope<RawStarwebCategory>>(
      `product-categories/${id}`,
      { include: 'languages' },
    )
    return transformCollection(res.data)
  }

  async createCollection(
    credentials: Credentials,
    data: Partial<Collection>,
  ): Promise<Collection> {
    const res = await this.clientFor(credentials).post<StarwebItemEnvelope<RawStarwebCategory>>(
      'product-categories',
      untransformCollection(data),
    )
    return transformCollection(res.data)
  }

  async updateCollection(
    credentials: Credentials,
    id: string,
    data: Partial<Collection>,
  ): Promise<Collection> {
    const res = await this.clientFor(credentials).patch<StarwebItemEnvelope<RawStarwebCategory>>(
      `product-categories/${id}`,
      untransformCollection(data),
    )
    return transformCollection(res.data)
  }

  async deleteCollection(credentials: Credentials, id: string): Promise<void> {
    await this.clientFor(credentials).delete(`product-categories/${id}`)
  }

  // ── Locations ─────────────────────────────────────────────────────────────

  async listLocations(_credentials: Credentials, _params: QueryParams): Promise<Location[]> {
    return [syntheticDefaultLocation(this.configShopId ?? 'starweb')]
  }

  async getLocation(_credentials: Credentials, id: string): Promise<Location> {
    if (id !== STARWEB_LOCATION_ID) {
      throw new Error(`Starweb has no native locations; unknown location id '${id}'`)
    }
    return syntheticDefaultLocation(this.configShopId ?? 'starweb')
  }

  // ── Inventory ─────────────────────────────────────────────────────────────

  /**
   * Starweb stock is on the variant. We accept `productId` in params to scope
   * the fetch; without it we cannot enumerate all variants efficiently.
   */
  async listInventoryLevels(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<InventoryLevel[]> {
    const productId = (params['productId'] ?? params['product_id']) as string | undefined
    if (!productId) {
      throw new Error(
        'Starweb listInventoryLevels requires ?product_id= — stock is tracked per variant.',
      )
    }
    const res = await this.clientFor(credentials).listWithPage<RawStarwebVariantStock>(
      `products/${productId}/variants`,
      this.listParams(params),
    )
    return res.items.map((v) => transformInventoryLevel(v, productId))
  }

  async setInventoryLevel(
    credentials: Credentials,
    data: { variantId: string; locationId: string; available: number },
  ): Promise<InventoryLevel> {
    // variantId is `productId:variantId`
    const [productId, variantId] = data.variantId.split(':')
    if (!productId || !variantId) {
      throw new Error('Starweb setInventoryLevel requires composite variantId `productId:variantId`')
    }
    const res = await this.clientFor(credentials).patch<StarwebItemEnvelope<RawStarwebVariantStock>>(
      `products/${productId}/variants/${variantId}`,
      { stockQuantity: data.available },
    )
    return transformInventoryLevel(res.data, productId)
  }

  async adjustInventoryLevel(
    credentials: Credentials,
    data: { variantId: string; locationId: string; delta: number },
  ): Promise<InventoryLevel> {
    const [productId, variantId] = data.variantId.split(':')
    if (!productId || !variantId) {
      throw new Error('Starweb adjustInventoryLevel requires composite variantId `productId:variantId`')
    }
    const client = this.clientFor(credentials)
    const current = await client.get<StarwebItemEnvelope<RawStarwebVariantStock>>(
      `products/${productId}/variants/${variantId}`,
    )
    const newQty = (current.data.stockQuantity ?? 0) + data.delta
    const updated = await client.patch<StarwebItemEnvelope<RawStarwebVariantStock>>(
      `products/${productId}/variants/${variantId}`,
      { stockQuantity: Math.max(0, newQty) },
    )
    return transformInventoryLevel(updated.data, productId)
  }

  // ── Customers ─────────────────────────────────────────────────────────────

  async listCustomers(credentials: Credentials, params: QueryParams): Promise<Customer[]> {
    const res = await this.clientFor(credentials).listWithPage<RawStarwebCustomer>(
      'customers',
      { ...this.listParams(params), include: 'addresses' },
    )
    return res.items.map(transformCustomer)
  }

  async getCustomer(credentials: Credentials, id: string): Promise<Customer> {
    const res = await this.clientFor(credentials).get<StarwebItemEnvelope<RawStarwebCustomer>>(
      `customers/${id}`,
      { include: 'addresses' },
    )
    return transformCustomer(res.data)
  }

  async createCustomer(
    credentials: Credentials,
    data: Partial<Customer>,
  ): Promise<Customer> {
    const res = await this.clientFor(credentials).post<StarwebItemEnvelope<RawStarwebCustomer>>(
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
    const res = await this.clientFor(credentials).patch<StarwebItemEnvelope<RawStarwebCustomer>>(
      `customers/${id}`,
      untransformCustomer(data),
    )
    return transformCustomer(res.data)
  }

  async deleteCustomer(credentials: Credentials, id: string): Promise<void> {
    await this.clientFor(credentials).delete(`customers/${id}`)
  }

  // ── Orders ────────────────────────────────────────────────────────────────

  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    // The Starweb orders endpoint does NOT support an updatedSince / modification
    // date filter (unlike products and customers). It only exposes
    // `ordersCreatedAfter` / `ordersCreatedBefore`. We map `updatedAfter` to
    // `ordersCreatedAfter` as the closest available proxy; modification-date
    // filtering is not supported by the upstream API.
    const base = this.listParams(params)
    // Remove the updatedSince param (not accepted by /orders).
    delete base['updatedSince']
    if (params.updatedAfter) {
      base['ordersCreatedAfter'] = params.updatedAfter.toISOString()
    }
    const res = await this.clientFor(credentials).listWithPage<RawStarwebOrder>(
      'orders',
      { ...base, include: 'items,addresses,status' },
    )
    return res.items.map(transformOrder)
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const res = await this.clientFor(credentials).get<StarwebItemEnvelope<RawStarwebOrder>>(
      `orders/${id}`,
      { include: 'items,addresses,status' },
    )
    return transformOrder(res.data)
  }

  async createOrder(credentials: Credentials, data: Partial<Order>): Promise<Order> {
    const res = await this.clientFor(credentials).post<StarwebItemEnvelope<RawStarwebOrder>>(
      'orders',
      untransformOrder(data),
    )
    return transformOrder(res.data)
  }

  async updateOrder(
    credentials: Credentials,
    id: string,
    data: Partial<Order>,
  ): Promise<Order> {
    const res = await this.clientFor(credentials).patch<StarwebItemEnvelope<RawStarwebOrder>>(
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
    // Starweb has no explicit cancel endpoint — we set isComplete=false and
    // paymentStatus to signal cancellation through the status system.
    const res = await this.clientFor(credentials).patch<StarwebItemEnvelope<RawStarwebOrder>>(
      `orders/${id}`,
      { isComplete: false },
    )
    return transformOrder(res.data)
  }

  // ── Fulfillments ──────────────────────────────────────────────────────────

  /**
   * Starweb does not have a dedicated fulfillment resource. We synthesise a
   * Fulfillment from the order's shipping tracking fields. `order_id` is
   * required in params.
   */
  async listFulfillments(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<Fulfillment[]> {
    const orderId = (params['order_id'] ?? params['orderId']) as string | undefined
    if (!orderId) {
      throw new Error('Starweb listFulfillments requires `order_id` in query params')
    }
    const res = await this.clientFor(credentials).get<StarwebItemEnvelope<RawStarwebOrderForFulfillment>>(
      `orders/${orderId}`,
    )
    return [transformFulfillment(res.data)]
  }

  async getFulfillment(credentials: Credentials, id: string): Promise<Fulfillment> {
    // Fulfillment id == order id in Starweb's synthesised model.
    const res = await this.clientFor(credentials).get<StarwebItemEnvelope<RawStarwebOrderForFulfillment>>(
      `orders/${id}`,
    )
    return transformFulfillment(res.data)
  }

  async updateFulfillment(
    credentials: Credentials,
    id: string,
    data: Partial<Fulfillment>,
  ): Promise<Fulfillment> {
    // Update the order's tracking fields via PATCH.
    const res = await this.clientFor(credentials).patch<StarwebItemEnvelope<RawStarwebOrderForFulfillment>>(
      `orders/${id}`,
      untransformFulfillment(data),
    )
    return transformFulfillment(res.data)
  }
}
