/**
 * Faire adapter for the ecommerce vertical.
 *
 * Faire is a B2B wholesale marketplace. The External API v2 is brand-facing:
 * brands read their products (with variants) and the wholesale orders
 * retailers place.
 *
 * Docs: https://developers.faire.com/docs. The page is a Stoplight SPA; the
 * OpenAPI 3.0.3 spec it renders is embedded in
 * https://cdn.faire.com/static/js/784.fd6421f2.chunk.js. Base URL
 * `https://www.faire.com/external-api/v2` (spec `servers[0]`).
 *
 * Resources supported:
 *  - Products (list, get, create, update): GET /products, GET /products/{product_id}
 *  - Variants (list, get): flattened from each product's `variants`. The spec
 *    has no variant list or variant read (only POST /products/{product_id}/variants
 *    and PATCH/DELETE /products/{product_id}/variants/{variant_id}).
 *  - Orders (list, get): GET /orders, GET /orders/{order_id}
 *  - Inventory levels (list): each variant's `available_quantity`
 *
 * ── Resource coverage ──────────────────────────────────────────────────────────
 * Unavailable: collection    — Faire External API v2 has no collection/category concept for brands.
 * Unavailable: customer      — Retailers appear only as retailer_id on orders; no /customers endpoint.
 * Unavailable: discount      — Faire External API v2 does not expose discount management for brands.
 * Unavailable: fulfillment   — Shipments are nested inside orders (order.shipments), not standalone.
 * Unavailable: location      — Faire External API v2 has no location/warehouse endpoint.
 * Unavailable: refund        — Faire handles returns internally; no /refunds endpoint exposed.
 * Unavailable: transaction   — Faire settles payments internally; no /transactions endpoint exposed.
 *
 * Auth: OAuth2 Authorization Code flow. Every request carries
 * `X-FAIRE-APP-CREDENTIALS` (Base64 applicationId:applicationSecret) and
 * `X-FAIRE-OAUTH-ACCESS-TOKEN` (see client.ts).
 *
 * Pagination: GET /products and GET /orders page by `cursor` (see client.ts),
 * `limit` 10-250 for products and 10-50 for orders. Every list goes through
 * `pageByRows`, which cuts the caller's exact page out of those upstream pages.
 */

import type { Credentials, QueryParams } from '@opensteward/shared'
import { connectionScope, cursorPagerKey, pageByRows, pageLocally } from '@opensteward/shared'
import type { EcommerceAdapter } from '../../adapter/interface'
import type { Product, ProductVariant } from '../../schema/product'
import type { InventoryLevel } from '../../schema/inventory'
import type { Order } from '../../schema/order'

import { buildAuthUrl, exchangeCode as faireExchangeCode } from './auth'
import { FaireClient } from './client'
import {
  DEFAULT_PAGE_SIZE,
  DEFAULT_SCOPES,
  MAX_ORDERS_PAGE_SIZE,
  MAX_PRODUCTS_PAGE_SIZE,
  MIN_PAGE_SIZE,
} from './constants'

import {
  transformProduct,
  untransformProduct,
  transformVariant,
  untransformVariant,
  type RawFaireProduct,
  type RawFaireVariant,
} from './transform/product'
import { transformOrder, type RawFaireOrder } from './transform/order'
import { transformInventoryLevel } from './transform/inventory'

export interface FaireAdapterConfig {
  /** The application's `applicationId` from the Faire Developer Portal. */
  clientId: string
  /** The application's `applicationSecret`. */
  clientSecret: string
  redirectUri: string
  scopes?: string[]
  /** Override the API base URL (tests). Defaults to the production server. */
  baseUrl?: string
}

export class FaireAdapter implements EcommerceAdapter {
  readonly platform = 'faire'
  readonly version = '0.1.0'

  private clientId: string
  private clientSecret: string
  private redirectUri: string
  private scopes: string[]
  private baseUrl: string | undefined

  constructor(config: FaireAdapterConfig) {
    this.clientId = config.clientId
    this.clientSecret = config.clientSecret
    this.redirectUri = config.redirectUri
    this.scopes = config.scopes ?? DEFAULT_SCOPES
    this.baseUrl = config.baseUrl
  }

  // ── Auth ──────────────────────────────────────────────────────────────────

  /**
   * A Connect Link scope override (a read-only link's curated scopes) replaces the
   * configured set, so a link never asks for more than its policy allows.
   */
  getAuthUrl(state: string, overrideScopes?: string[]): string {
    return buildAuthUrl(this.clientId, this.redirectUri, this.scopesFor(overrideScopes), state)
  }

  async exchangeCode(code: string, redirectUri: string): Promise<Credentials> {
    return this.exchangeCodeWithScopes(code, redirectUri, undefined)
  }

  /**
   * The token request's `scope` is "A list of the permissions that your
   * application requests. _This list must match the previously provided scope
   * parameter_." The control plane replays the override `getAuthUrl` was
   * handed (undefined when none), so both legs resolve the same list.
   */
  async exchangeCodeWithScopes(
    code: string,
    _redirectUri: string,
    grantedScopes?: string[],
  ): Promise<Credentials> {
    return faireExchangeCode(
      code,
      this.clientId,
      this.clientSecret,
      this.redirectUri,
      this.scopesFor(grantedScopes),
    )
  }

  /** One resolution for both legs, so authorize and exchange cannot disagree. */
  private scopesFor(overrideScopes?: string[]): string[] {
    return overrideScopes?.length ? overrideScopes : this.scopes
  }

  /** The docs describe no refresh grant or token expiry: credentials are returned as they are. */
  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return credentials
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private client(credentials: Credentials): FaireClient {
    return new FaireClient(
      credentials,
      { applicationId: this.clientId, applicationSecret: this.clientSecret },
      this.baseUrl,
    )
  }

  /**
   * The caller's page of rows drawn from a cursor-paged Faire list.
   *
   * The upstream page is the caller's limit clamped to the endpoint's
   * documented 10..max, so a caller page inside that range costs one request;
   * `pageByRows` cuts smaller pages out of a 10-row page and joins larger ones
   * from several. `first` holds the filters, sent on the first request only:
   * later requests carry `{ limit, cursor }`, since the docs forbid the filters
   * alongside a cursor. The walk is keyed by this connection, the collection,
   * the filters and the upstream size.
   */
  private async cursorRows<P, R>(
    credentials: Credentials,
    params: QueryParams,
    list: { path: '/products' | '/orders'; resourceKey: 'products' | 'orders'; max: number },
    collection: string,
    first: Record<string, unknown>,
    toRows: (page: P[]) => R[],
  ): Promise<R[]> {
    const asked =
      typeof params.limit === 'number' && Number.isFinite(params.limit) && params.limit >= 1
        ? Math.floor(params.limit)
        : DEFAULT_PAGE_SIZE
    const limit = Math.min(Math.max(asked, MIN_PAGE_SIZE), list.max)
    const query = { ...first, limit }
    const client = this.client(credentials)
    const { items } = await pageByRows<R, string>(
      cursorPagerKey(connectionScope('faire', credentials), `${list.path}#${collection}`, query),
      params,
      async (cursor) => {
        const res = await client.cursorPage<P>(
          list.path,
          list.resourceKey,
          cursor === undefined ? query : { limit, cursor },
        )
        return { items: toRows(res.items), next: res.next }
      },
      { defaultLimit: DEFAULT_PAGE_SIZE },
    )
    return items
  }

  private static readonly PRODUCTS = {
    path: '/products',
    resourceKey: 'products',
    max: MAX_PRODUCTS_PAGE_SIZE,
  } as const

  private static readonly ORDERS = {
    path: '/orders',
    resourceKey: 'orders',
    max: MAX_ORDERS_PAGE_SIZE,
  } as const

  /** `updated_at_min`: "ISO 8601 timestamp. If specified, only return products that have been modified since." */
  private updatedFilter(params: QueryParams): Record<string, unknown> {
    return params.updatedAfter ? { updated_at_min: params.updatedAfter.toISOString() } : {}
  }

  /** GET /products/{product_id} returns the ExternalProductV2 itself, unwrapped. */
  private async fetchProduct(credentials: Credentials, id: string): Promise<RawFaireProduct> {
    return this.client(credentials).get<RawFaireProduct>(`/products/${encodeURIComponent(id)}`)
  }

  private productFilter(params: QueryParams): string | undefined {
    const productId = params['productId'] ?? params['product_id']
    return productId != null && productId !== '' ? String(productId) : undefined
  }

  // ── Products ──────────────────────────────────────────────────────────────

  async listProducts(credentials: Credentials, params: QueryParams): Promise<Product[]> {
    return this.cursorRows<RawFaireProduct, Product>(
      credentials,
      params,
      FaireAdapter.PRODUCTS,
      'products',
      this.updatedFilter(params),
      (page) => page.map(transformProduct),
    )
  }

  async getProduct(credentials: Credentials, id: string): Promise<Product> {
    return transformProduct(await this.fetchProduct(credentials, id))
  }

  async createProduct(credentials: Credentials, data: Partial<Product>): Promise<Product> {
    const res = await this.client(credentials).post<{ product: RawFaireProduct }>(
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
    const res = await this.client(credentials).patch<{ product: RawFaireProduct }>(
      `/products/${id}`,
      untransformProduct(data),
    )
    return transformProduct(res.product)
  }

  /**
   * Faire External API v2 does not support product deletion.
   * Always throws NotImplemented.
   */
  async deleteProduct(_credentials: Credentials, _id: string): Promise<void> {
    throw new Error('deleteProduct is not supported by the Faire External API v2')
  }

  // ── Variants ──────────────────────────────────────────────────────────────

  /**
   * Variants flattened out of pages of products, in product order. With a
   * product filter, that product's variants from GET /products/{product_id},
   * which holds all of them.
   */
  async listVariants(credentials: Credentials, params: QueryParams): Promise<ProductVariant[]> {
    const productId = this.productFilter(params)
    if (productId) {
      const product = await this.fetchProduct(credentials, productId)
      const variants = (product.variants ?? []).map((v) => transformVariant(v, product.id))
      return pageLocally(variants, params)
    }
    return this.cursorRows<RawFaireProduct, ProductVariant>(
      credentials,
      params,
      FaireAdapter.PRODUCTS,
      'variants',
      {},
      (page) => page.flatMap((p) => (p.variants ?? []).map((v) => transformVariant(v, p.id))),
    )
  }

  /**
   * The spec has no variant read, so a variant is read from its product, and
   * the id names both: `productId:variantId` (e.g. `p_123:po_123`), the
   * canonical ProductVariant.id that listVariants returns.
   */
  async getVariant(credentials: Credentials, id: string): Promise<ProductVariant> {
    const colonIdx = id.indexOf(':')
    if (colonIdx === -1) {
      throw new Error(
        `getVariant requires a composite id in the format "productId:variantId"; ` +
          `received bare id "${id}". Faire has no endpoint that reads a variant on its own.`,
      )
    }
    const productId = id.slice(0, colonIdx)
    const variantId = id.slice(colonIdx + 1)
    const product = await this.fetchProduct(credentials, productId)
    const variant = (product.variants ?? []).find((v) => v.id === variantId)
    if (!variant) {
      throw new Error(`Variant "${variantId}" not found on product "${productId}"`)
    }
    return transformVariant(variant, product.id)
  }

  async updateVariant(
    credentials: Credentials,
    id: string,
    data: Partial<ProductVariant>,
  ): Promise<ProductVariant> {
    // Faire has no standalone option endpoint; require composite id format:
    // `productToken:optionToken`.
    const colonIdx = id.indexOf(':')
    const productId = colonIdx !== -1 ? id.slice(0, colonIdx) : data.productId
    const optionId = colonIdx !== -1 ? id.slice(colonIdx + 1) : id

    if (!productId) {
      throw new Error(
        `updateVariant requires a composite id in the format "productToken:optionToken" ` +
          `or data.productId must be set. Received id "${id}".`,
      )
    }

    const res = await this.client(credentials).patch<{ product_option: RawFaireVariant }>(
      `/products/${productId}/options/${optionId}`,
      untransformVariant(data),
    )
    return transformVariant(res.product_option, productId)
  }

  // ── Orders ────────────────────────────────────────────────────────────────

  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    return this.cursorRows<RawFaireOrder, Order>(
      credentials,
      params,
      FaireAdapter.ORDERS,
      'orders',
      this.updatedFilter(params),
      (page) => page.map(transformOrder),
    )
  }

  /** GET /orders/{order_id} returns the ExternalOrderV2 itself, unwrapped. */
  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const res = await this.client(credentials).get<RawFaireOrder>(
      `/orders/${encodeURIComponent(id)}`,
    )
    return transformOrder(res)
  }

  // ── Inventory ─────────────────────────────────────────────────────────────

  /**
   * One level per variant that has an `available_quantity`, flattened out of
   * pages of products. The /product-inventory reads take explicit variant ids
   * or SKUs and are not lists.
   */
  async listInventoryLevels(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<InventoryLevel[]> {
    const levels = (products: RawFaireProduct[]): InventoryLevel[] =>
      products
        .flatMap((p) => (p.variants ?? []).map((v) => transformInventoryLevel(v, p.id)))
        .filter((l): l is InventoryLevel => l !== undefined)
    const productId = this.productFilter(params)
    if (productId) {
      return pageLocally(levels([await this.fetchProduct(credentials, productId)]), params)
    }
    return this.cursorRows<RawFaireProduct, InventoryLevel>(
      credentials,
      params,
      FaireAdapter.PRODUCTS,
      'inventory-levels',
      {},
      levels,
    )
  }

  async setInventoryLevel(
    credentials: Credentials,
    data: { variantId: string; locationId: string; available: number },
  ): Promise<InventoryLevel> {
    // `variantId` must be in composite format `productToken:optionToken`.
    // Faire has no standalone option endpoint; options are scoped under products.
    const colonIdx = data.variantId.indexOf(':')
    if (colonIdx === -1) {
      throw new Error(
        `setInventoryLevel requires variantId in the format "productToken:optionToken"; ` +
          `received "${data.variantId}". ` +
          `Faire External API v2 has no standalone option endpoint.`,
      )
    }
    const productId = data.variantId.slice(0, colonIdx)
    const optionId = data.variantId.slice(colonIdx + 1)

    const res = await this.client(credentials).patch<{
      product_option: RawFaireVariant
    }>(`/products/${productId}/options/${optionId}`, { available_quantity: data.available })

    const level = transformInventoryLevel(res.product_option, productId)
    if (!level) throw new Error(`Faire returned no available_quantity for ${data.variantId}`)
    return level
  }
}
