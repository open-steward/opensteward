import { simpleApiKey } from '@opensteward/shared'
/**
 * Pinduoduo Open Platform adapter for the ecommerce vertical.
 *
 * Maps Pinduoduo's Open Platform API (pdd.* method namespace) to the canonical
 * ecommerce resource interface. Targets Pinduoduo sellers; the same API surface
 * underpins Temu (Pinduoduo's international expansion).
 *
 * All requests POST to https://open-api.pinduoduo.com/api/router using static
 * API key credentials with MD5 signing (no OAuth2 token flow).
 *
 * Slug: `pinduoduo`
 *
 * ── Coverage ──────────────────────────────────────────────────────────────────
 *
 * Implemented (15):
 *
 *   Products:    list, get, create, update             (pdd.goods.list.get, pdd.goods.detail.get,
 *                                                       pdd.goods.commit.create, pdd.goods.commit.update)
 *   Orders:      list, get                              (pdd.order.list.get, pdd.order.information.get)
 *   Customers:   list, get refuse with 501 — no documented buyer API; receiver data is encrypted
 *   Inventory:   list, get, set                          (pdd.goods.sku.stock.query, pdd.goods.sku.stock.update)
 *   Fulfillments: list, get                               (pdd.logistics.package.list.get)
 *   Refunds:     list, get                                (pdd.refund.list.increment.get, pdd.refund.information.get)
 *
 * Omitted (27) — the registry returns HTTP 501 automatically:
 *
 *   Product mutations (1)     — deleteProduct: not supported by PDD Open Platform
 *   Variants (5)              — PDD exposes SKUs through goods endpoints
 *   Collections (5)           — PDD categories are platform-managed
 *   Locations (2)             — PDD manages warehouses internally
 *   Customer mutations (3)    — Buyer data is read-only for sellers
 *   Order mutations (3)       — createOrder, updateOrder: marketplace-controlled;
 *                               cancelOrder: PDD has no seller order-cancel method
 *   Fulfillment mutations (3) — create/update/cancel: handled via logistics API separately
 *   Refund mutations (1)      — createRefund: after-sale refunds are buyer/platform-initiated,
 *                               not seller-created
 *   Transactions (3)          — No financial transaction API exposed to sellers
 *   Discounts (5)             — Promotions API requires separate scopes
 */

import type { Credentials, QueryParams } from '@opensteward/shared'
import type { EcommerceAdapter } from '../../adapter/interface'
import type { Product } from '../../schema/product'
import type { InventoryLevel } from '../../schema/inventory'
import type { Customer } from '../../schema/customer'
import type { Order } from '../../schema/order'
import type { Fulfillment } from '../../schema/fulfillment'
import type { Refund } from '../../schema/refund'

import { PinduoduoClient } from './client'
import {
  PLATFORM_SLUG,
  DEFAULT_PAGE_SIZE,
  METHOD_GOODS_LIST,
  METHOD_GOODS_GET,
  METHOD_GOODS_CREATE,
  METHOD_GOODS_UPDATE,
  METHOD_ORDER_LIST,
  METHOD_ORDER_GET,
  METHOD_SKU_STOCK_QUERY,
  METHOD_SKU_STOCK_UPDATE,
  METHOD_PACKAGE_LIST,
  METHOD_REFUND_LIST,
  METHOD_REFUND_GET,
  REFUND_LIST_WINDOW_SECONDS,
} from './constants'
import { transformProduct, untransformProduct, type RawPddGoods } from './transform/product'
import { transformOrder, type RawPddOrder } from './transform/order'
import {
  transformFulfillment,
  transformFulfillments,
  type RawPddPackage,
} from './transform/fulfillment'
import { transformInventoryLevels, type RawPddSkuStock } from './transform/inventory'
import { transformRefund, type RawPddRefund } from './transform/refund'

// ── Resource coverage ──────────────────────────────────────────────────────────
// Unavailable: collection    — PDD product categories are platform-managed taxonomy nodes; no seller-curated collection API exists.
// Unavailable: transaction   — No financial transaction or settlement API is exposed to sellers via the Open Platform.
//
// discount and location are declared available (backlog, no adapter method yet):
// PDD's marketing API has coupon/promotion list methods (pdd.promotion.*.coupon.list.get,
// pdd.promotion.limited.discount.list.get) and its warehousing API has depot
// list/info methods (pdd.express.depot.list.get, pdd.express.depot.info.get) —
// see metadata.ts.

const NO_CUSTOMER_API =
  'the Open Platform API catalog has no buyer/customer method, and order receiver data is returned encrypted ("加密字段：包括但不限于 收件人的姓名、电话、收货地址等")'

function notSupported(message: string): Error {
  return Object.assign(new Error(message), { statusCode: 501, code: 'NOT_SUPPORTED' })
}

// ── Config ────────────────────────────────────────────────────────────────────

export interface PinduoduoAdapterConfig {
  /**
   * PDD client ID. May also be supplied via credentials.accessToken.
   * Obtain from the Pinduoduo Open Platform seller portal.
   */
  clientId?: string
  /**
   * PDD client secret for MD5 signing.
   * May also be supplied via credentials.extra.clientSecret.
   */
  clientSecret?: string
}

// ── PDD response envelope types ───────────────────────────────────────────────

interface GoodsListResult {
  goods_list?: RawPddGoods[]
  total_count?: number
  [key: string]: unknown
}

interface GoodsGetResult {
  goods_detail?: RawPddGoods
  [key: string]: unknown
}

interface OrderListResult {
  order_list?: RawPddOrder[]
  total_count?: number
  [key: string]: unknown
}

interface OrderGetResult {
  order_info?: RawPddOrder
  [key: string]: unknown
}

interface SkuStockListResult {
  sku_stock_list?: RawPddSkuStock[]
  [key: string]: unknown
}

interface PackageListResult {
  package_list?: RawPddPackage[]
  total_count?: number
  [key: string]: unknown
}

interface RefundListResult {
  refund_list?: RawPddRefund[]
  total_count?: number
  [key: string]: unknown
}

interface RefundGetResult {
  refund_info?: RawPddRefund
  [key: string]: unknown
}

// ── Adapter ───────────────────────────────────────────────────────────────────
const SIMPLE_API_KEY_FORM = simpleApiKey()

export class PinduoduoAdapter implements EcommerceAdapter {
  // Connect Link support — single API-key form.

  credentialFields = SIMPLE_API_KEY_FORM.credentialFields

  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = PLATFORM_SLUG
  readonly version = '0.1.0'

  private configClientId: string | undefined
  private configClientSecret: string | undefined

  constructor(config: PinduoduoAdapterConfig = {}) {
    this.configClientId = config.clientId
    this.configClientSecret = config.clientSecret
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private clientFor(credentials: Credentials): PinduoduoClient {
    // Merge config-level credentials into the connection credentials
    const merged: Credentials = {
      ...credentials,
      accessToken: credentials.accessToken ?? this.configClientId,
      extra: {
        ...credentials.extra,
        ...(this.configClientSecret && !credentials.extra?.['clientSecret']
          ? { clientSecret: this.configClientSecret }
          : {}),
      },
    }
    return new PinduoduoClient(merged)
  }

  // ── Products ───────────────────────────────────────────────────────────────

  async listProducts(credentials: Credentials, params: QueryParams): Promise<Product[]> {
    const client = this.clientFor(credentials)
    const pageSize = params.limit ?? DEFAULT_PAGE_SIZE
    const pageNum = (params['pageNum'] as number | undefined) ?? 1

    const res = await client.call<GoodsListResult>(METHOD_GOODS_LIST, {
      page_size: pageSize,
      page_num: pageNum,
      ...(params['goods_status'] != null ? { goods_status: Number(params['goods_status']) } : {}),
      ...(params['keyword'] ? { keyword: String(params['keyword']) } : {}),
    })
    const result = client.extractResult<GoodsListResult>(res)
    const goodsList = result.goods_list ?? []
    return goodsList.map((g) => transformProduct(g, 'CNY'))
  }

  async getProduct(credentials: Credentials, id: string): Promise<Product> {
    const client = this.clientFor(credentials)
    const res = await client.call<GoodsGetResult>(METHOD_GOODS_GET, {
      goods_id: id,
    })
    const result = client.extractResult<GoodsGetResult>(res)
    if (!result.goods_detail) {
      throw new Error(`PDD getProduct: no goods found for goods_id '${id}'`)
    }
    return transformProduct(result.goods_detail, 'CNY')
  }

  async createProduct(credentials: Credentials, data: Partial<Product>): Promise<Product> {
    const client = this.clientFor(credentials)
    const payload = untransformProduct(data)

    const res = await client.call<{ goods_commit_create_response?: { goods_id?: number } }>(
      METHOD_GOODS_CREATE,
      payload as Record<string, string | number | undefined>,
    )
    const result = client.extractResult<{ goods_commit_create_response?: { goods_id?: number } }>(
      res,
    )
    const goodsId = (result as unknown as Record<string, unknown>)['goods_id']

    if (!goodsId) {
      throw new Error('PDD createProduct: no goods_id returned from create response')
    }
    return this.getProduct(credentials, String(goodsId))
  }

  async updateProduct(
    credentials: Credentials,
    id: string,
    data: Partial<Product>,
  ): Promise<Product> {
    const client = this.clientFor(credentials)
    const payload = untransformProduct({ ...data, id })

    await client.call(METHOD_GOODS_UPDATE, payload as Record<string, string | number | undefined>)
    return this.getProduct(credentials, id)
  }

  // ── Orders ─────────────────────────────────────────────────────────────────

  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const client = this.clientFor(credentials)
    const pageSize = params.limit ?? DEFAULT_PAGE_SIZE
    const pageNum = (params['pageNum'] as number | undefined) ?? 1

    const res = await client.call<OrderListResult>(METHOD_ORDER_LIST, {
      page_size: pageSize,
      page_num: pageNum,
      ...(params['order_status'] != null ? { order_status: Number(params['order_status']) } : {}),
      ...(params.updatedAfter
        ? { start_updated_at: Math.floor(params.updatedAfter.getTime() / 1000) }
        : {}),
    })
    const result = client.extractResult<OrderListResult>(res)
    const orderList = result.order_list ?? []
    return orderList.map((o) => transformOrder(o, 'CNY'))
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const client = this.clientFor(credentials)
    const res = await client.call<OrderGetResult>(METHOD_ORDER_GET, {
      order_sn: id,
    })
    const result = client.extractResult<OrderGetResult>(res)
    if (!result.order_info) {
      throw new Error(`PDD getOrder: no order found for order_sn '${id}'`)
    }
    return transformOrder(result.order_info, 'CNY')
  }

  // PDD does not expose a direct cancel-order API to sellers — cancellations
  // are buyer-initiated or platform-triggered. No cancelOrder method is
  // defined; the router's `!adapter.cancelOrder` guard answers 501 for
  // POST /orders/:id/cancel rather than reporting a fabricated success.

  // ── Customers (refused) ────────────────────────────────────────────────────
  //
  // PDD's public API catalog (POST https://open-api.pinduoduo.com/pop/doc/info/list/byCat,
  // all 28 categories, 292 method ids) has no buyer or customer method. The
  // order FAQ (https://open.pinduoduo.com/application/document/browse?idStr=3155CCB725082A31)
  // says the pdd.order.* receiver fields are encrypted: "加密字段：包括但不限于
  // 收件人的姓名、电话、收货地址等". Projecting customers out of orders would
  // fabricate a resource, so both methods refuse before sending anything.

  async listCustomers(_credentials: Credentials, _params: QueryParams): Promise<Customer[]> {
    throw notSupported(`Pinduoduo cannot list customers: ${NO_CUSTOMER_API}`)
  }

  async getCustomer(_credentials: Credentials, _id: string): Promise<Customer> {
    throw notSupported(`Pinduoduo cannot read customers: ${NO_CUSTOMER_API}`)
  }

  // ── Inventory ──────────────────────────────────────────────────────────────

  async listInventoryLevels(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<InventoryLevel[]> {
    const client = this.clientFor(credentials)

    const res = await client.call<SkuStockListResult>(METHOD_SKU_STOCK_QUERY, {
      ...(params['goods_id'] ? { goods_id: String(params['goods_id']) } : {}),
      ...(params['sku_id_list'] ? { sku_id_list: String(params['sku_id_list']) } : {}),
    })
    const result = client.extractResult<SkuStockListResult>(res)
    const skuStockList = result.sku_stock_list ?? []
    return transformInventoryLevels(skuStockList)
  }

  async getInventoryLevel(credentials: Credentials, id: string): Promise<InventoryLevel> {
    // id = `${sku_id}` or `${sku_id}:${locationId}`
    const skuId = id.includes(':') ? id.split(':')[0]! : id
    const levels = await this.listInventoryLevels(credentials, {
      sku_id_list: skuId,
    } as QueryParams)
    const found = levels.find((l) => l.variantId === skuId || l.id === id)
    if (!found) {
      throw new Error(`PDD getInventoryLevel: no stock found for sku_id '${skuId}'`)
    }
    return found
  }

  async setInventoryLevel(
    credentials: Credentials,
    data: { variantId: string; locationId: string; available: number },
  ): Promise<InventoryLevel> {
    const client = this.clientFor(credentials)
    await client.call(METHOD_SKU_STOCK_UPDATE, {
      sku_id: data.variantId,
      quantity: data.available,
    })
    return this.getInventoryLevel(credentials, data.variantId)
  }

  // ── Fulfillments ───────────────────────────────────────────────────────────

  async listFulfillments(credentials: Credentials, params: QueryParams): Promise<Fulfillment[]> {
    const client = this.clientFor(credentials)
    const pageSize = params.limit ?? DEFAULT_PAGE_SIZE
    const pageNum = (params['pageNum'] as number | undefined) ?? 1

    const res = await client.call<PackageListResult>(METHOD_PACKAGE_LIST, {
      page_size: pageSize,
      page_num: pageNum,
      ...(params['orderId'] ? { order_sn: String(params['orderId']) } : {}),
    })
    const result = client.extractResult<PackageListResult>(res)
    const packageList = result.package_list ?? []
    return transformFulfillments(packageList)
  }

  async getFulfillment(credentials: Credentials, id: string): Promise<Fulfillment> {
    // id = `${order_sn}` or `${order_sn}:${tracking_number}`
    const orderSn = id.includes(':') ? id.split(':')[0]! : id
    const client = this.clientFor(credentials)

    const res = await client.call<PackageListResult>(METHOD_PACKAGE_LIST, {
      order_sn: orderSn,
    })
    const result = client.extractResult<PackageListResult>(res)
    const packageList = result.package_list ?? []
    if (packageList.length === 0) {
      throw new Error(`PDD getFulfillment: no package found for order_sn '${orderSn}'`)
    }

    // If a specific tracking number was encoded in the id, find that package
    const trackingNumber = id.includes(':') ? id.split(':').slice(1).join(':') : undefined
    const raw = trackingNumber
      ? (packageList.find((p) => p.tracking_number === trackingNumber) ?? packageList[0]!)
      : packageList[0]!

    return transformFulfillment(raw)
  }

  // ── Refunds ────────────────────────────────────────────────────────────────
  //
  // `pdd.refund.list.increment.get` is an incremental feed bounded by
  // `start_updated_at`/`end_updated_at`, not a page cursor over full history —
  // see REFUND_LIST_WINDOW_SECONDS in constants.ts for the (unverified)
  // ~30-minute window cap.

  async listRefunds(credentials: Credentials, params: QueryParams): Promise<Refund[]> {
    const client = this.clientFor(credentials)
    const nowSeconds = Math.floor(Date.now() / 1000)
    const startUpdatedAt = params.updatedAfter
      ? Math.floor(params.updatedAfter.getTime() / 1000)
      : nowSeconds - REFUND_LIST_WINDOW_SECONDS
    const endUpdatedAt = Math.min(startUpdatedAt + REFUND_LIST_WINDOW_SECONDS, nowSeconds)

    const res = await client.call<RefundListResult>(METHOD_REFUND_LIST, {
      start_updated_at: startUpdatedAt,
      end_updated_at: endUpdatedAt,
      page_size: params.limit ?? DEFAULT_PAGE_SIZE,
      page_num: (params['pageNum'] as number | undefined) ?? 1,
    })
    const result = client.extractResult<RefundListResult>(res)
    const refundList = result.refund_list ?? []
    return refundList.map((r) => transformRefund(r, 'CNY'))
  }

  async getRefund(credentials: Credentials, id: string): Promise<Refund> {
    const client = this.clientFor(credentials)
    const res = await client.call<RefundGetResult>(METHOD_REFUND_GET, {
      refund_id: id,
    })
    const result = client.extractResult<RefundGetResult>(res)
    if (!result.refund_info) {
      throw new Error(`PDD getRefund: no refund found for refund_id '${id}'`)
    }
    return transformRefund(result.refund_info, 'CNY')
  }

  getAuthUrl(_state: string): string {
    throw new Error('Pinduoduo uses API key auth — no user-facing auth URL.')
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    throw new Error('Pinduoduo uses API key auth — exchangeCode is not applicable.')
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    // Static API key — no expiry, return unchanged.
    return credentials
  }
}
