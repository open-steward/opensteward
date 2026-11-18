/**
 * Tmall / Taobao Open Platform (TOP) adapter for the ecommerce vertical.
 *
 * Maps Tmall/Taobao's TOP API to the canonical ecommerce resource interface.
 * Both Tmall (B2C brand marketplace) and Taobao (C2C marketplace) use the
 * same TOP API surface via https://eco.taobao.com/router/rest.
 *
 * Slug: `tmall` | Platform identifier: `tmall`
 *
 * ── Coverage ──────────────────────────────────────────────────────────────────
 *
 * Implemented (19):
 *
 *   Products:     list, get, update                 (taobao.items.onsale.get, taobao.item.get, taobao.item.update)
 *   Variants:     list, get                          (taobao.item.skus.get, taobao.item.sku.get)
 *   Orders:       list, get, cancel                 (taobao.trades.sold.get, taobao.trade.fullinfo.get, taobao.trade.close)
 *   Customers:    list, get                         (projected from trade buyer info)
 *   Inventory:    set                               (taobao.sku.update; list and get refuse, see below)
 *   Fulfillments: list, get                         (taobao.logistics.orders.get, by page / by tid)
 *   Refunds:      list, get                         (taobao.refunds.receive.get, taobao.refund.get)
 *   Transactions: list, get                         (projected from taobao.trades.sold.get + taobao.trade.amount.get)
 *
 * ── Resource coverage ──────────────────────────────────────────────────────────
 * All 11 canonical resources are available on the platform (see metadata.ts).
 * Backlog (TOP has the resource; not yet implemented here):
 *   collection — platform category taxonomy: taobao.sellercats.list.get / .add / .update
 *   location   — taobao.inventory.warehouse.query (分销API) / taobao.inventory.store.query
 *   discount   — taobao.promotion.coupons.get / taobao.ump.activities.get (separate promotion scopes)
 *
 * Refused with 501 NOT_SUPPORTED before any request:
 *
 *   listInventoryLevels, getInventoryLevel — TOP documents no unscoped seller
 *   inventory list. taobao.inventory.query requires `sc_item_ids` ("后端商品ID
 *   列表，控制到50个", required) and tmall.inventory.query.forstore requires
 *   `param_list` entries each with a `store_code` ("仓库code", required)
 *   (docIds 21613 and 26481 on open.taobao.com).
 *
 * Omitted (28) — the registry returns HTTP 501 automatically:
 *
 *   Product mutations (2)     — createProduct, deleteProduct: not supported by TOP seller API
 *   Variant mutations (3)     — create/update/delete would go through taobao.item.sku.add/update/delete;
 *                                left unimplemented, param schema not verified against a fetched spec
 *   Collections (5)           — backlog, see Resource coverage above
 *   Locations (2)             — backlog, see Resource coverage above
 *   Inventory adjust (1)      — adjustInventoryLevel: only the absolute `set` form is implemented
 *   Customer mutations (3)    — Buyer data is read-only
 *   Order mutations (2)       — createOrder, updateOrder: marketplace-controlled
 *   Fulfillment mutations (3) — create/update/cancel: handled via logistics API separately
 *   Refund creation (1)       — createRefund: TOP does not support programmatic refund initiation
 *   Transaction creation (1)  — createTransaction: read-only financial data
 *   Discounts (5)             — backlog, see Resource coverage above
 */

import {
  connectionScope,
  cursorPagerKey,
  pageByRows,
  reportUpstreamPage,
} from '@opensteward/shared'
import type { Credentials, QueryParams } from '@opensteward/shared'
import type { EcommerceAdapter } from '../../adapter/interface'
import type { Product, ProductVariant } from '../../schema/product'
import type { InventoryLevel } from '../../schema/inventory'
import type { Customer } from '../../schema/customer'
import type { Order } from '../../schema/order'
import type { Fulfillment } from '../../schema/fulfillment'
import type { Refund } from '../../schema/refund'
import type { Transaction } from '../../schema/transaction'

import {
  buildAuthUrl,
  exchangeCode as topExchangeCode,
  refreshCredentials as topRefreshCredentials,
} from './auth'
import { TmallClient } from './client'
import {
  PLATFORM_SLUG,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  METHOD_ITEM_LIST,
  METHOD_ITEM_GET,
  METHOD_ITEM_UPDATE,
  METHOD_TRADES_LIST,
  METHOD_TRADE_GET,
  METHOD_TRADE_CLOSE,
  METHOD_LOGISTICS_LIST,
  METHOD_REFUNDS_LIST,
  METHOD_REFUND_GET,
  METHOD_TRADE_AMOUNT_GET,
  METHOD_ITEM_SKUS_GET,
  METHOD_ITEM_SKU_GET,
  MAX_SKU_PRODUCT_IDS,
  TRADE_FIELDS,
  ITEM_FIELDS,
  REFUND_FIELDS,
  TRADE_AMOUNT_FIELDS,
  SKU_FIELDS,
} from './constants'
import {
  transformProduct,
  untransformProduct,
  transformVariant,
  transformOnsaleItem,
  ONSALE_ITEM_FIELDS,
  type RawTmallItem,
  type RawTmallOnsaleItem,
  type RawTmallSku,
} from './transform/product'
import { transformOrder, type RawTmallTrade } from './transform/order'
import { transformCustomer, extractUniqueCustomers, type RawTmallBuyer } from './transform/customer'
import {
  transformFulfillment,
  parseShippingFulfillmentId,
  SHIPPING_FIELDS,
  type RawTmallShipping,
} from './transform/fulfillment'
import { transformRefund, transformRefunds, type RawTmallRefund } from './transform/refund'
import {
  transformTransaction,
  transformTransactions,
  type RawTmallTradeAmount,
} from './transform/transaction'

// ── Config ────────────────────────────────────────────────────────────────────

export interface TmallAdapterConfig {
  /** TOP application key. May also be supplied via credentials.extra.appKey. */
  appKey?: string
  /** TOP application secret. May also be supplied via credentials.extra.appSecret. */
  appSecret?: string
  /** OAuth2 redirect URI used during code exchange. */
  redirectUri?: string
}

// ── Response envelope types ───────────────────────────────────────────────────

interface ItemListResult {
  items?: { item?: RawTmallOnsaleItem[] }
  total_results?: number
  [key: string]: unknown
}

interface ItemGetResult {
  item?: RawTmallItem
  [key: string]: unknown
}

interface TradesListResult {
  trades?: { trade?: RawTmallTrade[] }
  total_results?: number
  has_next?: boolean
  [key: string]: unknown
}

interface TradeGetResult {
  trade?: RawTmallTrade
  [key: string]: unknown
}

interface LogisticsListResult {
  shippings?: { shipping?: RawTmallShipping[] }
  total_results?: number
  [key: string]: unknown
}

interface RefundListResult {
  refunds?: { refund?: RawTmallRefund[] }
  total_results?: number
  has_next?: boolean
  [key: string]: unknown
}

interface RefundGetResult {
  refund?: RawTmallRefund
  [key: string]: unknown
}

interface TradeAmountResult {
  trade_amount?: RawTmallTradeAmount
  [key: string]: unknown
}

interface ItemSkusListResult {
  skus?: { sku?: RawTmallSku[] }
  [key: string]: unknown
}

interface ItemSkuGetResult {
  sku?: RawTmallSku
  [key: string]: unknown
}

// ── Adapter ───────────────────────────────────────────────────────────────────

/**
 * TOP cannot list inventory levels: it documents no unscoped seller inventory
 * list. Thrown before any request is sent; the router turns the 501 into
 * NOT_SUPPORTED for the caller.
 */
function inventoryNotSupported(): never {
  throw Object.assign(
    new Error(
      'Tmall cannot list inventory levels: TOP documents no unscoped seller inventory list — ' +
        'taobao.inventory.query requires sc_item_ids ("后端商品ID 列表，控制到50个") and ' +
        'tmall.inventory.query.forstore requires param_list entries with a store_code ("仓库code").',
    ),
    { statusCode: 501, code: 'NOT_SUPPORTED' },
  )
}

export class TmallAdapter implements EcommerceAdapter {
  readonly platform = PLATFORM_SLUG
  readonly version = '0.1.0'
  /**
   * The documented page_size maximum of taobao.trades.sold.get and
   * taobao.refunds.receive.get ("最大值:100"); taobao.items.onsale.get allows
   * 200 and taobao.logistics.orders.get documents none, so 100 fits every list.
   */
  readonly capabilities = { maxPageSize: MAX_PAGE_SIZE }

  private configAppKey: string | undefined
  private configAppSecret: string | undefined
  private configRedirectUri: string

  constructor(config: TmallAdapterConfig = {}) {
    this.configAppKey = config.appKey
    this.configAppSecret = config.appSecret
    this.configRedirectUri = config.redirectUri ?? ''
  }

  // ── Auth ───────────────────────────────────────────────────────────────────

  getAuthUrl(state: string): string {
    const appKey = this.configAppKey
    if (!appKey) {
      throw new Error('Tmall adapter: appKey is required to build the auth URL.')
    }
    return buildAuthUrl(appKey, this.configRedirectUri, state)
  }

  async exchangeCode(code: string, redirectUri: string): Promise<Credentials> {
    const appKey = this.configAppKey
    const appSecret = this.configAppSecret
    if (!appKey || !appSecret) {
      throw new Error('Tmall adapter: appKey and appSecret are required for code exchange.')
    }
    return topExchangeCode(code, appKey, appSecret, redirectUri || this.configRedirectUri)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return topRefreshCredentials(credentials)
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private clientFor(credentials: Credentials): TmallClient {
    const appKey = (credentials.extra?.['appKey'] as string | undefined) ?? this.configAppKey
    const appSecret =
      (credentials.extra?.['appSecret'] as string | undefined) ?? this.configAppSecret

    if (!appKey || !appSecret) {
      throw new Error(
        'Tmall adapter is missing appKey/appSecret — configure them in ' +
          'apps/integration-server/config/config.yml under adapters.tmall, or supply them ' +
          'via POST /v1/connections credentials.extra.',
      )
    }

    const merged: Credentials = {
      ...credentials,
      extra: { ...credentials.extra, appKey, appSecret },
    }
    return new TmallClient(merged)
  }

  /**
   * `page_no` / `page_size` for a caller page of a TOP list that is one TOP
   * page per caller page (`taobao.trades.sold.get`, `taobao.refunds.receive.get`:
   * "每页条数。默认值:40;最大值:100"). A limit above 100 is clamped and the
   * size actually sent is reported, so the page is judged at 100 rows.
   */
  private topPage(params: QueryParams): { pageNo: number; pageSize: number } {
    const limit = Math.max(1, Math.floor(params.limit ?? DEFAULT_PAGE_SIZE))
    const pageSize = Math.min(limit, MAX_PAGE_SIZE)
    if (pageSize < limit) reportUpstreamPage(params, { pageSize })
    const page = params.page
    const pageNo =
      typeof page === 'number' && Number.isFinite(page) && page >= 1 ? Math.floor(page) : 1
    return { pageNo, pageSize }
  }

  /**
   * Whether TOP has rows past this page, from `total_results`
   * ("总页数=total_results÷page_size"). TOP answers `has_next` in its place
   * only when the request sets `use_has_next=true`, which this adapter never
   * sends, so `has_next` is not read.
   */
  private hasNextTopPage(
    result: { total_results?: number },
    pageNo: number,
    pageSize: number,
  ): boolean | undefined {
    if (typeof result.total_results === 'number') return pageNo * pageSize < result.total_results
    return undefined
  }

  /** Report the paging facts of one TOP page to the router and sync worker. */
  private reportTopPage(
    params: QueryParams,
    result: { total_results?: number },
    pageNo: number,
    pageSize: number,
  ): void {
    const hasMore = this.hasNextTopPage(result, pageNo, pageSize)
    reportUpstreamPage(params, {
      ...(typeof result.total_results === 'number' ? { totalCount: result.total_results } : {}),
      ...(hasMore !== undefined ? { hasMore } : {}),
    })
  }

  // ── Products ───────────────────────────────────────────────────────────────

  /**
   * The seller's on-sale items, one TOP page per caller page, from
   * taobao.items.onsale.get (获取当前会话用户出售中的商品列表). Items in the
   * warehouse (taobao.items.inventory.get) are not listed. TOP rejects a page
   * past page_no*page_size of 20,000 ("当翻页获取的条数（page_no*page_size）超过2万,
   * 为了保护后台搜索引擎，接口将报错"); that error reaches the caller as is.
   *
   * Pages are asked oldest-listed first. TOP's default is "默认上架时间降序(即最新
   * 上架排在前面)", under which an item listed mid-walk shifts every later page
   * by one row; with `order_by=list_time:asc` ("格式为column:asc/desc ，column
   * 可选值:list_time(上架时间)…") a new listing lands after the rows already served.
   */
  async listProducts(credentials: Credentials, params: QueryParams): Promise<Product[]> {
    const client = this.clientFor(credentials)
    const { pageNo, pageSize } = this.topPage(params)

    const res = await client.call<ItemListResult>(METHOD_ITEM_LIST, {
      fields: ONSALE_ITEM_FIELDS,
      order_by: 'list_time:asc',
      page_size: pageSize,
      page_no: pageNo,
    })
    const result = client.extractResult<ItemListResult>(res)
    this.reportTopPage(params, result, pageNo, pageSize)
    const items = result.items?.item ?? []
    return items.map((item) => transformOnsaleItem(item))
  }

  async getProduct(credentials: Credentials, id: string): Promise<Product> {
    const client = this.clientFor(credentials)
    const res = await client.call<ItemGetResult>(METHOD_ITEM_GET, {
      fields: ITEM_FIELDS,
      num_iid: id,
    })
    const result = client.extractResult<ItemGetResult>(res)
    if (!result.item) {
      throw new Error(`Tmall getProduct: no item found for num_iid '${id}'`)
    }
    return transformProduct(result.item, 'CNY')
  }

  async updateProduct(
    credentials: Credentials,
    id: string,
    data: Partial<Product>,
  ): Promise<Product> {
    const client = this.clientFor(credentials)
    const payload = untransformProduct({ ...data, id })

    await client.call(
      METHOD_ITEM_UPDATE,
      payload as Record<string, string | number | boolean | undefined>,
    )
    // Re-fetch to return the updated product
    return this.getProduct(credentials, id)
  }

  // ── Variants ───────────────────────────────────────────────────────────────
  //
  // TOP has no unscoped variant list: `taobao.item.skus.get` takes `num_iids`
  // (up to 40 product ids) and returns every SKU across them. A variant's
  // canonical `id` is the composite `${num_iid}:${sku_id}` — `taobao.item.sku.get`
  // requires `sku_id` plus one of `num_iid` or `nick` to disambiguate which
  // seller's item the SKU belongs to, so the id must carry the num_iid for the
  // pair to round-trip through getVariant.

  async listVariants(credentials: Credentials, params: QueryParams): Promise<ProductVariant[]> {
    const client = this.clientFor(credentials)
    const productIdsRaw = (params['productId'] ?? params['product_id'] ?? params['num_iids']) as
      string | number | undefined
    if (!productIdsRaw) {
      throw Object.assign(
        new Error(
          'Tmall listVariants: productId is required — taobao.item.skus.get has no unscoped ' +
            'list and takes num_iids (comma-separated product ids, at most 40).',
        ),
        { statusCode: 400 },
      )
    }
    const numIids = String(productIdsRaw)
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
    if (numIids.length > MAX_SKU_PRODUCT_IDS) {
      throw Object.assign(
        new Error(
          `Tmall listVariants: taobao.item.skus.get accepts at most ${MAX_SKU_PRODUCT_IDS} ` +
            `product ids, got ${numIids.length}.`,
        ),
        { statusCode: 400 },
      )
    }

    const res = await client.call<ItemSkusListResult>(METHOD_ITEM_SKUS_GET, {
      fields: SKU_FIELDS,
      num_iids: numIids.join(','),
    })
    const result = client.extractResult<ItemSkusListResult>(res)
    const skus = result.skus?.sku ?? []
    return skus.map((sku) => {
      const productId = String(sku.num_iid ?? numIids[0] ?? '')
      const variant = transformVariant(sku, productId, 'CNY')
      return { ...variant, id: `${productId}:${variant.id}` }
    })
  }

  async getVariant(credentials: Credentials, id: string): Promise<ProductVariant> {
    const [numIid, skuId] = id.includes(':') ? id.split(':') : [undefined, id]
    if (!skuId) {
      throw Object.assign(
        new Error(`Tmall getVariant: invalid variant id '${id}' — expected 'num_iid:sku_id'.`),
        { statusCode: 400 },
      )
    }
    if (!numIid) {
      throw Object.assign(
        new Error(
          `Tmall getVariant: variant id '${id}' has no num_iid — taobao.item.sku.get requires ` +
            "sku_id plus num_iid. Pass the composite id 'num_iid:sku_id' returned by listVariants.",
        ),
        { statusCode: 400 },
      )
    }

    const client = this.clientFor(credentials)
    const res = await client.call<ItemSkuGetResult>(METHOD_ITEM_SKU_GET, {
      fields: SKU_FIELDS,
      sku_id: skuId,
      num_iid: numIid,
    })
    const result = client.extractResult<ItemSkuGetResult>(res)
    if (!result.sku) {
      throw Object.assign(new Error(`Tmall getVariant: no sku found for id '${id}'`), {
        statusCode: 404,
      })
    }
    const variant = transformVariant(result.sku, numIid, 'CNY')
    return { ...variant, id: `${numIid}:${variant.id}` }
  }

  // ── Orders ─────────────────────────────────────────────────────────────────

  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const client = this.clientFor(credentials)
    const { pageNo, pageSize } = this.topPage(params)

    const startCreated =
      params.updatedAfter?.toISOString().replace('T', ' ').substring(0, 19) ??
      (params['start_created'] as string | undefined)

    const res = await client.call<TradesListResult>(METHOD_TRADES_LIST, {
      fields: TRADE_FIELDS,
      page_size: pageSize,
      page_no: pageNo,
      ...(startCreated ? { start_created: startCreated } : {}),
      ...(params['status'] ? { status: String(params['status']) } : {}),
    })
    const result = client.extractResult<TradesListResult>(res)
    this.reportTopPage(params, result, pageNo, pageSize)
    const trades = result.trades?.trade ?? []
    return trades.map((t) => transformOrder(t, 'CNY'))
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const client = this.clientFor(credentials)
    const res = await client.call<TradeGetResult>(METHOD_TRADE_GET, {
      fields: TRADE_FIELDS,
      tid: id,
    })
    const result = client.extractResult<TradeGetResult>(res)
    if (!result.trade) {
      throw new Error(`Tmall getOrder: no trade found for tid '${id}'`)
    }
    return transformOrder(result.trade, 'CNY')
  }

  async cancelOrder(
    credentials: Credentials,
    id: string,
    data?: { reason?: string },
  ): Promise<Order> {
    const client = this.clientFor(credentials)
    await client.call(METHOD_TRADE_CLOSE, {
      tid: id,
      reason: data?.reason ?? 'Cancelled by seller',
    })
    return this.getOrder(credentials, id)
  }

  // ── Customers (projected from trade buyer info) ────────────────────────────

  async listCustomers(credentials: Credentials, params: QueryParams): Promise<Customer[]> {
    // Buyers are de-duplicated out of pages of trades, so one TOP page is not
    // one caller page: walk trade pages of the documented maximum by page_no
    // and cut exactly the caller's rows. De-duplication is per TOP page, so a
    // buyer whose trades span two TOP pages is served once per page.
    const client = this.clientFor(credentials)
    const account = `tmall:${
      (credentials.extra?.['userId'] as string | undefined) ??
      (credentials.extra?.['appKey'] as string | undefined) ??
      this.configAppKey ??
      ''
    }`
    const key = cursorPagerKey(connectionScope(account, credentials), 'customers', {
      limit: MAX_PAGE_SIZE,
    })
    const res = await pageByRows<Customer, number>(key, params, async (cursor) => {
      const pageNo = cursor ?? 1
      const raw = await client.call<TradesListResult>(METHOD_TRADES_LIST, {
        fields: TRADE_FIELDS,
        page_size: MAX_PAGE_SIZE,
        page_no: pageNo,
      })
      const result = client.extractResult<TradesListResult>(raw)
      const trades = (result.trades?.trade ?? []) as RawTmallBuyer[]
      const more =
        this.hasNextTopPage(result, pageNo, MAX_PAGE_SIZE) ?? trades.length >= MAX_PAGE_SIZE
      return { items: extractUniqueCustomers(trades), next: more ? pageNo + 1 : null }
    })
    return res.items
  }

  async getCustomer(credentials: Credentials, id: string): Promise<Customer> {
    // id = buyer_nick. Search recent trades for a matching buyer.
    const client = this.clientFor(credentials)
    const res = await client.call<TradesListResult>(METHOD_TRADES_LIST, {
      fields: TRADE_FIELDS,
      page_size: 50,
      page_no: 1,
      buyer_nick: id,
    })
    const result = client.extractResult<TradesListResult>(res)
    const trades = result.trades?.trade ?? []
    if (trades.length === 0) {
      throw new Error(`Tmall getCustomer: no trade found for buyer_nick '${id}'`)
    }
    return transformCustomer(trades[0] as unknown as RawTmallBuyer)
  }

  // ── Inventory ──────────────────────────────────────────────────────────────

  async listInventoryLevels(
    _credentials: Credentials,
    _params: QueryParams,
  ): Promise<InventoryLevel[]> {
    return inventoryNotSupported()
  }

  async getInventoryLevel(_credentials: Credentials, _id: string): Promise<InventoryLevel> {
    return inventoryNotSupported()
  }

  async setInventoryLevel(
    credentials: Credentials,
    data: { variantId: string; locationId: string; available: number },
  ): Promise<InventoryLevel> {
    const client = this.clientFor(credentials)
    // TOP uses taobao.sku.update to set quantity
    await client.call('taobao.sku.update', {
      sku_id: data.variantId,
      quantity: data.available,
    })
    return this.getInventoryLevel(credentials, data.variantId)
  }

  // ── Fulfillments ───────────────────────────────────────────────────────────

  async listFulfillments(credentials: Credentials, params: QueryParams): Promise<Fulfillment[]> {
    // One logistics order per row, one TOP page per caller page
    // (taobao.logistics.orders.get, 批量查询物流订单).
    const client = this.clientFor(credentials)
    const { pageNo, pageSize } = this.topPage(params)

    const res = await client.call<LogisticsListResult>(METHOD_LOGISTICS_LIST, {
      fields: SHIPPING_FIELDS,
      page_size: pageSize,
      page_no: pageNo,
    })
    const result = client.extractResult<LogisticsListResult>(res)
    this.reportTopPage(params, result, pageNo, pageSize)
    const shippings = result.shippings?.shipping ?? []
    return shippings.map((s) => transformFulfillment(s))
  }

  /**
   * id = `${tid}:${order_code}`, as listFulfillments returns it. TOP documents
   * no read of one logistics order by its code: taobao.logistics.orders.get
   * filtered by `tid` answers every logistics order of that trade ("若传入tid：
   * 非拆单场景，仅会返回一条物流订单信息；拆单场景，会返回多条物流订单信息"), and the
   * one whose order_code matches is served.
   */
  async getFulfillment(credentials: Credentials, id: string): Promise<Fulfillment> {
    const parsed = parseShippingFulfillmentId(id)
    if (!parsed) {
      throw Object.assign(
        new Error(
          `Tmall getFulfillment: invalid fulfillment id '${id}' — expected 'tid:order_code' as listFulfillments returns it.`,
        ),
        { statusCode: 400 },
      )
    }
    const client = this.clientFor(credentials)
    const res = await client.call<LogisticsListResult>(METHOD_LOGISTICS_LIST, {
      fields: SHIPPING_FIELDS,
      tid: parsed.tid,
    })
    const result = client.extractResult<LogisticsListResult>(res)
    const found = (result.shippings?.shipping ?? []).find((s) => s.order_code === parsed.orderCode)
    if (!found) {
      throw Object.assign(
        new Error(
          `Tmall getFulfillment: no logistics order '${parsed.orderCode}' for tid '${parsed.tid}'`,
        ),
        { statusCode: 404 },
      )
    }
    return transformFulfillment(found)
  }

  // ── Refunds ────────────────────────────────────────────────────────────────

  async listRefunds(credentials: Credentials, params: QueryParams): Promise<Refund[]> {
    const client = this.clientFor(credentials)
    const { pageNo, pageSize } = this.topPage(params)

    const res = await client.call<RefundListResult>(METHOD_REFUNDS_LIST, {
      fields: REFUND_FIELDS,
      page_size: pageSize,
      page_no: pageNo,
      ...(params['status'] ? { status: String(params['status']) } : {}),
      ...(params.updatedAfter
        ? { start_modified: params.updatedAfter.toISOString().replace('T', ' ').substring(0, 19) }
        : {}),
    })
    const result = client.extractResult<RefundListResult>(res)
    this.reportTopPage(params, result, pageNo, pageSize)
    const refunds = result.refunds?.refund ?? []
    return transformRefunds(refunds, 'CNY')
  }

  async getRefund(credentials: Credentials, id: string): Promise<Refund> {
    const client = this.clientFor(credentials)
    const res = await client.call<RefundGetResult>(METHOD_REFUND_GET, {
      fields: REFUND_FIELDS,
      refund_id: id,
    })
    const result = client.extractResult<RefundGetResult>(res)
    if (!result.refund) {
      throw new Error(`Tmall getRefund: no refund found for refund_id '${id}'`)
    }
    return transformRefund(result.refund, 'CNY')
  }

  // ── Transactions (projected from trade data) ───────────────────────────────

  async listTransactions(credentials: Credentials, params: QueryParams): Promise<Transaction[]> {
    // TOP has no dedicated transaction list endpoint; we project from sold trades.
    const client = this.clientFor(credentials)
    const { pageNo, pageSize } = this.topPage(params)

    const startCreated =
      params.updatedAfter?.toISOString().replace('T', ' ').substring(0, 19) ??
      (params['start_created'] as string | undefined)

    const res = await client.call<TradesListResult>(METHOD_TRADES_LIST, {
      fields: TRADE_FIELDS,
      page_size: pageSize,
      page_no: pageNo,
      ...(startCreated ? { start_created: startCreated } : {}),
    })
    const result = client.extractResult<TradesListResult>(res)
    this.reportTopPage(params, result, pageNo, pageSize)
    const trades = result.trades?.trade ?? []
    return transformTransactions(trades as unknown as RawTmallTradeAmount[], 'CNY')
  }

  async getTransaction(credentials: Credentials, id: string): Promise<Transaction> {
    // id = `txn_${tid}` — strip the prefix to get the trade id.
    const tid = id.startsWith('txn_') ? id.slice(4) : id
    const client = this.clientFor(credentials)
    const res = await client.call<TradeAmountResult>(METHOD_TRADE_AMOUNT_GET, {
      fields: TRADE_AMOUNT_FIELDS,
      tid,
    })
    const result = client.extractResult<TradeAmountResult>(res)
    if (!result.trade_amount) {
      throw new Error(`Tmall getTransaction: no trade_amount found for tid '${tid}'`)
    }
    return transformTransaction({ ...result.trade_amount, tid } as RawTmallTradeAmount, 'CNY')
  }
}
