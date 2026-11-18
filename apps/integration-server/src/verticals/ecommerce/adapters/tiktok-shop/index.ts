/**
 * TikTok Shop adapter for the ecommerce vertical.
 *
 * Maps TikTok Shop's seller API to the canonical ecommerce resources. TikTok
 * Shop is a rapidly growing social commerce platform with presence in
 * Southeast Asia (ID, TH, MY, VN, PH, SG) and the United States.
 *
 * Slug convention: the directory name and platform identifier are both `tiktok-shop`.
 *
 * ── UNIQUE AUTH MODEL ──────────────────────────────────────────────────────
 *
 * TikTok Shop uses HMAC-SHA256 **request signing** on EVERY API request,
 * similar to Shopee. The signature is computed from:
 *   app_secret + path + sorted_query_params + body + app_secret
 * using app_secret as the HMAC key. Auth uses OAuth2 for token acquisition
 * and HMAC signing for every subsequent API call. See `client.ts` for the
 * signing interceptor.
 *
 * ── Coverage ─────────────────────────────────────────────────────────────
 *
 * Implemented (25):
 *
 *   Products:     list, get, create, update, delete   (Product API)
 *   Variants:     list, get                           (SKU within Product API)
 *   Inventory:    list, get, set                      (Inventory API)
 *   Orders:       list, get, cancel                   (Order API)
 *   Fulfillments: list, get, create                   (Fulfillment API)
 *   Discounts:    list, get, create, update, delete   (Promotion API)
 *   Locations:    list, get                           (Logistics/Warehouses API)
 *   Refunds:      list, get                           (Return & Refund API)
 *   Transactions: list, get                           (Finance/Payments API)
 *   Webhooks:     verify + parse                      (Push notifications)
 *
 * Omitted (17) — the registry returns HTTP 501 automatically:
 *
 *   Variants mutations (3) — create/update/delete: SKU creation is tied to
 *     product creation with complex sales attribute flows.
 *   Collections (5)    — no seller-curated storefront collection API;
 *     getCategories returns a platform taxonomy, not curated collections.
 *   Customers (5)      — TikTok does not expose buyer profile data to sellers;
 *     CustomerService API only provides conversation/messaging endpoints.
 *   createOrder (1)    — buyers create orders through the app.
 *   updateOrder (1)    — no order update API.
 *   adjustInventory (1) — only absolute set is supported.
 *   updateFulfillment (1), cancelFulfillment (1) — TikTok-managed logistics.
 *
 * ── Resource coverage ──────────────────────────────────────────────
 * Unavailable: collection — no seller-curated storefront collection API; getCategories returns a platform taxonomy, not curated collections
 * Unavailable: customer — TikTok does not expose buyer profile/record data to sellers; CustomerService API only provides conversation/messaging
 */

import {
  connectionScope,
  cursorPagerKey,
  pageByCursor,
  pageByRows,
  pageLocally,
  reportUpstreamPage,
  type Credentials,
  type QueryParams,
} from '@opensteward/shared'
import type { EcommerceAdapter } from '../../adapter/interface'
import type { Product, ProductVariant } from '../../schema/product'
import type { InventoryLevel } from '../../schema/inventory'
import type { Order } from '../../schema/order'
import type { Fulfillment } from '../../schema/fulfillment'
import type { Discount } from '../../schema/discount'
import type { Location } from '../../schema/location'
import type { Refund } from '../../schema/refund'
import type { Transaction } from '../../schema/transaction'
import type { WebhookEvent } from '../../schema/webhook'

import {
  buildAuthUrl,
  exchangeCode as tiktokExchangeCode,
  refreshCredentials as tiktokRefreshCredentials,
} from './auth'
import { TikTokShopClient } from './client'
import {
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  RETURN_PAGE_SIZE,
  INVENTORY_PRODUCT_BATCH,
  PRODUCT_SEARCH_PATH,
  PRODUCT_GET_PATH,
  PRODUCT_CREATE_PATH,
  PRODUCT_UPDATE_PATH,
  PRODUCT_DELETE_PATH,
  ORDER_SEARCH_PATH,
  ORDER_GET_PATH,
  ORDER_CANCEL_PATH,
  FULFILLMENT_SEARCH_PATH,
  FULFILLMENT_SHIP_PATH,
  INVENTORY_SEARCH_PATH,
  INVENTORY_UPDATE_PATH,
  DISCOUNT_SEARCH_PATH,
  DISCOUNT_GET_PATH,
  DISCOUNT_CREATE_PATH,
  DISCOUNT_UPDATE_PATH,
  DISCOUNT_DELETE_PATH,
  WAREHOUSE_LIST_PATH,
  RETURN_SEARCH_PATH,
  FINANCE_PAYMENTS_PATH,
  FINANCE_ORDER_TRANSACTIONS_PATH,
} from './constants'
import {
  transformProduct,
  untransformProduct,
  type RawTikTokProduct,
  type RawTikTokProductListItem,
} from './transform/product'
import { transformVariants } from './transform/variant'
import { transformOrder, type RawTikTokOrder } from './transform/order'
import { transformFulfillment, type RawTikTokPackage } from './transform/fulfillment'
import { transformInventoryLevels, type RawTikTokProductInventory } from './transform/inventory'
import {
  transformDiscount,
  untransformDiscount,
  type RawTikTokActivity,
} from './transform/discount'
import { transformLocation, type RawTikTokWarehouse } from './transform/location'
import { transformRefund, type RawTikTokReturn } from './transform/refund'
import { transformPayment, type RawTikTokPayment } from './transform/transaction'
import { verifyTikTokShopWebhook, parseTikTokShopWebhookEvents } from './webhook'

export interface TikTokShopAdapterConfig {
  /** App key (client id). Optional — may come from credentials. */
  appKey?: string
  /** App secret. Optional — may come from credentials. */
  appSecret?: string
  /** Encrypted shop cipher for API calls. Optional — may come from credentials. */
  shopCipher?: string
  /** Redirect URI for OAuth flow. */
  redirectUri?: string
}

// ── Response envelope shapes ────────────────────────────────────────────────

interface TikTokEnvelope<T = unknown> {
  code?: number
  message?: string
  data?: T
}

interface TikTokProductSearchData {
  products?: RawTikTokProductListItem[]
  total_count?: number
  next_page_token?: string
}

interface TikTokOrderSearchData {
  /** Get Order List returns full order objects, the same shape as Get Order Detail. */
  orders?: RawTikTokOrder[]
  total_count?: number
  next_page_token?: string
}

interface TikTokOrderDetailData {
  orders?: RawTikTokOrder[]
}

interface TikTokFulfillmentData {
  packages?: RawTikTokPackage[]
}

interface TikTokInventorySearchData {
  inventory?: RawTikTokProductInventory[]
}

interface TikTokActivitySearchData {
  activities?: RawTikTokActivity[]
  total_count?: number
  next_page_token?: string
}

interface TikTokMutationData {
  product_id?: string
  activity_id?: string
  [key: string]: unknown
}

interface TikTokWarehouseListData {
  warehouses?: RawTikTokWarehouse[]
}

interface TikTokReturnSearchData {
  /** The documented list key ("| ^return_orders | []object | | List of returns. |"). */
  return_orders?: RawTikTokReturn[]
  /** What this adapter read before; kept as a fallback. */
  returns?: RawTikTokReturn[]
  total_count?: number
  next_page_token?: string
}

interface TikTokPaymentsData {
  payments?: RawTikTokPayment[]
  total_count?: number
  next_page_token?: string
}

/**
 * The `data` of a documented envelope, or a throw when `code` says the call
 * failed ("code | int | 0 | The success or failure status code returned in API
 * response."). An error envelope read as an empty page would tell a pager the
 * collection had ended.
 */
function unwrap<T>(res: TikTokEnvelope<T>, api: string): T | undefined {
  if (typeof res.code === 'number' && res.code !== 0) {
    throw new Error(`TikTok Shop ${api} failed: code ${res.code} ${res.message ?? ''}`.trim())
  }
  return res.data
}

export class TikTokShopAdapter implements EcommerceAdapter {
  readonly platform = 'tiktok-shop'
  readonly version = '0.1.0'

  private configAppKey: string | undefined
  private configAppSecret: string | undefined
  private configShopCipher: string | undefined
  private configRedirectUri: string | undefined

  constructor(config: TikTokShopAdapterConfig = {}) {
    this.configAppKey = config.appKey
    this.configAppSecret = config.appSecret
    this.configShopCipher = config.shopCipher
    this.configRedirectUri = config.redirectUri
  }

  // ── Auth ──────────────────────────────────────────────────────────────────

  getAuthUrl(_state: string): string {
    const appKey = this.configAppKey
    if (!appKey) {
      throw new Error(
        'TikTok Shop getAuthUrl requires appKey — ' +
          'configure it in config.yml under adapters.tiktok-shop.',
      )
    }
    return buildAuthUrl(appKey, this.configRedirectUri ?? '')
  }

  async exchangeCode(code: string, _redirectUri: string): Promise<Credentials> {
    const appKey = this.configAppKey
    const appSecret = this.configAppSecret
    if (!appKey || !appSecret) {
      throw new Error('TikTok Shop exchangeCode requires appKey and appSecret.')
    }
    return tiktokExchangeCode(code, appKey, appSecret)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return tiktokRefreshCredentials(credentials)
  }

  // ── Webhooks ──────────────────────────────────────────────────────────────

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return verifyTikTokShopWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parseTikTokShopWebhookEvents(payload)
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private clientFor(credentials: Credentials): TikTokShopClient {
    const appKey = (credentials.extra?.['appKey'] as string | undefined) ?? this.configAppKey
    const appSecret =
      (credentials.extra?.['appSecret'] as string | undefined) ?? this.configAppSecret
    const shopCipher =
      (credentials.extra?.['shopCipher'] as string | undefined) ?? this.configShopCipher

    if (!appKey || !appSecret) {
      throw new Error(
        'TikTok Shop adapter requires appKey and appSecret — either configure them ' +
          'in config.yml or POST them to /v1/connections with credentials.extra.',
      )
    }

    const merged: Credentials = {
      ...credentials,
      extra: {
        ...credentials.extra,
        appKey,
        appSecret,
        shopCipher: shopCipher ?? '',
      },
    }
    return new TikTokShopClient(merged)
  }

  /**
   * The pager scope for one connection: the shop (its cipher, else the app)
   * plus a fingerprint of this connection's token, never the token itself.
   */
  private pagerScope(credentials: Credentials): string {
    const shop =
      (credentials.extra?.['shopCipher'] as string | undefined) ||
      this.configShopCipher ||
      (credentials.extra?.['appKey'] as string | undefined) ||
      this.configAppKey ||
      ''
    return connectionScope(`tiktok-shop:${shop}`, credentials)
  }

  /**
   * One caller page of a `page_token` endpoint whose `page_size` goes up to
   * {@link MAX_PAGE_SIZE}: page N upstream is page N for the caller. A limit
   * above the maximum is clamped and the size actually sent is reported, so
   * the router and the sync worker judge pages by it. An empty
   * `next_page_token` ends the collection.
   */
  private async pageByToken<T, C = string>(
    params: QueryParams,
    collection: string,
    credentials: Credentials,
    filters: Record<string, unknown>,
    fetch: (
      size: number,
      cursor: C | undefined,
    ) => Promise<{ items: T[]; next: C | undefined; totalCount?: number }>,
  ): Promise<T[]> {
    const asked = Math.max(1, Math.floor(params.limit ?? DEFAULT_PAGE_SIZE))
    const size = Math.min(asked, MAX_PAGE_SIZE)
    const key = cursorPagerKey(this.pagerScope(credentials), collection, {
      ...filters,
      limit: size,
    })
    let totalCount: number | undefined
    const page = await pageByCursor<T, C>(key, params.page, async (cursor) => {
      const res = await fetch(size, cursor)
      totalCount = res.totalCount
      return { items: res.items, next: res.next }
    })
    reportUpstreamPage(params, {
      hasMore: page.hasMore,
      ...(typeof totalCount === 'number' ? { totalCount } : {}),
      ...(params.limit !== undefined && size < params.limit ? { pageSize: size } : {}),
    })
    return page.items
  }

  // ── Products ──────────────────────────────────────────────────────────────

  async listProducts(credentials: Credentials, params: QueryParams): Promise<Product[]> {
    const client = this.clientFor(credentials)

    // Step 1: search for product ids. page_size and page_token are query
    // parameters of Search Products 202309, not body fields.
    const productIds = await this.pageByToken<string>(
      params,
      'products',
      credentials,
      {},
      async (size, cursor) => {
        const searchRes = await client.post<TikTokEnvelope<TikTokProductSearchData>>(
          PRODUCT_SEARCH_PATH,
          {},
          { page_size: size, page_token: cursor },
        )
        return {
          items: (searchRes.data?.products ?? []).map((p) => p.id),
          next: searchRes.data?.next_page_token || undefined,
          totalCount: searchRes.data?.total_count,
        }
      },
    )
    if (productIds.length === 0) return []

    // Step 2: get product details
    const products: Product[] = []
    // TikTok Shop allows fetching individual products by id
    for (const productId of productIds) {
      const detailRes = await client.get<TikTokEnvelope<RawTikTokProduct>>(
        `${PRODUCT_GET_PATH}/${productId}`,
      )
      if (detailRes.data) {
        products.push(transformProduct(detailRes.data))
      }
    }
    return products
  }

  async getProduct(credentials: Credentials, id: string): Promise<Product> {
    const client = this.clientFor(credentials)
    const res = await client.get<TikTokEnvelope<RawTikTokProduct>>(`${PRODUCT_GET_PATH}/${id}`)
    if (!res.data) {
      throw new Error(`TikTok Shop getProduct: no product found for id '${id}'`)
    }
    return transformProduct(res.data)
  }

  async createProduct(credentials: Credentials, data: Partial<Product>): Promise<Product> {
    const client = this.clientFor(credentials)
    const body = untransformProduct(data)
    const res = await client.post<TikTokEnvelope<TikTokMutationData>>(PRODUCT_CREATE_PATH, body)
    if (res.code && res.code !== 0) {
      throw new Error(`TikTok Shop createProduct failed: ${res.message}`)
    }
    const productId = res.data?.product_id
    if (!productId) {
      throw new Error('TikTok Shop createProduct: response did not include product_id')
    }
    return this.getProduct(credentials, productId)
  }

  async updateProduct(
    credentials: Credentials,
    id: string,
    data: Partial<Product>,
  ): Promise<Product> {
    const client = this.clientFor(credentials)
    const body = untransformProduct(data)
    const res = await client.put<TikTokEnvelope<TikTokMutationData>>(
      `${PRODUCT_UPDATE_PATH}/${id}`,
      body,
    )
    if (res.code && res.code !== 0) {
      throw new Error(`TikTok Shop updateProduct failed: ${res.message}`)
    }
    return this.getProduct(credentials, id)
  }

  async deleteProduct(credentials: Credentials, id: string): Promise<void> {
    const client = this.clientFor(credentials)
    const res = await client.delete<TikTokEnvelope<TikTokMutationData>>(
      `${PRODUCT_DELETE_PATH}/${id}`,
    )
    if (res.code && res.code !== 0) {
      throw new Error(`TikTok Shop deleteProduct failed: ${res.message}`)
    }
  }

  // ── Variants (SKUs) ──────────────────────────────────────────────────────

  async listVariants(credentials: Credentials, params: QueryParams): Promise<ProductVariant[]> {
    const productId = (params['productId'] ?? params['product_id']) as string | undefined
    if (!productId) {
      throw new Error('TikTok Shop listVariants requires `productId` in query params.')
    }
    const product = await this.getProduct(credentials, productId)
    const rawProduct = product.metadata as unknown as RawTikTokProduct
    return transformVariants(rawProduct.skus ?? [], productId)
  }

  async getVariant(credentials: Credentials, id: string): Promise<ProductVariant> {
    // Variant id format: `${productId}:${skuId}`
    const [productId, skuId] = id.includes(':') ? id.split(':') : [undefined, id]
    if (!productId) {
      throw new Error(
        'TikTok Shop getVariant: id must be formatted as `productId:skuId` because ' +
          'TikTok Shop requires product_id to look up SKUs.',
      )
    }
    const variants = await this.listVariants(credentials, { productId } as QueryParams)
    const found = variants.find((v) => v.id === skuId)
    if (!found) {
      throw new Error(`TikTok Shop getVariant: no SKU '${skuId}' found on product '${productId}'`)
    }
    return found
  }

  // ── Inventory ─────────────────────────────────────────────────────────────

  /**
   * Inventory Search 202309 (POST /product/202309/inventory/search) is a
   * lookup, not a list: its body takes only `product_ids` ("Max IDs: 100") or
   * `sku_ids` ("Max IDs: 600") and it has no paging. The collection is walked
   * through Search Products 202309 (`page_size` [1-100], `page_token`), and
   * each page's product ids are passed to Inventory Search. One upstream page
   * yields any number of SKU × warehouse rows, so the caller's page is cut
   * from them by rows.
   */
  async listInventoryLevels(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<InventoryLevel[]> {
    const client = this.clientFor(credentials)
    const key = cursorPagerKey(this.pagerScope(credentials), 'inventory', {
      page_size: INVENTORY_PRODUCT_BATCH,
    })
    const page = await pageByRows<InventoryLevel>(
      key,
      params,
      async (cursor) => {
        const search = unwrap(
          await client.post<TikTokEnvelope<TikTokProductSearchData>>(
            PRODUCT_SEARCH_PATH,
            {},
            { page_size: INVENTORY_PRODUCT_BATCH, page_token: cursor },
          ),
          'Search Products',
        )
        const next = search?.next_page_token || undefined
        const productIds = (search?.products ?? []).map((p) => p.id)
        if (productIds.length === 0) return { items: [], next }
        const inv = unwrap(
          await client.post<TikTokEnvelope<TikTokInventorySearchData>>(INVENTORY_SEARCH_PATH, {
            product_ids: productIds,
          }),
          'Inventory Search',
        )
        return { items: (inv?.inventory ?? []).flatMap(transformInventoryLevels), next }
      },
      { defaultLimit: DEFAULT_PAGE_SIZE },
    )
    return page.items
  }

  /** Id `${skuId}:${warehouseId}`, read back by Inventory Search's `sku_ids`. */
  async getInventoryLevel(credentials: Credentials, id: string): Promise<InventoryLevel> {
    const [skuId, warehouseId] = id.split(':')
    if (!skuId || !warehouseId) {
      throw Object.assign(
        new Error(`TikTok Shop inventory level id must be 'skuId:warehouseId', got '${id}'`),
        { statusCode: 400 },
      )
    }
    const client = this.clientFor(credentials)
    const inv = unwrap(
      await client.post<TikTokEnvelope<TikTokInventorySearchData>>(INVENTORY_SEARCH_PATH, {
        sku_ids: [skuId],
      }),
      'Inventory Search',
    )
    const found = (inv?.inventory ?? [])
      .flatMap(transformInventoryLevels)
      .find((l) => l.id === `${skuId}:${warehouseId}`)
    if (!found) {
      throw new Error(
        `TikTok Shop getInventoryLevel: no inventory for SKU '${skuId}' in warehouse '${warehouseId}'`,
      )
    }
    return found
  }

  async setInventoryLevel(
    credentials: Credentials,
    data: { variantId: string; locationId: string; available: number },
  ): Promise<InventoryLevel> {
    const client = this.clientFor(credentials)
    const res = await client.post<TikTokEnvelope<unknown>>(INVENTORY_UPDATE_PATH, {
      sku_id: data.variantId,
      warehouse_id: data.locationId !== 'tiktok-shop-default' ? data.locationId : undefined,
      available_quantity: data.available,
    })
    if (res.code && res.code !== 0) {
      throw new Error(`TikTok Shop setInventoryLevel failed: ${res.message}`)
    }
    return this.getInventoryLevel(credentials, `${data.variantId}:${data.locationId}`)
  }

  // ── Orders ────────────────────────────────────────────────────────────────

  /**
   * Get Order List 202309 returns full order objects, so there is no
   * per-order detail call. Its time filters are optional ("If `create_time_lt`
   * is filled but `create_time_ge` is empty, `create_time_ge` will default to
   * the earliest shop time"), so an unfiltered call lists every order, and
   * `updatedAfter` is sent as the documented `update_time_ge`.
   */
  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const client = this.clientFor(credentials)
    const filters: Record<string, number> = params.updatedAfter
      ? { update_time_ge: Math.floor(params.updatedAfter.getTime() / 1000) }
      : {}
    // page_size and page_token are query parameters; the filters are body fields.
    return this.pageByToken<Order>(params, 'orders', credentials, filters, async (size, cursor) => {
      const res = unwrap(
        await client.post<TikTokEnvelope<TikTokOrderSearchData>>(ORDER_SEARCH_PATH, filters, {
          page_size: size,
          page_token: cursor,
        }),
        'Get Order List',
      )
      return {
        items: (res?.orders ?? []).map(transformOrder),
        next: res?.next_page_token || undefined,
        totalCount: res?.total_count,
      }
    })
  }

  /** Get Order Detail 202309: GET /order/202309/orders with query `ids` ("Max count: 50"). */
  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const client = this.clientFor(credentials)
    const res = unwrap(
      await client.get<TikTokEnvelope<TikTokOrderDetailData>>(ORDER_GET_PATH, { ids: id }),
      'Get Order Detail',
    )
    const order = (res?.orders ?? []).find((o) => o.id === id)
    if (!order) {
      throw new Error(`TikTok Shop getOrder: no order found for id '${id}'`)
    }
    return transformOrder(order)
  }

  async cancelOrder(
    credentials: Credentials,
    id: string,
    data?: { reason?: string },
  ): Promise<Order> {
    const client = this.clientFor(credentials)
    const res = await client.post<TikTokEnvelope<unknown>>(`${ORDER_CANCEL_PATH}/${id}/cancel`, {
      cancel_reason: data?.reason ?? 'Cancelled by seller',
    })
    if (res.code && res.code !== 0) {
      throw new Error(`TikTok Shop cancelOrder failed: ${res.message}`)
    }
    return this.getOrder(credentials, id)
  }

  // ── Fulfillments ──────────────────────────────────────────────────────────

  async listFulfillments(credentials: Credentials, params: QueryParams): Promise<Fulfillment[]> {
    const orderId = (params['orderId'] ?? params['order_id']) as string | undefined
    if (!orderId) {
      throw new Error('TikTok Shop listFulfillments requires `orderId` in query params.')
    }
    const order = await this.getOrder(credentials, orderId)
    const rawOrder = order.metadata as unknown as RawTikTokOrder

    // Try to get package info
    let packages: RawTikTokPackage[] = []
    try {
      const client = this.clientFor(credentials)
      const pkgRes = await client.get<TikTokEnvelope<TikTokFulfillmentData>>(
        `${FULFILLMENT_SEARCH_PATH}/${orderId}/packages`,
      )
      packages = pkgRes.data?.packages ?? []
    } catch {
      // Packages may not be available yet
    }

    if (packages.length === 0) {
      return [transformFulfillment(rawOrder)]
    }
    return packages.map((pkg) => transformFulfillment(rawOrder, pkg))
  }

  async getFulfillment(credentials: Credentials, id: string): Promise<Fulfillment> {
    // Fulfillment id format: `${order_id}:${package_id}`
    const orderId = id.includes(':') ? id.split(':')[0]! : id
    const fulfillments = await this.listFulfillments(credentials, {
      orderId,
    } as QueryParams)
    const found = fulfillments.find((f) => f.id === id)
    if (!found && fulfillments.length > 0) {
      return fulfillments[0]!
    }
    if (!found) {
      throw new Error(`TikTok Shop getFulfillment: no fulfillment for order '${orderId}'`)
    }
    return found
  }

  async createFulfillment(
    credentials: Credentials,
    data: Partial<Fulfillment>,
  ): Promise<Fulfillment> {
    if (!data.orderId) {
      throw new Error('TikTok Shop createFulfillment requires orderId.')
    }
    const client = this.clientFor(credentials)
    const shipBody: Record<string, unknown> = {
      order_id: data.orderId,
    }
    if (data.trackingNumber) shipBody['tracking_number'] = data.trackingNumber
    if (data.carrier) shipBody['shipping_provider_id'] = data.carrier

    // Pass through extra fields from metadata
    const extra = data.metadata?.['_tiktokShipping'] as Record<string, unknown> | undefined
    if (extra) Object.assign(shipBody, extra)

    const res = await client.post<TikTokEnvelope<unknown>>(
      `${FULFILLMENT_SHIP_PATH}/${data.orderId}/shipping_services/confirm`,
      shipBody,
    )
    if (res.code && res.code !== 0) {
      throw new Error(`TikTok Shop createFulfillment failed: ${res.message}`)
    }
    return this.getFulfillment(credentials, `${data.orderId}:shipping`)
  }

  // ── Discounts ─────────────────────────────────────────────────────────────

  async listDiscounts(credentials: Credentials, params: QueryParams): Promise<Discount[]> {
    const client = this.clientFor(credentials)
    // Unlike the other searches, Search Promotion Activities takes page_size
    // and page_token in the BODY: 'Use "" for the first page', and the last
    // page returns an empty next_page_token.
    return this.pageByToken<Discount>(
      params,
      'discounts',
      credentials,
      {},
      async (size, cursor) => {
        const res = await client.post<TikTokEnvelope<TikTokActivitySearchData>>(
          DISCOUNT_SEARCH_PATH,
          { page_size: size, page_token: cursor ?? '' },
        )
        return {
          items: (res.data?.activities ?? []).map(transformDiscount),
          next: res.data?.next_page_token || undefined,
          totalCount: res.data?.total_count,
        }
      },
    )
  }

  async getDiscount(credentials: Credentials, id: string): Promise<Discount> {
    const client = this.clientFor(credentials)
    const res = await client.get<TikTokEnvelope<RawTikTokActivity>>(`${DISCOUNT_GET_PATH}/${id}`)
    if (!res.data) {
      throw new Error(`TikTok Shop getDiscount: no activity found for id '${id}'`)
    }
    return transformDiscount(res.data)
  }

  async createDiscount(credentials: Credentials, data: Partial<Discount>): Promise<Discount> {
    const client = this.clientFor(credentials)
    const body = untransformDiscount(data)
    const res = await client.post<TikTokEnvelope<TikTokMutationData>>(DISCOUNT_CREATE_PATH, body)
    if (res.code && res.code !== 0) {
      throw new Error(`TikTok Shop createDiscount failed: ${res.message}`)
    }
    const activityId = res.data?.activity_id
    if (!activityId) {
      throw new Error('TikTok Shop createDiscount: response did not include activity_id')
    }
    return this.getDiscount(credentials, activityId)
  }

  async updateDiscount(
    credentials: Credentials,
    id: string,
    data: Partial<Discount>,
  ): Promise<Discount> {
    const client = this.clientFor(credentials)
    const body = untransformDiscount(data)
    const res = await client.put<TikTokEnvelope<TikTokMutationData>>(
      `${DISCOUNT_UPDATE_PATH}/${id}`,
      body,
    )
    if (res.code && res.code !== 0) {
      throw new Error(`TikTok Shop updateDiscount failed: ${res.message}`)
    }
    return this.getDiscount(credentials, id)
  }

  async deleteDiscount(credentials: Credentials, id: string): Promise<void> {
    const client = this.clientFor(credentials)
    const res = await client.delete<TikTokEnvelope<unknown>>(`${DISCOUNT_DELETE_PATH}/${id}`)
    if (res.code && res.code !== 0) {
      throw new Error(`TikTok Shop deleteDiscount failed: ${res.message}`)
    }
  }

  // ── Locations (Warehouses) ─────────────────────────────────────────────────

  async listLocations(credentials: Credentials, params: QueryParams): Promise<Location[]> {
    const client = this.clientFor(credentials)
    // Get Warehouse List has no paging: "This API retrieves all warehouse
    // information associated with the seller." Slice the caller's page.
    const res = await client.get<TikTokEnvelope<TikTokWarehouseListData>>(WAREHOUSE_LIST_PATH)
    return pageLocally((res.data?.warehouses ?? []).map(transformLocation), params)
  }

  async getLocation(credentials: Credentials, id: string): Promise<Location> {
    const locations = await this.listLocations(credentials, {} as QueryParams)
    const found = locations.find((l) => l.id === id)
    if (!found) {
      throw new Error(`TikTok Shop getLocation: no warehouse found for id '${id}'`)
    }
    return found
  }

  // ── Refunds (Returns) ─────────────────────────────────────────────────────

  async listRefunds(credentials: Credentials, params: QueryParams): Promise<Refund[]> {
    const client = this.clientFor(credentials)
    // Search Returns 202309 takes page_size only in [10-50], so a caller's
    // page is cut from fixed 50-row upstream pages. page_size and page_token
    // are query parameters.
    const key = cursorPagerKey(this.pagerScope(credentials), 'refunds', {
      page_size: RETURN_PAGE_SIZE,
    })
    const page = await pageByRows<Refund>(
      key,
      params,
      async (cursor) => {
        const res = await client.post<TikTokEnvelope<TikTokReturnSearchData>>(
          RETURN_SEARCH_PATH,
          {},
          { page_size: RETURN_PAGE_SIZE, page_token: cursor },
        )
        // pageByRows counts rows, so it needs the documented list key: under
        // the old `returns` key every page was empty and the walk ran on.
        const rows = res.data?.return_orders ?? res.data?.returns ?? []
        return {
          items: rows.map(transformRefund),
          next: res.data?.next_page_token || undefined,
        }
      },
      { defaultLimit: DEFAULT_PAGE_SIZE },
    )
    return page.items
  }

  async getRefund(credentials: Credentials, id: string): Promise<Refund> {
    // TikTok returns search can filter by return_id; fall back to list + filter
    const refunds = await this.listRefunds(credentials, {} as QueryParams)
    const found = refunds.find((r) => r.id === id)
    if (!found) {
      throw new Error(`TikTok Shop getRefund: no return found for id '${id}'`)
    }
    return found
  }

  // ── Transactions (Finance Payments) ───────────────────────────────────────

  async listTransactions(credentials: Credentials, params: QueryParams): Promise<Transaction[]> {
    const client = this.clientFor(credentials)
    // If orderId is provided, use per-order statement transactions endpoint
    const orderId = (params['orderId'] ?? params['order_id']) as string | undefined
    if (orderId) {
      const res = await client.get<TikTokEnvelope<{ statement_transactions?: RawTikTokPayment[] }>>(
        `${FINANCE_ORDER_TRANSACTIONS_PATH}/${orderId}/statement_transactions`,
      )
      return (res.data?.statement_transactions ?? []).map(transformPayment)
    }
    // Otherwise list all payments from the Finance API, by page_token.
    return this.pageByToken<Transaction>(
      params,
      'payments',
      credentials,
      {},
      async (size, cursor) => {
        const res = await client.get<TikTokEnvelope<TikTokPaymentsData>>(FINANCE_PAYMENTS_PATH, {
          page_size: size,
          page_token: cursor,
        })
        return {
          items: (res.data?.payments ?? []).map(transformPayment),
          next: res.data?.next_page_token || undefined,
          totalCount: res.data?.total_count,
        }
      },
    )
  }

  async getTransaction(credentials: Credentials, id: string): Promise<Transaction> {
    const transactions = await this.listTransactions(credentials, {} as QueryParams)
    const found = transactions.find((t) => t.id === id)
    if (!found) {
      throw new Error(`TikTok Shop getTransaction: no payment found for id '${id}'`)
    }
    return found
  }
}
