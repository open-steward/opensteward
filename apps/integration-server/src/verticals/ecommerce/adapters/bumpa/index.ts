/**
 * Bumpa adapter for the ecommerce vertical.
 *
 * Maps the Bumpa REST API (https://api.getbumpa.com/v1) to the canonical
 * ecommerce resources. Bumpa uses a Bearer API key for authentication —
 * there is no OAuth code-exchange flow. Keys are long-lived; refreshCredentials
 * is a no-op.
 *
 * Refused with 501 NOT_SUPPORTED before any request is sent (see
 * {@link notDocumented}): listLocations/getLocation, listCollections/
 * getCollection, listInventoryLevels, listCustomers/getCustomer,
 * listRefunds/getRefund, listTransactions/getTransaction and
 * listDiscounts/getDiscount. Bumpa's API reference documents none of those
 * resources.
 *
 * Not yet rebuilt: products, variants and orders. Bumpa documents
 * GET /api/commerce/v1/products (X-Api-Key public key; limit, page) and
 * GET /api/commerce/v1/orders (X-Api-Key secret key; limit), but publishes no
 * example response for either, so their fields cannot be mapped from the
 * docs. This client's base URL (/v1) and Bearer auth are also not Bumpa's.
 * The write methods below call paths Bumpa does not document.
 *
 * Docs: https://docs.bumpa.io (the Postman collection "Bumpa API v1",
 * https://docs.bumpa.io/api/collections/54114412/2sBXqDsNUN)
 */

import { simpleApiKey } from '@opensteward/shared'
import type { Credentials, QueryParams } from '@opensteward/shared'
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

import { buildAuthUrl, exchangeCode as bumpaExchangeCode } from './auth'
import { BumpaClient } from './client'
import { DEFAULT_PAGE_SIZE } from './constants'

import {
  transformProduct,
  untransformProduct,
  transformVariant,
  untransformVariant,
  type RawBumpaProduct,
  type RawBumpaVariant,
} from './transform/product'
import {
  transformCollection,
  untransformCollection,
  type RawBumpaCollection,
} from './transform/collection'
import { transformInventoryLevel, type RawBumpaInventoryItem } from './transform/inventory'
import { transformCustomer, untransformCustomer, type RawBumpaCustomer } from './transform/customer'
import { transformOrder, untransformOrder, type RawBumpaOrder } from './transform/order'
import { transformRefund, untransformRefund, type RawBumpaRefund } from './transform/refund'
import { transformDiscount, untransformDiscount, type RawBumpaDiscount } from './transform/discount'

// ── Credential form ───────────────────────────────────────────────────────────

const SIMPLE_API_KEY_FORM = simpleApiKey({
  label: 'API key',
  helpText: 'Generate an API key in the Bumpa web app under Store → API key.',
  placeholder: 'bumpa_live_...',
})

/**
 * The resources Bumpa's API reference documents. Its overview reads "Base
 * path: /api/commerce/v1", and its 21 requests are all under that path:
 * products, carts, shipping-options, checkouts, analytics and orders.
 */
const DOCUMENTED =
  "Bumpa's API reference (https://docs.bumpa.io) documents only products, carts, " +
  'shipping-options, checkouts, analytics and orders under "Base path: /api/commerce/v1"'

/**
 * Refuses a read whose resource Bumpa does not document, before anything is
 * sent. The router turns the 501 into NOT_SUPPORTED for the caller.
 */
function notDocumented(what: string, detail: string): never {
  throw Object.assign(new Error(`Bumpa cannot ${what}: ${DOCUMENTED}; ${detail}`), {
    statusCode: 501,
    code: 'NOT_SUPPORTED',
  })
}

// ── Adapter ───────────────────────────────────────────────────────────────────

export interface BumpaAdapterConfig {
  /** Optional API key to use when credentials are not per-connection. */
  apiKey?: string
}

export class BumpaAdapter implements EcommerceAdapter {
  readonly platform = 'bumpa'
  readonly version = '0.1.0'
  /** Honours `params.search`; see AdapterCapabilities. Declared so the
   *  router can refuse the parameter on adapters that would drop it. */
  readonly capabilities = { search: true }

  // Connect Link support — single API-key form.
  credentialFields = SIMPLE_API_KEY_FORM.credentialFields
  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  private configApiKey: string | undefined

  constructor(config: BumpaAdapterConfig = {}) {
    this.configApiKey = config.apiKey
  }

  // ── Auth ──────────────────────────────────────────────────────────────────

  getAuthUrl(_state: string): string {
    // Bumpa has no OAuth authorize URL — return the key-generation page.
    return buildAuthUrl()
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    // Throws with a descriptive error — see ./auth.ts.
    return bumpaExchangeCode()
  }

  /**
   * Bumpa API keys do not expire and are not rotated.
   */
  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return credentials
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private clientFor(credentials: Credentials): BumpaClient {
    // Prefer the per-connection API key; fall back to the constructor config.
    const apiKey =
      credentials.accessToken && credentials.accessToken !== 'api-key'
        ? credentials.accessToken
        : this.configApiKey

    if (!apiKey) {
      throw new Error(
        'BumpaAdapter: API key is required. ' +
          'Generate one in the Bumpa web app (Store → API key) and POST it to ' +
          '/v1/connections with credentials: { accessToken: "<api-key>" }.',
      )
    }

    return new BumpaClient({ ...credentials, accessToken: apiKey })
  }

  private listParams(params: QueryParams): Record<string, unknown> {
    const out: Record<string, unknown> = {
      per_page: params.limit ?? DEFAULT_PAGE_SIZE,
    }
    if (params.page != null) out['page'] = params.page
    if (params.updatedAfter) out['updated_after'] = params.updatedAfter.toISOString()
    if (params.search) out['search'] = params.search
    return out
  }

  // ── Products ──────────────────────────────────────────────────────────────

  async listProducts(credentials: Credentials, params: QueryParams): Promise<Product[]> {
    const res = await this.clientFor(credentials).listWithPage<RawBumpaProduct>(
      '/products',
      this.listParams(params),
    )
    return res.items.map(transformProduct)
  }

  async getProduct(credentials: Credentials, id: string): Promise<Product> {
    const raw = await this.clientFor(credentials).get<RawBumpaProduct>(`/products/${id}`)
    return transformProduct(raw)
  }

  async createProduct(credentials: Credentials, data: Partial<Product>): Promise<Product> {
    const raw = await this.clientFor(credentials).post<RawBumpaProduct>(
      '/products',
      untransformProduct(data),
    )
    return transformProduct(raw)
  }

  async updateProduct(
    credentials: Credentials,
    id: string,
    data: Partial<Product>,
  ): Promise<Product> {
    const raw = await this.clientFor(credentials).put<RawBumpaProduct>(
      `/products/${id}`,
      untransformProduct(data),
    )
    return transformProduct(raw)
  }

  async deleteProduct(credentials: Credentials, id: string): Promise<void> {
    await this.clientFor(credentials).delete(`/products/${id}`)
  }

  // ── Variants ──────────────────────────────────────────────────────────────

  async listVariants(credentials: Credentials, params: QueryParams): Promise<ProductVariant[]> {
    const productId = (params['productId'] ?? params['product_id']) as string | undefined
    if (!productId) {
      // Fallback: fetch all products and flatten their variants.
      const res = await this.clientFor(credentials).listWithPage<RawBumpaProduct>(
        '/products',
        this.listParams(params),
      )
      return res.items.flatMap((p) => {
        const currency = (p.currency as string | undefined) ?? 'NGN'
        const rawVariants = (p.product_variants ?? p.variants ?? []) as RawBumpaVariant[]
        return rawVariants.map((v) => transformVariant(v, currency))
      })
    }

    const product = await this.clientFor(credentials).get<RawBumpaProduct>(`/products/${productId}`)
    const currency = (product.currency as string | undefined) ?? 'NGN'
    const rawVariants = (product.product_variants ?? product.variants ?? []) as RawBumpaVariant[]
    return rawVariants.map((v) => transformVariant(v, currency))
  }

  async getVariant(credentials: Credentials, id: string): Promise<ProductVariant> {
    // Bumpa variants are nested under products. Accept composite `productId:variantId`
    // or standalone variantId (we attempt a direct fetch first).
    const parts = id.split(':')
    if (parts.length === 2) {
      const [productId, variantId] = parts as [string, string]
      const product = await this.clientFor(credentials).get<RawBumpaProduct>(
        `/products/${productId}`,
      )
      const currency = (product.currency as string | undefined) ?? 'NGN'
      const rawVariants = (product.product_variants ?? product.variants ?? []) as RawBumpaVariant[]
      const found = rawVariants.find((v) => String(v.id) === variantId)
      if (!found) throw new Error(`Variant ${variantId} not found on product ${productId}`)
      return transformVariant(found, currency)
    }
    // Single id — try to find by scanning product variants.
    throw new Error(
      'Bumpa getVariant requires composite id format `productId:variantId`. ' +
        'Use listVariants with productId to enumerate available variants.',
    )
  }

  async updateVariant(
    credentials: Credentials,
    id: string,
    data: Partial<ProductVariant>,
  ): Promise<ProductVariant> {
    const [productId, variantId] = id.split(':') as [string, string | undefined]
    if (!variantId) throw new Error('updateVariant requires composite id `productId:variantId`')
    const raw = await this.clientFor(credentials).put<RawBumpaVariant>(
      `/products/${productId}/variants/${variantId}`,
      untransformVariant(data),
    )
    return transformVariant(raw)
  }

  // ── Collections ───────────────────────────────────────────────────────────

  async listCollections(_credentials: Credentials, _params: QueryParams): Promise<Collection[]> {
    return notDocumented('list collections', 'it has no collections request.')
  }

  async getCollection(_credentials: Credentials, _id: string): Promise<Collection> {
    return notDocumented('get a collection', 'it has no collections request.')
  }

  async createCollection(credentials: Credentials, data: Partial<Collection>): Promise<Collection> {
    const raw = await this.clientFor(credentials).post<RawBumpaCollection>(
      '/collections',
      untransformCollection(data),
    )
    return transformCollection(raw)
  }

  async updateCollection(
    credentials: Credentials,
    id: string,
    data: Partial<Collection>,
  ): Promise<Collection> {
    const raw = await this.clientFor(credentials).put<RawBumpaCollection>(
      `/collections/${id}`,
      untransformCollection(data),
    )
    return transformCollection(raw)
  }

  async deleteCollection(credentials: Credentials, id: string): Promise<void> {
    await this.clientFor(credentials).delete(`/collections/${id}`)
  }

  // ── Locations ─────────────────────────────────────────────────────────────

  async listLocations(_credentials: Credentials, _params: QueryParams): Promise<Location[]> {
    return notDocumented(
      'list locations',
      'it has no locations request. Location is only a query parameter: "Merchant routes are ' +
        'also location-scoped. Pass location_id explicitly to avoid silently falling back to ' +
        'the store default location."',
    )
  }

  async getLocation(_credentials: Credentials, _id: string): Promise<Location> {
    return notDocumented('get a location', 'it has no locations request.')
  }

  // ── Inventory ─────────────────────────────────────────────────────────────

  async listInventoryLevels(
    _credentials: Credentials,
    _params: QueryParams,
  ): Promise<InventoryLevel[]> {
    return notDocumented('list inventory levels', 'it has no inventory request.')
  }

  async adjustInventoryLevel(
    credentials: Credentials,
    data: { variantId: string; locationId: string; delta: number },
  ): Promise<InventoryLevel> {
    const raw = await this.clientFor(credentials).patch<RawBumpaInventoryItem>(
      `/inventory/${data.variantId}`,
      {
        quantity_adjustment: data.delta,
        location_id: data.locationId !== 'default' ? data.locationId : undefined,
      },
    )
    return transformInventoryLevel(raw)
  }

  async setInventoryLevel(
    credentials: Credentials,
    data: { variantId: string; locationId: string; available: number },
  ): Promise<InventoryLevel> {
    const raw = await this.clientFor(credentials).patch<RawBumpaInventoryItem>(
      `/inventory/${data.variantId}`,
      {
        quantity: data.available,
        location_id: data.locationId !== 'default' ? data.locationId : undefined,
      },
    )
    return transformInventoryLevel(raw)
  }

  // ── Customers ─────────────────────────────────────────────────────────────

  async listCustomers(_credentials: Credentials, _params: QueryParams): Promise<Customer[]> {
    return notDocumented(
      'list customers',
      'it has no customers request (analytics/customers returns analytics, not customer records).',
    )
  }

  async getCustomer(_credentials: Credentials, _id: string): Promise<Customer> {
    return notDocumented('get a customer', 'it has no customers request.')
  }

  async createCustomer(credentials: Credentials, data: Partial<Customer>): Promise<Customer> {
    const raw = await this.clientFor(credentials).post<RawBumpaCustomer>(
      '/customers',
      untransformCustomer(data),
    )
    return transformCustomer(raw)
  }

  async updateCustomer(
    credentials: Credentials,
    id: string,
    data: Partial<Customer>,
  ): Promise<Customer> {
    const raw = await this.clientFor(credentials).put<RawBumpaCustomer>(
      `/customers/${id}`,
      untransformCustomer(data),
    )
    return transformCustomer(raw)
  }

  // ── Orders ────────────────────────────────────────────────────────────────

  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const res = await this.clientFor(credentials).listWithPage<RawBumpaOrder>(
      '/orders',
      this.listParams(params),
    )
    return res.items.map(transformOrder)
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const raw = await this.clientFor(credentials).get<RawBumpaOrder>(`/orders/${id}`)
    return transformOrder(raw)
  }

  async createOrder(credentials: Credentials, data: Partial<Order>): Promise<Order> {
    const raw = await this.clientFor(credentials).post<RawBumpaOrder>(
      '/orders',
      untransformOrder(data),
    )
    return transformOrder(raw)
  }

  async updateOrder(credentials: Credentials, id: string, data: Partial<Order>): Promise<Order> {
    const raw = await this.clientFor(credentials).put<RawBumpaOrder>(
      `/orders/${id}`,
      untransformOrder(data),
    )
    return transformOrder(raw)
  }

  async cancelOrder(
    credentials: Credentials,
    id: string,
    data?: { reason?: string },
  ): Promise<Order> {
    const raw = await this.clientFor(credentials).patch<RawBumpaOrder>(`/orders/${id}/status`, {
      status: 'cancelled',
      reason: data?.reason,
    })
    return transformOrder(raw)
  }

  // ── Refunds ───────────────────────────────────────────────────────────────

  async listRefunds(_credentials: Credentials, _params: QueryParams): Promise<Refund[]> {
    return notDocumented('list refunds', 'it has no refunds request.')
  }

  async getRefund(_credentials: Credentials, _id: string): Promise<Refund> {
    return notDocumented('get a refund', 'it has no refunds request.')
  }

  async createRefund(credentials: Credentials, data: Partial<Refund>): Promise<Refund> {
    if (!data.orderId) throw new Error('createRefund requires orderId')
    const raw = await this.clientFor(credentials).post<RawBumpaRefund>(
      `/orders/${data.orderId}/refunds`,
      untransformRefund(data),
    )
    return transformRefund(raw)
  }

  // ── Transactions ──────────────────────────────────────────────────────────

  async listTransactions(_credentials: Credentials, _params: QueryParams): Promise<Transaction[]> {
    return notDocumented(
      'list transactions',
      'it has no transactions request (analytics/transactions returns analytics, not transaction records).',
    )
  }

  async getTransaction(_credentials: Credentials, _id: string): Promise<Transaction> {
    return notDocumented('get a transaction', 'it has no transactions request.')
  }

  // ── Discounts ─────────────────────────────────────────────────────────────

  async listDiscounts(_credentials: Credentials, _params: QueryParams): Promise<Discount[]> {
    return notDocumented('list discounts', 'it has no discounts request.')
  }

  async getDiscount(_credentials: Credentials, _id: string): Promise<Discount> {
    return notDocumented('get a discount', 'it has no discounts request.')
  }

  async createDiscount(credentials: Credentials, data: Partial<Discount>): Promise<Discount> {
    const raw = await this.clientFor(credentials).post<RawBumpaDiscount>(
      '/discounts',
      untransformDiscount(data),
    )
    return transformDiscount(raw)
  }

  async updateDiscount(
    credentials: Credentials,
    id: string,
    data: Partial<Discount>,
  ): Promise<Discount> {
    const raw = await this.clientFor(credentials).put<RawBumpaDiscount>(
      `/discounts/${id}`,
      untransformDiscount(data),
    )
    return transformDiscount(raw)
  }

  async deleteDiscount(credentials: Credentials, id: string): Promise<void> {
    await this.clientFor(credentials).delete(`/discounts/${id}`)
  }
}
