/**
 * JOOR adapter for the ecommerce vertical.
 *
 * JOOR is a wholesale fashion platform. It exposes:
 *  - Products (styles) + SKUs (variants)       → listProducts, getProduct,
 *                                                 createProduct, updateProduct,
 *                                                 (listVariants, getVariant refuse: 501,
 *                                                 a SKU has no documented price)
 *  - Collections (linesheets)                  → listCollections, getCollection,
 *                                                 createCollection, updateCollection
 *  - Orders (wholesale purchase orders)        → listOrders, getOrder,
 *                                                 createOrder, updateOrder, cancelOrder
 *
 * Resources NOT supported by JOOR's public API (auto-501 via interface):
 *   deleteProduct, deleteVariant, deleteCollection, locations, inventory,
 *   customers, fulfillments, refunds, transactions, discounts.
 *
 * Auth: JOOR uses a password-grant OAuth2 flow (no browser redirect).
 * Credentials must be provisioned via `obtainToken()` and supplied with
 * `extra.accountId` set to the JOOR Account ID.
 *
 * Docs: https://api-docs.jooraccess.com/docs/overview
 */

// ── Resource coverage ──────────────────────────────────────────────
// Unavailable: discount     — No standalone discount GET endpoint; discounts appear only as nested fields inside connection and order objects in the v2 API.
// Unavailable: fulfillment  — No fulfillment/shipment tracking endpoint in v2 or v4; shipping status is tracked via the order status field only.
// Unavailable: inventory    — Write-only v2 bulk-inventory endpoint (POST/PUT); no GET inventory endpoint exists to read stock levels.
// Unavailable: refund       — JOOR is a wholesale B2B platform; no refund endpoint exists in v2 or v4 APIs.
// Unavailable: transaction  — JOOR Payments is a beta write-only API (CREATE/UPDATE only); no GET transaction/payment endpoint is documented.
// Unverified:  customer     — JOOR v2 GET /connection/{id} returns retailer/buyer data, but uses a different base URL (api.jooraccess.com/v2) and auth scheme than the v4 adapter; cross-version compatibility unconfirmed.
// Unverified:  location     — JOOR exposes "doors" (retail store locations) nested inside v2 connection responses, but no standalone GET /doors or /locations endpoint with a documented response schema was confirmed.

import { pageLocally } from '@opensteward/shared'
import type { Credentials, QueryParams } from '@opensteward/shared'
import type { EcommerceAdapter } from '../../adapter/interface'
import type { Product, ProductVariant } from '../../schema/product'
import type { Collection } from '../../schema/collection'
import type { Order } from '../../schema/order'

import { buildAuthUrl, exchangeCode, refreshToken } from './auth'
import { JoorClient, type JoorListResponse } from './client'
import { DEFAULT_PAGE_SIZE } from './constants'

import {
  transformProduct,
  transformSku,
  untransformProduct,
  untransformSku,
  type RawJoorProduct,
  type RawJoorSku,
} from './transform/product'
import {
  transformCollection,
  untransformCollection,
  type RawJoorCollection,
} from './transform/collection'
import { transformOrder, untransformOrder, type RawJoorOrder } from './transform/order'

/**
 * Why variants are refused: the canonical variant price is required and
 * JOOR documents no readable price for a SKU.
 */
const SKU_HAS_NO_PRICE =
  'the canonical variant requires a price, but GET /v4/skus documents only id, product_id, ' +
  'identifiers, trait_values, external_id and sku_identifier, and v4 documents prices only as ' +
  '"Create prices for your SKUs" (POST /prices/bulk_create), with no read endpoint ' +
  '(https://api-docs.jooraccess.com/reference/get-skus.md, https://api-docs.jooraccess.com/reference/prices.md)'

function notSupported(message: string): Error {
  return Object.assign(new Error(message), { statusCode: 501, code: 'NOT_SUPPORTED' })
}

export interface JoorAdapterConfig {
  /** JOOR client_id (issued by JOOR upon request). */
  clientId: string
  /** JOOR client_secret (issued by JOOR upon request). */
  clientSecret: string
  /**
   * Whether to target the sandbox environment.
   * Defaults to false (production).
   */
  sandbox?: boolean
}

export class JoorAdapter implements EcommerceAdapter {
  readonly platform = 'joor'
  readonly version = '0.1.0'

  private clientId: string
  private clientSecret: string
  private sandbox: boolean

  constructor(config: JoorAdapterConfig) {
    this.clientId = config.clientId
    this.clientSecret = config.clientSecret
    this.sandbox = config.sandbox ?? false
  }

  // ── Auth ──────────────────────────────────────────────────────────────────

  /**
   * Returns an informational URL — JOOR has no browser-based OAuth2 flow.
   * Use `obtainToken()` from `./auth` to provision credentials.
   */
  getAuthUrl(_state: string): string {
    return buildAuthUrl()
  }

  /** Not applicable for JOOR — throws with instructions. */
  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    return exchangeCode()
  }

  /**
   * Refresh the JOOR Bearer token using the stored refresh_token. Falls
   * back to a full password-grant if the refresh token is missing or expired.
   */
  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return refreshToken(credentials)
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private client(credentials: Credentials): JoorClient {
    return new JoorClient(credentials)
  }

  private orderListParams(params: QueryParams): Record<string, unknown> {
    const out: Record<string, unknown> = {
      page_size: params.limit ?? DEFAULT_PAGE_SIZE,
    }
    if (params['page']) out['page'] = params['page']
    if (params.updatedAfter) {
      out['last_modified'] = params.updatedAfter.toISOString().slice(0, 10)
    }
    if (params['status']) out['status'] = params['status']
    if (params['order_ids']) out['order_ids'] = params['order_ids']
    return out
  }

  // ── Products ──────────────────────────────────────────────────────────────

  /**
   * One caller page of the account's products.
   *
   * GET /v4/products documents no paging parameter (its parameter list is
   * filters only, and the response carries no paging metadata; see
   * https://api-docs.jooraccess.com/reference/get-products.md), so one call
   * returns the whole collection — "approx. 4000 products" at most, per the
   * same page — and it is windowed locally. SKUs are then looked up for the
   * served page's products only, so the `product_ids` query stays one page
   * long instead of carrying every product id in the account.
   */
  async listProducts(credentials: Credentials, params: QueryParams): Promise<Product[]> {
    const extraParams: Record<string, unknown> = {}
    if (params['collection_ids']) extraParams['collection_ids'] = params['collection_ids']
    if (params['product_ids']) extraParams['product_ids'] = params['product_ids']

    const res = await this.client(credentials).get<JoorListResponse<RawJoorProduct>>(
      'products',
      extraParams,
    )
    const products = pageLocally(res.data ?? [], params)

    // Optionally fetch SKUs for this page's products to populate variants.
    let skus: RawJoorSku[] = []
    if (products.length > 0) {
      try {
        const productIds = products.map((p) => p.id).join(',')
        const skuRes = await this.client(credentials).get<JoorListResponse<RawJoorSku>>('skus', {
          product_ids: productIds,
        })
        skus = skuRes.data ?? []
      } catch {
        // SKU fetch is best-effort; products are still returned without options.
      }
    }

    // Group SKUs by product_id.
    const skusByProduct = new Map<string, RawJoorSku[]>()
    for (const sku of skus) {
      const pid = sku.product_id ?? ''
      if (!skusByProduct.has(pid)) skusByProduct.set(pid, [])
      skusByProduct.get(pid)!.push(sku)
    }

    return products.map((p) => transformProduct(p, skusByProduct.get(p.id) ?? []))
  }

  async getProduct(credentials: Credentials, id: string): Promise<Product> {
    const res = await this.client(credentials).get<JoorListResponse<RawJoorProduct>>('products', {
      product_ids: id,
    })
    const product = (res.data ?? [])[0]
    if (!product) throw new Error(`JOOR: product ${id} not found`)

    let skus: RawJoorSku[] = []
    try {
      const skuRes = await this.client(credentials).get<JoorListResponse<RawJoorSku>>('skus', {
        product_ids: id,
      })
      skus = skuRes.data ?? []
    } catch {
      // best-effort
    }

    return transformProduct(product, skus)
  }

  async createProduct(credentials: Credentials, data: Partial<Product>): Promise<Product> {
    const res = await this.client(credentials).post<JoorListResponse<RawJoorProduct>>(
      'products/bulk_create',
      [untransformProduct(data)],
    )
    const created = (res.data ?? [])[0]
    if (!created) throw new Error('JOOR: product creation returned no data')
    return transformProduct(created)
  }

  async updateProduct(
    credentials: Credentials,
    id: string,
    data: Partial<Product>,
  ): Promise<Product> {
    const res = await this.client(credentials).post<JoorListResponse<RawJoorProduct>>(
      'products/bulk_update',
      [{ id, ...untransformProduct(data) }],
    )
    const updated = (res.data ?? [])[0]
    if (!updated) throw new Error('JOOR: product update returned no data')
    return transformProduct(updated)
  }

  // ── Variants (SKUs) ───────────────────────────────────────────────────────

  /**
   * Refused before any request. A canonical ProductVariant requires a
   * price, and JOOR documents no way to read one: GET /v4/skus returns
   * id, product_id, identifiers, trait_values, external_id and
   * sku_identifier only (https://api-docs.jooraccess.com/reference/get-skus.md),
   * and the v4 Prices reference documents only "Create prices for your
   * SKUs" (POST /prices/bulk_create). GET /v4/skus also refuses a request
   * without a filter: "At least one `product_id` or `sku_id` needs to be
   * provided to submit the request."
   */
  async listVariants(_credentials: Credentials, _params: QueryParams): Promise<ProductVariant[]> {
    throw notSupported('JOOR cannot list variants: ' + SKU_HAS_NO_PRICE)
  }

  /** Refused for the same reason as listVariants. */
  async getVariant(_credentials: Credentials, _id: string): Promise<ProductVariant> {
    throw notSupported('JOOR cannot read a variant: ' + SKU_HAS_NO_PRICE)
  }

  async updateVariant(
    credentials: Credentials,
    id: string,
    data: Partial<ProductVariant>,
  ): Promise<ProductVariant> {
    // JOOR SKU updates via bulk_update endpoint
    const res = await this.client(credentials).post<JoorListResponse<RawJoorSku>>(
      'skus/bulk_update',
      [{ id, ...untransformSku(data) }],
    )
    const updated = (res.data ?? [])[0]
    if (!updated) throw new Error('JOOR: SKU update returned no data')
    return transformSku(updated)
  }

  // ── Collections (Linesheets) ──────────────────────────────────────────────

  async listCollections(credentials: Credentials, params: QueryParams): Promise<Collection[]> {
    const extraParams: Record<string, unknown> = {}
    if (params['collection_ids']) extraParams['collection_ids'] = params['collection_ids']
    if (params['archived'] !== undefined) extraParams['archived'] = params['archived']

    // GET /v4/collections documents no paging parameter (account, archived,
    // user_id, collection_ids, collection_names only; see
    // https://api-docs.jooraccess.com/reference/get-collections.md): one call
    // returns every collection, windowed here.
    const res = await this.client(credentials).get<JoorListResponse<RawJoorCollection>>(
      'collections',
      extraParams,
    )
    return pageLocally((res.data ?? []).map(transformCollection), params)
  }

  async getCollection(credentials: Credentials, id: string): Promise<Collection> {
    const res = await this.client(credentials).get<JoorListResponse<RawJoorCollection>>(
      'collections',
      { collection_ids: id },
    )
    const collection = (res.data ?? [])[0]
    if (!collection) throw new Error(`JOOR: collection ${id} not found`)
    return transformCollection(collection)
  }

  async createCollection(credentials: Credentials, data: Partial<Collection>): Promise<Collection> {
    const res = await this.client(credentials).post<JoorListResponse<RawJoorCollection>>(
      'collections/bulk_create',
      [untransformCollection(data)],
    )
    const created = (res.data ?? [])[0]
    if (!created) throw new Error('JOOR: collection creation returned no data')
    return transformCollection(created)
  }

  async updateCollection(
    credentials: Credentials,
    id: string,
    data: Partial<Collection>,
  ): Promise<Collection> {
    const res = await this.client(credentials).post<JoorListResponse<RawJoorCollection>>(
      'collections/bulk_update',
      [{ id, ...untransformCollection(data) }],
    )
    const updated = (res.data ?? [])[0]
    if (!updated) throw new Error('JOOR: collection update returned no data')
    return transformCollection(updated)
  }

  // ── Orders ────────────────────────────────────────────────────────────────

  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const res = await this.client(credentials).listWithPage<RawJoorOrder>(
      'orders',
      this.orderListParams(params),
    )
    return res.items.map(transformOrder)
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const res = await this.client(credentials).listWithPage<RawJoorOrder>('orders', {
      order_ids: id,
    })
    const order = res.items[0]
    if (!order) throw new Error(`JOOR: order ${id} not found`)
    return transformOrder(order)
  }

  async createOrder(credentials: Credentials, data: Partial<Order>): Promise<Order> {
    const res = await this.client(credentials).post<JoorListResponse<RawJoorOrder>>(
      'orders/bulk_create',
      [untransformOrder(data)],
    )
    const created = (res.data ?? [])[0]
    if (!created) throw new Error('JOOR: order creation returned no data')
    return transformOrder(created)
  }

  async updateOrder(credentials: Credentials, id: string, data: Partial<Order>): Promise<Order> {
    const res = await this.client(credentials).post<JoorListResponse<RawJoorOrder>>(
      'orders/bulk_update',
      [{ id, ...untransformOrder(data) }],
    )
    const updated = (res.data ?? [])[0]
    if (!updated) throw new Error('JOOR: order update returned no data')
    return transformOrder(updated)
  }

  async cancelOrder(
    credentials: Credentials,
    id: string,
    _data?: { reason?: string },
  ): Promise<Order> {
    const res = await this.client(credentials).post<JoorListResponse<RawJoorOrder>>(
      'orders/bulk_update',
      [{ id, status: 'CANCELLED' }],
    )
    const updated = (res.data ?? [])[0]
    if (!updated) throw new Error('JOOR: order cancel returned no data')
    return transformOrder(updated)
  }
}
