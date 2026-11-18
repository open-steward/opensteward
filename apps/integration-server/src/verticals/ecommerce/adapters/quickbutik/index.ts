/**
 * Quickbutik adapter for the ecommerce vertical.
 *
 * Maps the Quickbutik REST API v1 (https://api.quickbutik.com/v1) to the
 * canonical ecommerce resources. Authentication is HTTP Basic using the
 * merchant's API key as both username and password.
 *
 * Supported resources:
 *  - Products (list, get, create, update, delete)
 *  - Variants  (list via product, get, update)
 *  - Collections / Categories (list, get, create)
 *  - Orders (list, get, create, update, cancel)
 *  - Inventory (list via product variants; adjust/set via product update)
 *  - Locations (synthetic single default location)
 *
 * Not supported by the Quickbutik API:
 *  - Standalone customers endpoint
 *  - Fulfillments
 *  - Refunds
 *  - Transactions
 *  - Discounts
 *
 * Those methods are intentionally omitted; the registry returns 501 for
 * unimplemented optional methods automatically.
 *
 * Docs: https://quickbutik.dev/api-v1/introduction
 */

import { pageLocally, pageOffset, reportUpstreamPage, simpleApiKey } from '@opensteward/shared'
import type { Credentials, QueryParams } from '@opensteward/shared'
import type { EcommerceAdapter } from '../../adapter/interface'
import type { Product, ProductVariant } from '../../schema/product'
import type { Collection } from '../../schema/collection'
import type { Location } from '../../schema/location'
import type { InventoryLevel } from '../../schema/inventory'
import type { Order } from '../../schema/order'

import { buildAuthUrl, exchangeCode as quickbutikExchangeCode } from './auth'
import { QuickbutikClient } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE_PRODUCTS, MAX_PAGE_SIZE_ORDERS } from './constants'

import {
  transformProduct,
  untransformProduct,
  transformVariant,
  untransformVariant,
  type RawQuickbutikProduct,
  type RawQuickbutikVariant,
} from './transform/product'
import {
  transformCollection,
  untransformCollection,
  type RawQuickbutikCategory,
} from './transform/collection'
import { syntheticDefaultLocation } from './transform/location'
import {
  transformInventoryLevel,
  DEFAULT_LOCATION_ID,
  type RawQuickbutikVariantStock,
} from './transform/inventory'
import {
  transformOrder,
  untransformOrder,
  untransformOrderStatus,
  type RawQuickbutikOrder,
} from './transform/order'

// ── simpleApiKey credential template ─────────────────────────────────────────

const SIMPLE_API_KEY_FORM = simpleApiKey()

// ── Quickbutik product list envelope ─────────────────────────────────────────

type QuickbutikProductEnvelope =
  | { product: RawQuickbutikProduct[] }
  | RawQuickbutikProduct[]

function unwrapProducts(data: QuickbutikProductEnvelope): RawQuickbutikProduct[] {
  if (Array.isArray(data)) return data
  const p = (data as { product: RawQuickbutikProduct[] }).product
  if (Array.isArray(p)) return p
  // Single product returned as `{ product: <object> }`
  if (p && typeof p === 'object') return [p as unknown as RawQuickbutikProduct]
  return []
}

// ── Quickbutik category list envelope ────────────────────────────────────────

/**
 * GET /v1/categories answers `{ "results": ... }` (CategoriesSuccess in
 * https://quickbutik.dev/openapi.yaml). The spec types `results` as one
 * Category and leaves the unfiltered shape undocumented, so accept an array,
 * an id-keyed object of categories, or a single category.
 */
function unwrapCategories(data: unknown): RawQuickbutikCategory[] {
  const body =
    data && typeof data === 'object' && !Array.isArray(data) && 'results' in data
      ? (data as { results: unknown }).results
      : data
  if (Array.isArray(body)) return body as RawQuickbutikCategory[]
  if (!body || typeof body !== 'object') return []
  if ('category_id' in body) return [body as RawQuickbutikCategory]
  return Object.values(body).filter(
    (v): v is RawQuickbutikCategory => !!v && typeof v === 'object' && 'category_id' in v,
  )
}

// ── Paging ───────────────────────────────────────────────────────────────────

/**
 * Quickbutik answers an empty result with 404 ("Note that empty search results
 * return 404 rather than 200 with an empty array." — openapi.yaml), so a page
 * past the end of a list whose last page was full comes back as a 404.
 */
function isNotFound(err: unknown): boolean {
  return (err as { response?: { status?: number } } | null)?.response?.status === 404
}

// ── Adapter ───────────────────────────────────────────────────────────────────

export interface QuickbutikAdapterConfig {
  /** No-op placeholder — no OAuth config needed for Quickbutik. */
  apiKey?: string
}

export class QuickbutikAdapter implements EcommerceAdapter {
  readonly platform = 'quickbutik'
  readonly version = '0.1.0'

  // Connect Link support — single API-key form.
  credentialFields = SIMPLE_API_KEY_FORM.credentialFields
  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  constructor(_config: QuickbutikAdapterConfig = {}) {}

  // ── Auth ──────────────────────────────────────────────────────────────────

  getAuthUrl(_state: string): string {
    // Quickbutik has no OAuth authorize URL — point at the API docs.
    return buildAuthUrl()
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    // Throws a descriptive error — see ./auth.ts.
    return quickbutikExchangeCode()
  }

  /**
   * Quickbutik API keys do not expire, so refreshCredentials is a no-op.
   */
  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return credentials
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private client(credentials: Credentials): QuickbutikClient {
    return new QuickbutikClient(credentials)
  }

  private productListParams(params: QueryParams): Record<string, unknown> {
    const out: Record<string, unknown> = {
      limit: Math.min(
        (params.limit as number | undefined) ?? DEFAULT_PAGE_SIZE,
        MAX_PAGE_SIZE_PRODUCTS,
      ),
      include_details: true,
    }
    // "The amount of rows to skip before returning" — stride by the size sent.
    out['offset'] = pageOffset(params, out['limit'] as number)
    if (params.updatedAfter) {
      // Quickbutik accepts UNIX timestamp for `from_date_modified`.
      out['from_date_modified'] = Math.floor(params.updatedAfter.getTime() / 1000).toString()
    }
    if (params['search']) out['search'] = params['search']
    return out
  }

  private orderListParams(params: QueryParams): Record<string, unknown> {
    const out: Record<string, unknown> = {
      limit: Math.min(
        (params.limit as number | undefined) ?? MAX_PAGE_SIZE_ORDERS,
        MAX_PAGE_SIZE_ORDERS,
      ),
      include_details: true,
    }
    // "Number of records to skip for pagination" — stride by the size sent.
    out['offset'] = pageOffset(params, out['limit'] as number)
    if (params['status']) out['status'] = params['status']
    if (params['from_date_paid']) out['from_date_paid'] = params['from_date_paid']
    if (params['to_date_paid']) out['to_date_paid'] = params['to_date_paid']
    if (params.updatedAfter) {
      out['from_status_date'] = Math.floor(params.updatedAfter.getTime() / 1000).toString()
    }
    return out
  }

  // ── Products ──────────────────────────────────────────────────────────────

  async listProducts(credentials: Credentials, params: QueryParams): Promise<Product[]> {
    const client = this.client(credentials)
    const queryParams = this.productListParams(params)
    const pageSize = queryParams['limit'] as number
    let items: RawQuickbutikProduct[]
    try {
      const res = await client.listWithOffset<RawQuickbutikProduct, QuickbutikProductEnvelope>(
        '/products',
        queryParams,
        unwrapProducts,
        MAX_PAGE_SIZE_PRODUCTS,
      )
      items = res.items
    } catch (err) {
      if (!isNotFound(err) || queryParams['offset'] === 0) throw err
      items = []
    }
    // No total or cursor in the body: a short page is the end.
    reportUpstreamPage(params, { hasMore: items.length >= pageSize, pageSize })
    return items.map((p) => transformProduct(p))
  }

  async getProduct(credentials: Credentials, id: string): Promise<Product> {
    const data = await this.client(credentials).get<QuickbutikProductEnvelope>(
      '/products',
      { product_id: id, include_details: true },
    )
    const items = unwrapProducts(data)
    if (items.length === 0) throw new Error(`Quickbutik product not found: ${id}`)
    return transformProduct(items[0]!)
  }

  async createProduct(credentials: Credentials, data: Partial<Product>): Promise<Product> {
    const res = await this.client(credentials).post<QuickbutikProductEnvelope>(
      '/products',
      untransformProduct(data),
    )
    const items = unwrapProducts(res)
    if (items.length === 0) throw new Error('Quickbutik create product returned no product')
    return transformProduct(items[0]!)
  }

  async updateProduct(
    credentials: Credentials,
    id: string,
    data: Partial<Product>,
  ): Promise<Product> {
    const body = { product_id: id, ...untransformProduct(data) }
    const res = await this.client(credentials).put<QuickbutikProductEnvelope>(
      '/products',
      body,
    )
    const items = unwrapProducts(res)
    if (items.length === 0) {
      // Some PUT endpoints return the updated resource; fall back to GET.
      return this.getProduct(credentials, id)
    }
    return transformProduct(items[0]!)
  }

  async deleteProduct(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`/products?product_id=${id}`)
  }

  // ── Variants ──────────────────────────────────────────────────────────────

  async listVariants(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<ProductVariant[]> {
    const productId = (params['productId'] ?? params['product_id']) as string | undefined
    if (!productId) {
      throw new Error(
        'Quickbutik requires ?product_id= for listVariants; variants are nested under products.',
      )
    }
    const data = await this.client(credentials).get<QuickbutikProductEnvelope>(
      '/products',
      { product_id: productId, include_details: true },
    )
    const items = unwrapProducts(data)
    if (items.length === 0) return []
    const product = items[0]!
    return (product.variants ?? []).map((v: RawQuickbutikVariant) =>
      transformVariant(v, productId),
    )
  }

  async getVariant(credentials: Credentials, id: string): Promise<ProductVariant> {
    // Composite id format: `productId:variantId`
    const [productId, variantId] = id.split(':')
    if (!productId || !variantId) {
      throw new Error('Invalid variant id format: expected `productId:variantId`')
    }
    const data = await this.client(credentials).get<QuickbutikProductEnvelope>(
      '/products',
      { product_id: productId, include_details: true },
    )
    const items = unwrapProducts(data)
    if (items.length === 0) throw new Error(`Quickbutik product not found: ${productId}`)
    const product = items[0]!
    const variant = (product.variants ?? []).find(
      (v: RawQuickbutikVariant) => String(v.id) === variantId,
    )
    if (!variant) throw new Error(`Quickbutik variant not found: ${id}`)
    return transformVariant(variant, productId)
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
    const body = {
      product_id: productId,
      variant_id: variantId,
      ...untransformVariant(data),
    }
    await this.client(credentials).put<unknown>('/products', body)
    // Re-fetch to get the updated state.
    return this.getVariant(credentials, id)
  }

  // ── Collections ───────────────────────────────────────────────────────────

  async listCollections(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<Collection[]> {
    // GET /v1/categories does not page (its one parameter is category_id), so
    // every category arrives at once and the caller's page is sliced here.
    const data = await this.client(credentials).get<unknown>('/categories')
    return pageLocally(unwrapCategories(data), params).map(transformCollection)
  }

  async getCollection(credentials: Credentials, id: string): Promise<Collection> {
    const data = await this.client(credentials).get<RawQuickbutikCategory>(
      '/categories',
      { category_id: id },
    )
    return transformCollection(data)
  }

  async createCollection(
    credentials: Credentials,
    data: Partial<Collection>,
  ): Promise<Collection> {
    const res = await this.client(credentials).post<RawQuickbutikCategory>(
      '/categories',
      untransformCollection(data),
    )
    return transformCollection(res)
  }

  // ── Locations ─────────────────────────────────────────────────────────────

  async listLocations(
    _credentials: Credentials,
    _params: QueryParams,
  ): Promise<Location[]> {
    return [syntheticDefaultLocation()]
  }

  async getLocation(_credentials: Credentials, id: string): Promise<Location> {
    if (id !== DEFAULT_LOCATION_ID) {
      throw new Error(
        `Quickbutik has no native locations endpoint; unknown location id '${id}'`,
      )
    }
    return syntheticDefaultLocation()
  }

  // ── Inventory ─────────────────────────────────────────────────────────────

  async listInventoryLevels(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<InventoryLevel[]> {
    const productId = (params['productId'] ?? params['product_id']) as string | undefined
    if (!productId) {
      throw new Error(
        'Quickbutik listInventoryLevels requires ?product_id= in query params',
      )
    }
    const data = await this.client(credentials).get<QuickbutikProductEnvelope>(
      '/products',
      { product_id: productId, include_details: true },
    )
    const items = unwrapProducts(data)
    if (items.length === 0) return []
    const product = items[0]!

    if (product.variants && product.variants.length > 0) {
      return (product.variants as RawQuickbutikVariantStock[]).map((v) =>
        transformInventoryLevel(v, productId),
      )
    }
    // Simple product — synthesise from the product itself.
    return [
      transformInventoryLevel(
        { id: productId, qty: product.qty } as RawQuickbutikVariantStock,
        productId,
      ),
    ]
  }

  async adjustInventoryLevel(
    credentials: Credentials,
    data: { variantId: string; locationId: string; delta: number },
  ): Promise<InventoryLevel> {
    const [productId, variantId] = data.variantId.split(':')
    if (!productId) {
      throw new Error(
        'Quickbutik adjustInventoryLevel requires composite variantId `productId:variantId`',
      )
    }
    const client = this.client(credentials)

    // Fetch the current stock.
    const current = await client.get<QuickbutikProductEnvelope>(
      '/products',
      { product_id: productId, include_details: true },
    )
    const products = unwrapProducts(current)
    const product = products[0]

    let currentQty = 0
    if (variantId && product?.variants) {
      const v = (product.variants as RawQuickbutikVariantStock[]).find(
        (x) => String(x.id) === variantId,
      )
      currentQty = v?.qty != null ? parseInt(String(v.qty), 10) || 0 : 0
    } else if (product) {
      currentQty =
        product.qty != null ? parseInt(String(product.qty), 10) || 0 : 0
    }

    const newQty = currentQty + data.delta

    const body: Record<string, unknown> = {
      product_id: productId,
      qty: newQty,
    }
    if (variantId) body['variant_id'] = variantId

    await client.put<unknown>('/products', body)

    const raw: RawQuickbutikVariantStock = {
      id: variantId ?? productId,
      qty: newQty,
    }
    return transformInventoryLevel(raw, productId)
  }

  async setInventoryLevel(
    credentials: Credentials,
    data: { variantId: string; locationId: string; available: number },
  ): Promise<InventoryLevel> {
    const [productId, variantId] = data.variantId.split(':')
    if (!productId) {
      throw new Error(
        'Quickbutik setInventoryLevel requires composite variantId `productId:variantId`',
      )
    }

    const body: Record<string, unknown> = {
      product_id: productId,
      qty: data.available,
    }
    if (variantId) body['variant_id'] = variantId

    await this.client(credentials).put<unknown>('/products', body)

    const raw: RawQuickbutikVariantStock = {
      id: variantId ?? productId,
      qty: data.available,
    }
    return transformInventoryLevel(raw, productId)
  }

  // ── Orders ────────────────────────────────────────────────────────────────

  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const client = this.client(credentials)
    const queryParams = this.orderListParams(params)
    const pageSize = queryParams['limit'] as number
    let items: RawQuickbutikOrder[]
    try {
      const res = await client.listWithOffset<RawQuickbutikOrder, RawQuickbutikOrder[]>(
        '/orders',
        queryParams,
        (data) => (Array.isArray(data) ? data : [data]),
        MAX_PAGE_SIZE_ORDERS,
      )
      items = res.items
    } catch (err) {
      if (!isNotFound(err) || queryParams['offset'] === 0) throw err
      items = []
    }
    // A bare array with no total or cursor: a short page is the end.
    reportUpstreamPage(params, { hasMore: items.length >= pageSize, pageSize })
    return items.map(transformOrder)
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const data = await this.client(credentials).get<RawQuickbutikOrder[]>(
      '/orders',
      { order_id: id, include_details: true },
    )
    const items = Array.isArray(data) ? data : [data]
    if (items.length === 0) throw new Error(`Quickbutik order not found: ${id}`)
    return transformOrder(items[0]!)
  }

  async createOrder(credentials: Credentials, data: Partial<Order>): Promise<Order> {
    const body = { order: { order_id: 'create', ...untransformOrder(data) } }
    const res = await this.client(credentials).post<RawQuickbutikOrder[]>('/orders', body)
    const items = Array.isArray(res) ? res : [res]
    if (items.length === 0) throw new Error('Quickbutik create order returned no order')
    return transformOrder(items[0]!)
  }

  async updateOrder(
    credentials: Credentials,
    id: string,
    data: Partial<Order>,
  ): Promise<Order> {
    const body = [{ order_id: id, ...untransformOrder(data) }]
    await this.client(credentials).put<unknown>('/orders', body)
    return this.getOrder(credentials, id)
  }

  async cancelOrder(
    credentials: Credentials,
    id: string,
    _data?: { reason?: string },
  ): Promise<Order> {
    const body = [untransformOrderStatus('cancelled')]
    const payload = [{ order_id: id, ...body[0] }]
    await this.client(credentials).put<unknown>('/orders', payload)
    return this.getOrder(credentials, id)
  }
}
