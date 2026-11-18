/**
 * Shopee Open Platform adapter for the ecommerce vertical.
 *
 * Maps Shopee's seller API to the canonical ecommerce resources. Shopee is
 * a dominant Southeast Asian marketplace (13M+ sellers across SG, MY, ID,
 * TH, VN, PH, TW, BR, MX, CO, CL, PL, ES, FR).
 *
 * Slug convention: the directory name and platform identifier are both `shopee`.
 *
 * ── UNIQUE AUTH MODEL ──────────────────────────────────────────────────────
 *
 * Shopee uses HMAC-SHA256 **request signing** on EVERY API request. This is
 * unique among adapters in this project. The signature is computed from:
 *   partner_id + api_path + timestamp + access_token + shop_id
 * using partner_key as the HMAC secret. Auth params are appended as **query
 * parameters** (not headers). See `client.ts` for the signing interceptor.
 *
 * ── Coverage ─────────────────────────────────────────────────────────────
 *
 * Implemented (35):
 *
 *   Products:      list, get, create, update, delete   (Product API)
 *   Variants:      list, get                           (Model API — tier variations)
 *   Inventory:     list, get, adjust, set              (Stock via Product API)
 *   Collections:   list, get                           (Shop Category API)
 *   Orders:        list, get, cancel                   (Order API)
 *   Fulfillments:  list, get, create                   (Logistics API)
 *   Refunds:       list, get                           (Returns API)
 *   Transactions:  list, get                           (Payment/Wallet API)
 *   Discounts:     list, get, create, update, delete   (Discount API)
 *   Webhooks:      verify + parse                      (Push notifications)
 *
 * Omitted (7) — the registry returns HTTP 501 automatically:
 *
 *   Variants mutations (3) — create/update/delete: tier variations require
 *     complex init_tier_variation flows.
 *   createOrder (1)    — buyers create orders.
 *   updateOrder (1)    — no update API.
 *   updateFulfillment (1), cancelFulfillment (1) — Shopee-managed logistics.
 *
 * ── Resource coverage ──────────────────────────────────────────────────────
 * Unavailable: customer — Shopee does not expose buyer/customer data via seller API.
 * Unavailable: location — Shopee manages fulfilment warehouses internally; no location API for sellers.
 */

import type { Credentials, QueryParams } from '@opensteward/shared'
import {
  connectionScope,
  cursorPagerKey,
  pageByCursor,
  pageOffset,
  reportUpstreamPage,
} from '@opensteward/shared'
import type { EcommerceAdapter } from '../../adapter/interface'
import type { Product, ProductVariant } from '../../schema/product'
import type { Collection } from '../../schema/collection'
import type { InventoryLevel } from '../../schema/inventory'
import type { Order } from '../../schema/order'
import type { Fulfillment } from '../../schema/fulfillment'
import type { Refund } from '../../schema/refund'
import type { Transaction } from '../../schema/transaction'
import type { Discount } from '../../schema/discount'
import type { WebhookEvent } from '../../schema/webhook'

import {
  buildAuthUrl,
  exchangeCode as shopeeExchangeCode,
  refreshCredentials as shopeeRefreshCredentials,
} from './auth'
import { ShopeeClient } from './client'
import {
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  MAX_ITEM_IDS_PER_CALL,
  PRODUCT_LIST_PATH,
  PRODUCT_GET_PATH,
  PRODUCT_ADD_PATH,
  PRODUCT_UPDATE_PATH,
  PRODUCT_DELETE_PATH,
  MODEL_LIST_PATH,
  STOCK_UPDATE_PATH,
  ORDER_LIST_PATH,
  ORDER_DETAIL_PATH,
  ORDER_CANCEL_PATH,
  LOGISTICS_TRACKING_PATH,
  LOGISTICS_SHIP_PATH,
  DISCOUNT_LIST_PATH,
  DISCOUNT_GET_PATH,
  DISCOUNT_ADD_PATH,
  DISCOUNT_UPDATE_PATH,
  DISCOUNT_DELETE_PATH,
  SHOP_CATEGORY_LIST_PATH,
  RETURNS_LIST_PATH,
  RETURNS_DETAIL_PATH,
  WALLET_TRANSACTION_LIST_PATH,
} from './constants'
import {
  transformProduct,
  untransformProduct,
  type RawShopeeItem,
  type RawShopeeItemListItem,
} from './transform/product'
import {
  transformVariants,
  type RawShopeeModelListResponse,
} from './transform/variant'
import {
  transformOrder,
  type RawShopeeOrder,
  type RawShopeeOrderListItem,
} from './transform/order'
import {
  transformFulfillment,
  type RawShopeeTrackingInfo,
} from './transform/fulfillment'
import {
  transformInventoryLevel,
  type RawShopeeInventoryItem,
} from './transform/inventory'
import {
  transformDiscount,
  untransformDiscount,
  type RawShopeeDiscount,
} from './transform/discount'
import {
  transformCollection,
  type RawShopeeShopCategory,
} from './transform/collection'
import {
  transformRefund,
  type RawShopeeReturn,
} from './transform/refund'
import {
  transformTransaction,
  type RawShopeeWalletTransaction,
} from './transform/transaction'
import { verifyShopeeWebhook, parseShopeeWebhookEvents } from './webhook'

export interface ShopeeAdapterConfig {
  /** Partner (app) ID. Optional — may come from credentials. */
  partnerId?: number
  /** Partner secret key. Optional — may come from credentials. */
  partnerKey?: string
  /** Default shop ID. Optional — may come from credentials. */
  shopId?: number
  /** Redirect URI for OAuth flow. */
  redirectUri?: string
}

/**
 * Pass on Shopee's own "is there another page" flag (`has_next_page` on
 * get_item_list, `more` elsewhere). The sync ends on it instead of inferring
 * the end from a short page, and the router publishes it as `meta.hasMore`,
 * which stays right when a limit above 100 was clamped.
 */
function reportMore(params: QueryParams, more: boolean | undefined): void {
  if (typeof more === 'boolean') reportUpstreamPage(params, { hasMore: more })
}

// ── Response envelope shapes ────────────────────────────────────────────────

interface ShopeeItemListEnvelope {
  error?: string
  message?: string
  response?: {
    item?: RawShopeeItemListItem[]
    total_count?: number
    has_next_page?: boolean
    next_offset?: number
  }
}

interface ShopeeItemDetailEnvelope {
  error?: string
  message?: string
  response?: {
    item_list?: RawShopeeItem[]
  }
}

interface ShopeeModelListEnvelope {
  error?: string
  message?: string
  response?: RawShopeeModelListResponse
}

interface ShopeeOrderListEnvelope {
  error?: string
  message?: string
  response?: {
    order_list?: RawShopeeOrderListItem[]
    more?: boolean
    next_cursor?: string
  }
}

/** Position in a get_order_list walk: Shopee's cursor plus the window it belongs to. */
interface OrderListCursor {
  cursor: string
  timeFrom: number
  timeTo: number
}

/** get_order_detail order_sn_list: "limit [1,50]". */
const MAX_ORDER_SNS_PER_CALL = 50

interface ShopeeOrderDetailEnvelope {
  error?: string
  message?: string
  response?: {
    order_list?: RawShopeeOrder[]
  }
}

interface ShopeeTrackingEnvelope {
  error?: string
  message?: string
  response?: RawShopeeTrackingInfo
}

interface ShopeeDiscountListEnvelope {
  error?: string
  message?: string
  response?: {
    discount_list?: RawShopeeDiscount[]
    more?: boolean
  }
}

interface ShopeeDiscountDetailEnvelope {
  error?: string
  message?: string
  response?: RawShopeeDiscount
}

interface ShopeeMutationEnvelope {
  error?: string
  message?: string
  response?: Record<string, unknown>
}

interface ShopeeShopCategoryListEnvelope {
  error?: string
  message?: string
  response?: {
    shop_categorys?: RawShopeeShopCategory[]
    total_count?: number
    more?: boolean
  }
}

interface ShopeeReturnsListEnvelope {
  error?: string
  message?: string
  response?: {
    return?: RawShopeeReturn[]
    more?: boolean
  }
}

interface ShopeeReturnDetailEnvelope {
  error?: string
  message?: string
  response?: RawShopeeReturn
}

interface ShopeeWalletTransactionListEnvelope {
  error?: string
  message?: string
  response?: {
    transaction_list?: RawShopeeWalletTransaction[]
    more?: boolean
  }
}

export class ShopeeAdapter implements EcommerceAdapter {
  readonly platform = 'shopee'
  readonly version = '0.1.0'

  /** Every paged list endpoint takes at most 100 per page (see constants.ts). */
  readonly capabilities = { maxPageSize: MAX_PAGE_SIZE }

  private configPartnerId: number | undefined
  private configPartnerKey: string | undefined
  private configShopId: number | undefined
  private configRedirectUri: string | undefined

  constructor(config: ShopeeAdapterConfig = {}) {
    this.configPartnerId = config.partnerId
    this.configPartnerKey = config.partnerKey
    this.configShopId = config.shopId
    this.configRedirectUri = config.redirectUri
  }

  // ── Auth ──────────────────────────────────────────────────────────────────

  getAuthUrl(_state: string): string {
    const partnerId = this.configPartnerId
    const partnerKey = this.configPartnerKey
    const redirectUri = this.configRedirectUri
    if (!partnerId || !partnerKey || !redirectUri) {
      throw new Error(
        'Shopee getAuthUrl requires partnerId, partnerKey, and redirectUri — ' +
          'configure them in config.yml under adapters.shopee.',
      )
    }
    return buildAuthUrl(partnerId, redirectUri, partnerKey)
  }

  async exchangeCode(code: string, _redirectUri: string): Promise<Credentials> {
    const partnerId = this.configPartnerId
    const partnerKey = this.configPartnerKey
    const shopId = this.configShopId
    if (!partnerId || !partnerKey || !shopId) {
      throw new Error(
        'Shopee exchangeCode requires partnerId, partnerKey, and shopId.',
      )
    }
    return shopeeExchangeCode(code, partnerId, partnerKey, shopId)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return shopeeRefreshCredentials(credentials)
  }

  // ── Webhooks ──────────────────────────────────────────────────────────────

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return verifyShopeeWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parseShopeeWebhookEvents(payload)
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private clientFor(credentials: Credentials): ShopeeClient {
    const partnerId =
      (credentials.extra?.['partnerId'] as number | undefined) ?? this.configPartnerId
    const partnerKey =
      (credentials.extra?.['partnerKey'] as string | undefined) ?? this.configPartnerKey
    const shopId =
      (credentials.extra?.['shopId'] as number | undefined) ?? this.configShopId

    if (!partnerId || !partnerKey || !shopId) {
      throw new Error(
        'Shopee adapter requires partnerId, partnerKey, and shopId — either configure them ' +
          'in config.yml or POST them to /v1/connections with credentials.extra.',
      )
    }

    const merged: Credentials = {
      ...credentials,
      extra: {
        ...credentials.extra,
        partnerId,
        partnerKey,
        shopId,
      },
    }
    return new ShopeeClient(merged)
  }

  private shopIdFor(credentials: Credentials): number {
    const shopId =
      (credentials.extra?.['shopId'] as number | undefined) ?? this.configShopId
    if (!shopId) {
      throw new Error('Shopee adapter requires shopId in credentials.extra.')
    }
    return shopId
  }

  // ── Products ──────────────────────────────────────────────────────────────

  async listProducts(credentials: Credentials, params: QueryParams): Promise<Product[]> {
    const client = this.clientFor(credentials)
    const pageSize = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
    const offset = pageOffset(params, pageSize)

    // Step 1: get item id list
    const listRes = await client.get<ShopeeItemListEnvelope>(PRODUCT_LIST_PATH, {
      offset,
      page_size: pageSize,
      item_status: 'NORMAL',
    })
    // Details can come back shorter than the id page (an item removed between
    // the two calls), so the page's length is no end-of-list signal.
    reportMore(params, listRes.response?.has_next_page)
    const itemIds = (listRes.response?.item ?? []).map((i) => i.item_id)
    if (itemIds.length === 0) return []

    // Step 2: get item details, at most 50 ids per call
    const items: RawShopeeItem[] = []
    for (let i = 0; i < itemIds.length; i += MAX_ITEM_IDS_PER_CALL) {
      const detailRes = await client.get<ShopeeItemDetailEnvelope>(PRODUCT_GET_PATH, {
        item_id_list: itemIds.slice(i, i + MAX_ITEM_IDS_PER_CALL).join(','),
      })
      items.push(...(detailRes.response?.item_list ?? []))
    }
    return items.map(transformProduct)
  }

  async getProduct(credentials: Credentials, id: string): Promise<Product> {
    const client = this.clientFor(credentials)
    const res = await client.get<ShopeeItemDetailEnvelope>(PRODUCT_GET_PATH, {
      item_id_list: id,
    })
    const items = res.response?.item_list ?? []
    if (items.length === 0) {
      throw new Error(`Shopee getProduct: no item found for id '${id}'`)
    }
    return transformProduct(items[0]!)
  }

  async createProduct(
    credentials: Credentials,
    data: Partial<Product>,
  ): Promise<Product> {
    const client = this.clientFor(credentials)
    const body = untransformProduct(data)
    const res = await client.post<ShopeeMutationEnvelope>(PRODUCT_ADD_PATH, body)
    if (res.error && res.error !== '') {
      throw new Error(`Shopee createProduct failed: ${res.error} — ${res.message}`)
    }
    const itemId = res.response?.['item_id'] as number | undefined
    if (!itemId) {
      throw new Error('Shopee createProduct: response did not include item_id')
    }
    return this.getProduct(credentials, String(itemId))
  }

  async updateProduct(
    credentials: Credentials,
    id: string,
    data: Partial<Product>,
  ): Promise<Product> {
    const client = this.clientFor(credentials)
    const body = {
      item_id: Number(id),
      ...untransformProduct(data),
    }
    const res = await client.post<ShopeeMutationEnvelope>(PRODUCT_UPDATE_PATH, body)
    if (res.error && res.error !== '') {
      throw new Error(`Shopee updateProduct failed: ${res.error} — ${res.message}`)
    }
    return this.getProduct(credentials, id)
  }

  async deleteProduct(credentials: Credentials, id: string): Promise<void> {
    const client = this.clientFor(credentials)
    const res = await client.post<ShopeeMutationEnvelope>(PRODUCT_DELETE_PATH, {
      item_id: Number(id),
    })
    if (res.error && res.error !== '') {
      throw new Error(`Shopee deleteProduct failed: ${res.error} — ${res.message}`)
    }
  }

  // ── Variants (Models / Tier Variations) ───────────────────────────────────

  async listVariants(credentials: Credentials, params: QueryParams): Promise<ProductVariant[]> {
    const itemId = (params['productId'] ?? params['product_id'] ?? params['item_id']) as
      | string
      | number
      | undefined
    if (!itemId) {
      throw new Error('Shopee listVariants requires `productId` in query params.')
    }
    const client = this.clientFor(credentials)
    const res = await client.get<ShopeeModelListEnvelope>(MODEL_LIST_PATH, {
      item_id: Number(itemId),
    })
    return transformVariants(res.response ?? {}, Number(itemId))
  }

  async getVariant(credentials: Credentials, id: string): Promise<ProductVariant> {
    // Variant id format: `${modelId}` — we need the item_id to look it up.
    // Callers should include item_id as a composite: `${itemId}:${modelId}`.
    const [itemId, modelId] = id.includes(':') ? id.split(':') : [undefined, id]
    if (!itemId) {
      throw new Error(
        'Shopee getVariant: id must be formatted as `itemId:modelId` because ' +
          'Shopee requires item_id to look up models.',
      )
    }
    const variants = await this.listVariants(credentials, { productId: itemId } as QueryParams)
    const found = variants.find((v) => v.id === modelId)
    if (!found) {
      throw new Error(`Shopee getVariant: no model '${modelId}' found on item '${itemId}'`)
    }
    return found
  }

  // ── Inventory ─────────────────────────────────────────────────────────────

  async listInventoryLevels(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<InventoryLevel[]> {
    // Inventory is derived from product details
    const products = await this.listProducts(credentials, params)
    const levels: InventoryLevel[] = []
    for (const product of products) {
      const raw = product.metadata as unknown as RawShopeeItem
      const inventoryItem: RawShopeeInventoryItem = {
        item_id: raw.item_id,
        item_sku: raw.item_sku,
        stock_info_v2: raw.stock_info_v2 as RawShopeeInventoryItem['stock_info_v2'],
        update_time: raw.update_time,
      }
      levels.push(transformInventoryLevel(inventoryItem))
    }
    return levels
  }

  async getInventoryLevel(
    credentials: Credentials,
    id: string,
  ): Promise<InventoryLevel> {
    // Id format is `${variantId}:${locationId}` — extract the variant/item id
    const variantId = id.includes(':') ? id.split(':')[0]! : id
    const product = await this.getProduct(credentials, variantId)
    const raw = product.metadata as unknown as RawShopeeItem
    const inventoryItem: RawShopeeInventoryItem = {
      item_id: raw.item_id,
      item_sku: raw.item_sku,
      stock_info_v2: raw.stock_info_v2 as RawShopeeInventoryItem['stock_info_v2'],
      update_time: raw.update_time,
    }
    return transformInventoryLevel(inventoryItem)
  }

  async setInventoryLevel(
    credentials: Credentials,
    data: { variantId: string; locationId: string; available: number },
  ): Promise<InventoryLevel> {
    const client = this.clientFor(credentials)
    const res = await client.post<ShopeeMutationEnvelope>(STOCK_UPDATE_PATH, {
      item_id: Number(data.variantId),
      stock_list: [{ model_id: 0, normal_stock: data.available }],
    })
    if (res.error && res.error !== '') {
      throw new Error(`Shopee setInventoryLevel failed: ${res.error} — ${res.message}`)
    }
    return this.getInventoryLevel(credentials, `${data.variantId}:${data.locationId}`)
  }

  async adjustInventoryLevel(
    credentials: Credentials,
    data: { variantId: string; locationId: string; delta: number },
  ): Promise<InventoryLevel> {
    // Shopee only supports absolute stock setting. Fetch current, apply delta, set.
    const current = await this.getInventoryLevel(credentials, `${data.variantId}:${data.locationId}`)
    const newAvailable = Math.max(0, current.available + data.delta)
    return this.setInventoryLevel(credentials, {
      variantId: data.variantId,
      locationId: data.locationId,
      available: newAvailable,
    })
  }

  // ── Orders ────────────────────────────────────────────────────────────────

  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const client = this.clientFor(credentials)
    // get_order_list: "The limit of page_size if between 1 and 100."
    const pageSize = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
    const updatedAfter = params.updatedAfter
      ? Math.floor(params.updatedAfter.getTime() / 1000)
      : undefined

    // Opaque cursor: "If  more is true, you should pass the next_cursor in the
    // next request as cursor. The value of next_cursor will be empty string
    // when more is false." A cursor belongs to the time window it was minted
    // under, and time_to is "now", so page 1 fixes the window and every later
    // page of the walk carries it forward inside the cursor.
    const key = cursorPagerKey(
      connectionScope(String(this.shopIdFor(credentials)), credentials),
      'orders',
      { updatedAfter, limit: pageSize },
    )
    const { items: orderSns, hasMore } = await pageByCursor<string, OrderListCursor>(
      key,
      params.page,
      async (cursor) => {
        const now = Math.floor(Date.now() / 1000)
        const window = cursor ?? {
          cursor: '',
          timeFrom: updatedAfter ?? now - 15 * 24 * 60 * 60, // Default 15-day lookback
          timeTo: now,
        }
        const listRes = await client.get<ShopeeOrderListEnvelope>(ORDER_LIST_PATH, {
          time_range_field: 'create_time',
          time_from: window.timeFrom,
          time_to: window.timeTo,
          page_size: pageSize,
          cursor: window.cursor,
        })
        const res = listRes.response
        const next = res?.more === true && res.next_cursor ? res.next_cursor : null
        return {
          items: (res?.order_list ?? []).map((o) => o.order_sn),
          next: next === null ? null : { ...window, cursor: next },
        }
      },
    )
    reportUpstreamPage(params, { hasMore })
    if (orderSns.length === 0) return []

    // Fetch full details. get_order_detail order_sn_list: "limit [1,50]".
    const orders: RawShopeeOrder[] = []
    for (let i = 0; i < orderSns.length; i += MAX_ORDER_SNS_PER_CALL) {
      const detailRes = await client.get<ShopeeOrderDetailEnvelope>(ORDER_DETAIL_PATH, {
        order_sn_list: orderSns.slice(i, i + MAX_ORDER_SNS_PER_CALL).join(','),
        response_optional_fields: 'item_list,recipient_address,note,buyer_username',
      })
      orders.push(...(detailRes.response?.order_list ?? []))
    }
    return orders.map(transformOrder)
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const client = this.clientFor(credentials)
    const res = await client.get<ShopeeOrderDetailEnvelope>(ORDER_DETAIL_PATH, {
      order_sn_list: id,
      response_optional_fields: 'item_list,recipient_address,note,buyer_username',
    })
    const orders = res.response?.order_list ?? []
    if (orders.length === 0) {
      throw new Error(`Shopee getOrder: no order found for sn '${id}'`)
    }
    return transformOrder(orders[0]!)
  }

  async cancelOrder(
    credentials: Credentials,
    id: string,
    data?: { reason?: string },
  ): Promise<Order> {
    const client = this.clientFor(credentials)
    const res = await client.post<ShopeeMutationEnvelope>(ORDER_CANCEL_PATH, {
      order_sn: id,
      cancel_reason: data?.reason ?? 'Cancelled by seller',
      item_list: [], // Cancel entire order
    })
    if (res.error && res.error !== '') {
      throw new Error(`Shopee cancelOrder failed: ${res.error} — ${res.message}`)
    }
    return this.getOrder(credentials, id)
  }

  // ── Fulfillments ──────────────────────────────────────────────────────────

  async listFulfillments(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<Fulfillment[]> {
    const orderId = (params['orderId'] ?? params['order_id']) as string | undefined
    if (!orderId) {
      throw new Error('Shopee listFulfillments requires `orderId` in query params.')
    }
    const order = await this.getOrder(credentials, orderId)
    const rawOrder = order.metadata as unknown as RawShopeeOrder

    // Try to get tracking info
    let tracking: RawShopeeTrackingInfo | undefined
    try {
      const client = this.clientFor(credentials)
      const trackRes = await client.get<ShopeeTrackingEnvelope>(LOGISTICS_TRACKING_PATH, {
        order_sn: orderId,
      })
      tracking = trackRes.response ?? undefined
    } catch {
      // Tracking may not be available yet
    }

    return [transformFulfillment(rawOrder, tracking)]
  }

  async getFulfillment(credentials: Credentials, id: string): Promise<Fulfillment> {
    // Fulfillment id format: `${order_sn}:shipping`
    const orderSn = id.includes(':') ? id.split(':')[0]! : id
    const fulfillments = await this.listFulfillments(credentials, {
      orderId: orderSn,
    } as QueryParams)
    if (fulfillments.length === 0) {
      throw new Error(`Shopee getFulfillment: no fulfillment for order '${orderSn}'`)
    }
    return fulfillments[0]!
  }

  async createFulfillment(
    credentials: Credentials,
    data: Partial<Fulfillment>,
  ): Promise<Fulfillment> {
    if (!data.orderId) {
      throw new Error('Shopee createFulfillment requires orderId.')
    }
    const client = this.clientFor(credentials)
    const shipBody: Record<string, unknown> = {
      order_sn: data.orderId,
    }
    // Shopee requires pickup or dropoff info; pass through from metadata
    const extra = data.metadata?.['_shopeeShipping'] as Record<string, unknown> | undefined
    if (extra) Object.assign(shipBody, extra)

    const res = await client.post<ShopeeMutationEnvelope>(LOGISTICS_SHIP_PATH, shipBody)
    if (res.error && res.error !== '') {
      throw new Error(`Shopee createFulfillment (ship_order) failed: ${res.error} — ${res.message}`)
    }
    return this.getFulfillment(credentials, `${data.orderId}:shipping`)
  }

  // ── Collections (Shop Categories) ────────────────────────────────────────

  async listCollections(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<Collection[]> {
    const client = this.clientFor(credentials)
    const res = await client.get<ShopeeShopCategoryListEnvelope>(SHOP_CATEGORY_LIST_PATH, {
      page_no: pageOffset(params, 1) + 1, // 1-based
      page_size: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE),
    })
    reportMore(params, res.response?.more)
    return (res.response?.shop_categorys ?? []).map(transformCollection)
  }

  async getCollection(credentials: Credentials, id: string): Promise<Collection> {
    // Shopee has no single-category get endpoint — fetch the list and find the id.
    const client = this.clientFor(credentials)
    let pageNo = 1
    const pageSize = 100
    while (true) {
      const res = await client.get<ShopeeShopCategoryListEnvelope>(SHOP_CATEGORY_LIST_PATH, {
        page_no: pageNo,
        page_size: pageSize,
      })
      const items = res.response?.shop_categorys ?? []
      const found = items.find((c) => String(c.shop_category_id) === id)
      if (found) return transformCollection(found)
      if (!res.response?.more || items.length === 0) break
      pageNo++
    }
    throw new Error(`Shopee getCollection: no shop category found for id '${id}'`)
  }

  // ── Refunds (Returns) ─────────────────────────────────────────────────────

  async listRefunds(credentials: Credentials, params: QueryParams): Promise<Refund[]> {
    const client = this.clientFor(credentials)
    const res = await client.get<ShopeeReturnsListEnvelope>(RETURNS_LIST_PATH, {
      // 0-based: "Default is 0". That it is a page index, not a row offset,
      // rests on third-party evidence (see the request-shape test header).
      page_no: pageOffset(params, 1),
      page_size: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE),
    })
    reportMore(params, res.response?.more)
    return (res.response?.return ?? []).map(transformRefund)
  }

  async getRefund(credentials: Credentials, id: string): Promise<Refund> {
    const client = this.clientFor(credentials)
    const res = await client.get<ShopeeReturnDetailEnvelope>(RETURNS_DETAIL_PATH, {
      return_sn: id,
    })
    if (!res.response) {
      throw new Error(`Shopee getRefund: no return found for return_sn '${id}'`)
    }
    return transformRefund(res.response)
  }

  // ── Transactions (Wallet) ─────────────────────────────────────────────────

  async listTransactions(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<Transaction[]> {
    const client = this.clientFor(credentials)
    const res = await client.get<ShopeeWalletTransactionListEnvelope>(
      WALLET_TRANSACTION_LIST_PATH,
      {
        // Same "Default is 0" text as get_return_list: read as a 0-based page
        // index. UNVERIFIED against a live shop. getTransaction numbers it alike.
        page_no: pageOffset(params, 1),
        page_size: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE),
      },
    )
    reportMore(params, res.response?.more)
    return (res.response?.transaction_list ?? []).map((t) => transformTransaction(t))
  }

  async getTransaction(credentials: Credentials, id: string): Promise<Transaction> {
    // Shopee does not have a single-transaction get endpoint.
    // Fetch recent transactions and search by composite id or withdrawal_id.
    const client = this.clientFor(credentials)
    let pageNo = 0 // 0-based, as in listTransactions
    const pageSize = 100
    while (true) {
      const res = await client.get<ShopeeWalletTransactionListEnvelope>(
        WALLET_TRANSACTION_LIST_PATH,
        { page_no: pageNo, page_size: pageSize },
      )
      const items = res.response?.transaction_list ?? []
      for (const raw of items) {
        const txn = transformTransaction(raw)
        if (txn.id === id) return txn
      }
      if (!res.response?.more || items.length === 0) break
      pageNo++
      if (pageNo >= 10) break // Safety cap: 10 pages
    }
    throw new Error(`Shopee getTransaction: transaction '${id}' not found in recent wallet history`)
  }

  // ── Discounts ─────────────────────────────────────────────────────────────

  async listDiscounts(credentials: Credentials, params: QueryParams): Promise<Discount[]> {
    const client = this.clientFor(credentials)
    const res = await client.get<ShopeeDiscountListEnvelope>(DISCOUNT_LIST_PATH, {
      discount_status: (params['status'] as string | undefined) ?? 'all',
      page_no: pageOffset(params, 1) + 1, // 1-based: "Starting from 1"
      page_size: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE),
    })
    reportMore(params, res.response?.more)
    return (res.response?.discount_list ?? []).map(transformDiscount)
  }

  async getDiscount(credentials: Credentials, id: string): Promise<Discount> {
    const client = this.clientFor(credentials)
    const res = await client.get<ShopeeDiscountDetailEnvelope>(DISCOUNT_GET_PATH, {
      discount_id: Number(id),
    })
    if (!res.response) {
      throw new Error(`Shopee getDiscount: no discount found for id '${id}'`)
    }
    return transformDiscount(res.response)
  }

  async createDiscount(
    credentials: Credentials,
    data: Partial<Discount>,
  ): Promise<Discount> {
    const client = this.clientFor(credentials)
    const body = untransformDiscount(data)
    const res = await client.post<ShopeeMutationEnvelope>(DISCOUNT_ADD_PATH, body)
    if (res.error && res.error !== '') {
      throw new Error(`Shopee createDiscount failed: ${res.error} — ${res.message}`)
    }
    const discountId = res.response?.['discount_id'] as number | undefined
    if (!discountId) {
      throw new Error('Shopee createDiscount: response did not include discount_id')
    }
    return this.getDiscount(credentials, String(discountId))
  }

  async updateDiscount(
    credentials: Credentials,
    id: string,
    data: Partial<Discount>,
  ): Promise<Discount> {
    const client = this.clientFor(credentials)
    const body = {
      discount_id: Number(id),
      ...untransformDiscount(data),
    }
    const res = await client.post<ShopeeMutationEnvelope>(DISCOUNT_UPDATE_PATH, body)
    if (res.error && res.error !== '') {
      throw new Error(`Shopee updateDiscount failed: ${res.error} — ${res.message}`)
    }
    return this.getDiscount(credentials, id)
  }

  async deleteDiscount(credentials: Credentials, id: string): Promise<void> {
    const client = this.clientFor(credentials)
    const res = await client.post<ShopeeMutationEnvelope>(DISCOUNT_DELETE_PATH, {
      discount_id: Number(id),
    })
    if (res.error && res.error !== '') {
      throw new Error(`Shopee deleteDiscount failed: ${res.error} — ${res.message}`)
    }
  }
}
