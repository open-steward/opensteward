/**
 * JD.com Open Platform adapter for the ecommerce vertical.
 *
 * Maps JD's seller API to the canonical ecommerce resources. JD.com is
 * China's largest direct-sales retailer and a major marketplace with
 * 500,000+ third-party sellers.
 *
 * Slug convention: the directory name and platform identifier are both `jdcom`.
 *
 * ── Resource coverage ──────────────────────────────────────────────────────
 * Unavailable: collection  — no seller-curated collection API; only platform-level read-only category taxonomy
 * Unavailable: customer    — JD does not expose buyer PII to sellers in bulk; CRM APIs require a customer PIN input
 * Unavailable: location    — JD manages fulfillment centers internally; no seller-facing location API
 * Unavailable: transaction — no financial transaction / settlement API for marketplace sellers
 *
 * ── UNIQUE API MODEL ──────────────────────────────────────────────────────
 *
 * JD uses a **gateway pattern**: all API requests go to a single URL
 * (`https://api.jd.com/routerjson`) with a `method` parameter that
 * selects the endpoint (e.g. `method=jingdong.sku.read`). Parameters
 * are sent as form-urlencoded POST with the business data in
 * `360buy_param_json`.
 *
 * Request signing uses HMAC-MD5: sort params, wrap with appSecret,
 * MD5 hash to uppercase hex.
 *
 * ── DATA LOCALIZATION ──────────────────────────────────────────────────────
 *
 * All product data is in Simplified Chinese. Prices are in CNY.
 * The adapter preserves all raw data in metadata as-is.
 *
 * ── Coverage ─────────────────────────────────────────────────────────────
 *
 * Implemented (26):
 *
 *   Products:     list*, get, create, update, delete  (SKU API)
 *   Variants:     list, get                           (SKU attrs API)
 *   Inventory:    list*, get, set                     (Stock API)
 *   Orders:       list*, get, cancel                  (Order API)
 *   Fulfillments: list, get, create                   (Logistics API)
 *   Refunds:      list, get                           (ASC after-sales API)
 *   Discounts:    list*, get                          (Seller promotion API)
 *   Webhooks:     verify + parse                      (Push notifications)
 *
 *   * Refuses with 501 NOT_SUPPORTED before sending anything: the JOS method it
 *     would call is not in the JOS API catalogue — see {@link retired}.
 *
 * Omitted (16) — the registry returns HTTP 501 automatically:
 *
 *   Variants mutations (3) — create/update/delete: JD manages SKUs at ware level.
 *   Collections (5)    — no direct collection API for sellers; only read-only platform taxonomy.
 *   Locations (2)      — JD manages fulfillment centers internally; no seller location API.
 *   Customers (5)      — JD does not expose buyer PII in bulk; CRM APIs require customer PIN.
 *   Transactions (3)   — no financial transaction / settlement API for marketplace sellers.
 *   createOrder (1)    — buyers create orders.
 *   updateOrder (1)    — no update API for sellers.
 *   adjustInventory (1) — JD only supports absolute stock setting.
 *   updateFulfillment (1), cancelFulfillment (1) — JD-managed logistics.
 *   createRefund (1)   — refunds are initiated by buyers; sellers respond through after-sales.
 *   createDiscount (1), updateDiscount (1), deleteDiscount (1) — promotion mutations handled by JD's promotion centre.
 */

import type { Credentials, QueryParams } from '@opensteward/shared'
import { pageOffset, reportUpstreamPage } from '@opensteward/shared'
import type { EcommerceAdapter } from '../../adapter/interface'
import type { Product, ProductVariant } from '../../schema/product'
import type { InventoryLevel } from '../../schema/inventory'
import type { Order } from '../../schema/order'
import type { Fulfillment } from '../../schema/fulfillment'
import type { Refund } from '../../schema/refund'
import type { Discount } from '../../schema/discount'
import type { WebhookEvent } from '../../schema/webhook'

import {
  buildAuthUrl,
  exchangeCode as jdExchangeCode,
  refreshCredentials as jdRefreshCredentials,
} from './auth'
import { JdClient } from './client'
import {
  DEFAULT_PAGE_SIZE,
  MAX_REFUND_PAGE_SIZE,
  MAX_REFUND_WINDOW_DAYS,
  METHOD_SKU_LIST,
  METHOD_SKU_READ,
  METHOD_SKU_CREATE,
  METHOD_SKU_UPDATE,
  METHOD_SKU_DELETE,
  METHOD_SKU_ATTRS_READ,
  METHOD_STOCK_READ,
  METHOD_STOCK_UPDATE,
  METHOD_ORDER_LIST,
  METHOD_ORDER_READ,
  METHOD_ORDER_CANCEL,
  METHOD_LOGISTICS_TRACE,
  METHOD_LOGISTICS_SHIP,
  METHOD_REFUND_LIST,
  METHOD_PROMOTION_LIST,
  METHOD_PROMOTION_GET,
} from './constants'
import {
  transformProduct,
  untransformProduct,
  type RawJdSku,
} from './transform/product'
import {
  transformVariants,
  type RawJdVariantSku,
} from './transform/variant'
import {
  transformOrder,
  type RawJdOrder,
} from './transform/order'
import {
  transformFulfillment,
  type RawJdLogisticsTrace,
} from './transform/fulfillment'
import {
  transformInventoryLevel,
  type RawJdStockInfo,
} from './transform/inventory'
import {
  transformRefund,
  type RawJdRefundRecord,
  type RawJdRefundPage,
} from './transform/refund'
import {
  transformDiscount,
  type RawJdPromotion,
} from './transform/discount'
import { verifyJdWebhook, parseJdWebhookEvents } from './webhook'

export interface JdAdapterConfig {
  /** App key (client_id). Optional — may come from credentials. */
  appKey?: string
  /** App secret (client_secret). Optional — may come from credentials. */
  appSecret?: string
  /** Redirect URI for OAuth flow. */
  redirectUri?: string
}

// ── Response envelope shapes ────────────────────────────────────────────────

interface JdSkuReadEnvelope {
  jingdong_sku_read_responce?: {
    sku?: RawJdSku
  }
  error_response?: { code?: string; zh_desc?: string }
}

interface JdSkuMutationEnvelope {
  jingdong_sku_create_responce?: { sku_id?: number }
  jingdong_sku_update_responce?: { modified?: string }
  jingdong_sku_delete_responce?: { modified?: string }
  error_response?: { code?: string; zh_desc?: string }
}

interface JdSkuAttrsEnvelope {
  jingdong_sku_attrs_read_responce?: {
    sku_list?: RawJdVariantSku[]
  }
  error_response?: { code?: string; zh_desc?: string }
}

interface JdStockReadEnvelope {
  jingdong_stock_read_responce?: {
    stock_list?: RawJdStockInfo[]
  }
  error_response?: { code?: string; zh_desc?: string }
}

interface JdOrderReadEnvelope {
  jingdong_order_read_responce?: {
    order?: RawJdOrder
  }
  error_response?: { code?: string; zh_desc?: string }
}

interface JdOrderCancelEnvelope {
  jingdong_order_cancel_responce?: {
    success?: boolean
  }
  error_response?: { code?: string; zh_desc?: string }
}

interface JdLogisticsTraceEnvelope {
  jingdong_logistics_trace_get_responce?: RawJdLogisticsTrace
  error_response?: { code?: string; zh_desc?: string }
}

interface JdLogisticsShipEnvelope {
  jingdong_logistics_ship_responce?: {
    success?: boolean
  }
  error_response?: { code?: string; zh_desc?: string }
}

interface JdRefundListEnvelope {
  jingdong_asc_serviceAndRefund_view_responce?: {
    pageResult?: RawJdRefundPage
  }
  error_response?: { code?: string; zh_desc?: string }
}

interface JdPromotionGetEnvelope {
  jingdong_seller_promotion_v2_get_responce?: {
    code?: string
    error_description?: string
    jos_promotion?: RawJdPromotion
  }
  error_response?: { code?: string; zh_desc?: string }
}

/**
 * The refusal for a list whose JOS method is gone, thrown before any request.
 * jingdong.sku.list, jingdong.stock.read, jingdong.order.search and
 * jingdong.seller.promotion.v2.list are in none of the 87 groups of the JOS API
 * catalogue (https://joshome.jd.com/api/index, each group listed by
 * https://joshome.jd.com/api/list?id=<group>), so nothing documents what they
 * take or how they page. The catalogue's current lists
 * (jingdong.sku.read.searchSkuList, jingdong.pop.order.search,
 * jingdong.ware.stock.sku.query) take different parameters and are not wired.
 */
function retired(resource: string, methods: string): Error {
  return Object.assign(
    new Error(
      `JD.com cannot list ${resource}: it would call ${methods}, which the JOS API catalogue ` +
        '(https://joshome.jd.com/api/index) no longer lists, so no request or paging for it is ' +
        'documented.',
    ),
    { statusCode: 501, code: 'NOT_SUPPORTED' },
  )
}

export class JdAdapter implements EcommerceAdapter {
  readonly platform = 'jdcom'
  readonly version = '0.1.0'

  /**
   * listRefunds clamps pageSize to the documented 1-50 (see constants.ts).
   * listDiscounts' endpoint takes 10 and reports that size per call instead.
   */
  readonly capabilities = { maxPageSize: MAX_REFUND_PAGE_SIZE }

  private configAppKey: string | undefined
  private configAppSecret: string | undefined
  private configRedirectUri: string | undefined

  constructor(config: JdAdapterConfig = {}) {
    this.configAppKey = config.appKey
    this.configAppSecret = config.appSecret
    this.configRedirectUri = config.redirectUri
  }

  // ── Auth ──────────────────────────────────────────────────────────────────

  getAuthUrl(state: string): string {
    const appKey = this.configAppKey
    const redirectUri = this.configRedirectUri
    if (!appKey || !redirectUri) {
      throw new Error(
        'JD.com getAuthUrl requires appKey and redirectUri — ' +
          'configure them in config.yml under adapters.jdcom.',
      )
    }
    return buildAuthUrl(appKey, redirectUri, state)
  }

  async exchangeCode(code: string, redirectUri: string): Promise<Credentials> {
    const appKey = this.configAppKey
    const appSecret = this.configAppSecret
    if (!appKey || !appSecret) {
      throw new Error('JD.com exchangeCode requires appKey and appSecret.')
    }
    return jdExchangeCode(code, appKey, appSecret, redirectUri || this.configRedirectUri || '')
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return jdRefreshCredentials(credentials)
  }

  // ── Webhooks ──────────────────────────────────────────────────────────────

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return verifyJdWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parseJdWebhookEvents(payload)
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private clientFor(credentials: Credentials): JdClient {
    const appKey =
      (credentials.extra?.['appKey'] as string | undefined) ?? this.configAppKey
    const appSecret =
      (credentials.extra?.['appSecret'] as string | undefined) ?? this.configAppSecret

    if (!appKey || !appSecret) {
      throw new Error(
        'JD.com adapter requires appKey and appSecret — either configure them ' +
          'in config.yml or POST them to /v1/connections with credentials.extra.',
      )
    }

    const merged: Credentials = {
      ...credentials,
      extra: {
        ...credentials.extra,
        appKey,
        appSecret,
      },
    }
    return new JdClient(merged)
  }

  private throwIfError(envelope: Record<string, unknown>): void {
    const err = envelope['error_response'] as { code?: string; zh_desc?: string } | undefined
    if (err) {
      throw new Error(`JD.com API error [${err.code ?? 'unknown'}]: ${err.zh_desc ?? 'unknown error'}`)
    }
  }

  // ── Products ──────────────────────────────────────────────────────────────

  async listProducts(_credentials: Credentials, _params: QueryParams): Promise<Product[]> {
    throw retired('products', METHOD_SKU_LIST)
  }

  async getProduct(credentials: Credentials, id: string): Promise<Product> {
    const client = this.clientFor(credentials)
    const res = await client.execute<JdSkuReadEnvelope>(METHOD_SKU_READ, {
      sku_id: Number(id),
    })
    this.throwIfError(res as unknown as Record<string, unknown>)

    const sku = res.jingdong_sku_read_responce?.sku
    if (!sku) {
      throw new Error(`JD.com getProduct: no SKU found for id '${id}'`)
    }
    return transformProduct(sku)
  }

  async createProduct(
    credentials: Credentials,
    data: Partial<Product>,
  ): Promise<Product> {
    const client = this.clientFor(credentials)
    const body = untransformProduct(data)
    const res = await client.execute<JdSkuMutationEnvelope>(METHOD_SKU_CREATE, body)
    this.throwIfError(res as unknown as Record<string, unknown>)

    const skuId = res.jingdong_sku_create_responce?.sku_id
    if (!skuId) {
      throw new Error('JD.com createProduct: response did not include sku_id')
    }
    return this.getProduct(credentials, String(skuId))
  }

  async updateProduct(
    credentials: Credentials,
    id: string,
    data: Partial<Product>,
  ): Promise<Product> {
    const client = this.clientFor(credentials)
    const body = {
      sku_id: Number(id),
      ...untransformProduct(data),
    }
    const res = await client.execute<JdSkuMutationEnvelope>(METHOD_SKU_UPDATE, body)
    this.throwIfError(res as unknown as Record<string, unknown>)
    return this.getProduct(credentials, id)
  }

  async deleteProduct(credentials: Credentials, id: string): Promise<void> {
    const client = this.clientFor(credentials)
    const res = await client.execute<JdSkuMutationEnvelope>(METHOD_SKU_DELETE, {
      sku_id: Number(id),
    })
    this.throwIfError(res as unknown as Record<string, unknown>)
  }

  // ── Variants ──────────────────────────────────────────────────────────────

  async listVariants(credentials: Credentials, params: QueryParams): Promise<ProductVariant[]> {
    const wareId = (params['productId'] ?? params['product_id'] ?? params['ware_id']) as
      | string
      | number
      | undefined
    if (!wareId) {
      throw new Error('JD.com listVariants requires `productId` in query params.')
    }
    const client = this.clientFor(credentials)
    const res = await client.execute<JdSkuAttrsEnvelope>(METHOD_SKU_ATTRS_READ, {
      ware_id: Number(wareId),
    })
    this.throwIfError(res as unknown as Record<string, unknown>)

    const skuList = res.jingdong_sku_attrs_read_responce?.sku_list ?? []
    return transformVariants(skuList)
  }

  async getVariant(credentials: Credentials, id: string): Promise<ProductVariant> {
    // Variant id format: `${wareId}:${skuId}`
    const [wareId, skuId] = id.includes(':') ? id.split(':') : [undefined, id]
    if (!wareId) {
      throw new Error(
        'JD.com getVariant: id must be formatted as `wareId:skuId` because ' +
          'JD requires ware_id to look up SKU variants.',
      )
    }
    const variants = await this.listVariants(credentials, { productId: wareId } as QueryParams)
    const found = variants.find((v) => v.id === skuId)
    if (!found) {
      throw new Error(`JD.com getVariant: no SKU '${skuId}' found on ware '${wareId}'`)
    }
    return found
  }

  // ── Inventory ─────────────────────────────────────────────────────────────

  async listInventoryLevels(
    _credentials: Credentials,
    _params: QueryParams,
  ): Promise<InventoryLevel[]> {
    // It listed a page of SKUs (jingdong.sku.list), then read their stock.
    throw retired('inventory levels', `${METHOD_SKU_LIST} and ${METHOD_STOCK_READ}`)
  }

  async getInventoryLevel(
    credentials: Credentials,
    id: string,
  ): Promise<InventoryLevel> {
    const variantId = id.includes(':') ? id.split(':')[0]! : id
    const client = this.clientFor(credentials)
    const res = await client.execute<JdStockReadEnvelope>(METHOD_STOCK_READ, {
      sku_ids: variantId,
    })
    this.throwIfError(res as unknown as Record<string, unknown>)

    const stockList = res.jingdong_stock_read_responce?.stock_list ?? []
    if (stockList.length === 0) {
      throw new Error(`JD.com getInventoryLevel: no stock found for SKU '${variantId}'`)
    }
    return transformInventoryLevel(stockList[0]!)
  }

  async setInventoryLevel(
    credentials: Credentials,
    data: { variantId: string; locationId: string; available: number },
  ): Promise<InventoryLevel> {
    const client = this.clientFor(credentials)
    const res = await client.execute<Record<string, unknown>>(METHOD_STOCK_UPDATE, {
      sku_id: Number(data.variantId),
      stock_num: data.available,
    })
    this.throwIfError(res)
    return this.getInventoryLevel(credentials, `${data.variantId}:${data.locationId}`)
  }

  // ── Orders ────────────────────────────────────────────────────────────────

  async listOrders(_credentials: Credentials, _params: QueryParams): Promise<Order[]> {
    throw retired('orders', METHOD_ORDER_LIST)
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const client = this.clientFor(credentials)
    const res = await client.execute<JdOrderReadEnvelope>(METHOD_ORDER_READ, {
      order_id: id,
      optional_fields: 'item_info_list,consignee_info,vender_remark,order_remark',
    })
    this.throwIfError(res as unknown as Record<string, unknown>)

    const order = res.jingdong_order_read_responce?.order
    if (!order) {
      throw new Error(`JD.com getOrder: no order found for id '${id}'`)
    }
    return transformOrder(order)
  }

  async cancelOrder(
    credentials: Credentials,
    id: string,
    data?: { reason?: string },
  ): Promise<Order> {
    const client = this.clientFor(credentials)
    const res = await client.execute<JdOrderCancelEnvelope>(METHOD_ORDER_CANCEL, {
      order_id: id,
      cancel_reason: data?.reason ?? 'Cancelled by seller',
    })
    this.throwIfError(res as unknown as Record<string, unknown>)
    return this.getOrder(credentials, id)
  }

  // ── Fulfillments ──────────────────────────────────────────────────────────

  async listFulfillments(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<Fulfillment[]> {
    const orderId = (params['orderId'] ?? params['order_id']) as string | undefined
    if (!orderId) {
      throw new Error('JD.com listFulfillments requires `orderId` in query params.')
    }
    const order = await this.getOrder(credentials, orderId)
    const rawOrder = order.metadata as unknown as RawJdOrder

    // Try to get logistics trace
    let trace: RawJdLogisticsTrace | undefined
    try {
      const client = this.clientFor(credentials)
      const traceRes = await client.execute<JdLogisticsTraceEnvelope>(METHOD_LOGISTICS_TRACE, {
        order_id: orderId,
      })
      trace = traceRes.jingdong_logistics_trace_get_responce ?? undefined
    } catch {
      // Trace may not be available yet
    }

    return [transformFulfillment(rawOrder, trace)]
  }

  async getFulfillment(credentials: Credentials, id: string): Promise<Fulfillment> {
    const orderId = id.includes(':') ? id.split(':')[0]! : id
    const fulfillments = await this.listFulfillments(credentials, {
      orderId,
    } as QueryParams)
    if (fulfillments.length === 0) {
      throw new Error(`JD.com getFulfillment: no fulfillment for order '${orderId}'`)
    }
    return fulfillments[0]!
  }

  async createFulfillment(
    credentials: Credentials,
    data: Partial<Fulfillment>,
  ): Promise<Fulfillment> {
    if (!data.orderId) {
      throw new Error('JD.com createFulfillment requires orderId.')
    }
    const client = this.clientFor(credentials)
    const shipBody: Record<string, unknown> = {
      order_id: data.orderId,
    }
    if (data.trackingNumber) shipBody['waybill_code'] = data.trackingNumber
    if (data.carrier) shipBody['logistics_company'] = data.carrier

    // Pass through extra fields from metadata
    const extra = data.metadata?.['_jdShipping'] as Record<string, unknown> | undefined
    if (extra) Object.assign(shipBody, extra)

    const res = await client.execute<JdLogisticsShipEnvelope>(METHOD_LOGISTICS_SHIP, shipBody)
    this.throwIfError(res as unknown as Record<string, unknown>)
    return this.getFulfillment(credentials, `${data.orderId}:shipping`)
  }

  // ── Refunds ───────────────────────────────────────────────────────────────

  async listRefunds(credentials: Credentials, params: QueryParams): Promise<Refund[]> {
    const client = this.clientFor(credentials)
    const pageNumber = pageOffset(params, 1) + 1 // 1-based: "页码(从1开始)"
    const pageSize = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_REFUND_PAGE_SIZE)

    // Begin and end may be at most 7 days apart (error 10310). The end is
    // 23:59:59 today, so the default begin is 00:00:00 six days earlier. An
    // older updatedAfter is sent as given: JD refuses it loudly, where clamping
    // it would silently skip the days in between.
    const now = new Date()
    const applyTimeEnd = now.toISOString().substring(0, 10) + ' 23:59:59'
    const applyTimeBegin = params.updatedAfter
      ? params.updatedAfter.toISOString().substring(0, 10) + ' 00:00:00'
      : new Date(now.getTime() - (MAX_REFUND_WINDOW_DAYS - 1) * 24 * 60 * 60 * 1000)
          .toISOString().substring(0, 10) + ' 00:00:00'

    const res = await client.execute<JdRefundListEnvelope>(METHOD_REFUND_LIST, {
      pageNumber,
      pageSize,
      applyTimeBegin,
      applyTimeEnd,
    })
    this.throwIfError(res as unknown as Record<string, unknown>)

    const pageResult = res.jingdong_asc_serviceAndRefund_view_responce?.pageResult
    // hasMore rather than totalCount: the router derives hasMore from a total
    // as page × ITS limit, which over-counts a page clamped to 50.
    const total = Number(pageResult?.totalCount)
    if (pageResult?.totalCount != null && Number.isFinite(total)) {
      reportUpstreamPage(params, { hasMore: pageNumber * pageSize < total })
    }
    const records: RawJdRefundRecord[] = pageResult?.data ?? []
    return records.map(transformRefund)
  }

  async getRefund(credentials: Credentials, id: string): Promise<Refund> {
    // id is afsRefundId; we look up via orderId if provided as `orderId:refundId`
    const [orderId, refundId] = id.includes(':') ? id.split(':') : [undefined, id]
    const client = this.clientFor(credentials)

    const bizParams: Record<string, unknown> = {
      pageNumber: 1,
      pageSize: 50,
    }
    if (orderId) bizParams['orderId'] = orderId

    const res = await client.execute<JdRefundListEnvelope>(METHOD_REFUND_LIST, bizParams)
    this.throwIfError(res as unknown as Record<string, unknown>)

    const records: RawJdRefundRecord[] =
      res.jingdong_asc_serviceAndRefund_view_responce?.pageResult?.data ?? []
    const found = records.find(
      (r) => String(r.afsRefundId) === refundId || String(r.sameOrderServiceBill?.serviceId) === refundId,
    )
    if (!found) {
      throw new Error(`JD.com getRefund: no refund found for id '${id}'`)
    }
    return transformRefund(found)
  }

  // ── Discounts ─────────────────────────────────────────────────────────────

  async listDiscounts(_credentials: Credentials, _params: QueryParams): Promise<Discount[]> {
    throw retired('discounts', METHOD_PROMOTION_LIST)
  }

  async getDiscount(credentials: Credentials, id: string): Promise<Discount> {
    const client = this.clientFor(credentials)
    const res = await client.execute<JdPromotionGetEnvelope>(METHOD_PROMOTION_GET, {
      promo_id: Number(id),
      promo_type: 1,
    })
    this.throwIfError(res as unknown as Record<string, unknown>)

    const promo = res.jingdong_seller_promotion_v2_get_responce?.jos_promotion
    if (!promo) {
      throw new Error(`JD.com getDiscount: no promotion found for id '${id}'`)
    }
    return transformDiscount(promo)
  }
}
