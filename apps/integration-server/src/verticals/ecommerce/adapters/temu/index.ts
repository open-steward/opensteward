/**
 * Temu adapter for the ecommerce vertical.
 *
 * Maps the Temu Open Platform REST API to canonical ecommerce resources.
 *
 * Reads, each on a type in Temu's public API index
 * (POST https://partner-us.temu.com/riemann/api/v2/menu/list):
 *   - Products: bg.local.goods.list.query (list), bg.local.goods.detail.query (get)
 *   - Orders:   bg.order.list.v2.get (list), bg.order.detail.v2.get (get)
 *   - Refunds:  bg.aftersales.parentaftersales.list.get, afterSalesStatusGroup 5 (list)
 *
 * Refused with 501 before any request: variants and inventory levels (no
 * documented price unit / no location for the canonical required fields),
 * fulfillments (no package list in the index), and a refund by id (the
 * documented lookup needs the order number too). See each method.
 *
 * Auth: API-key model. Sellers create an app in Temu Seller Center → Open Platform,
 * then authorize it to obtain an `access_token` (90-day validity). Pass credentials
 * as `{ accessToken, extra: { appKey, appSecret } }`.
 *
 * Docs: https://partner.temu.com/documentation
 *
 * ── Resource coverage ──────────────────────────────────────────────
 * Unavailable: collection  — Temu has no seller-managed collection concept; bg.local.goods.cats.get returns platform taxonomy categories only
 * Unavailable: discount    — no seller-facing discount/coupon API exists on the Temu Open Platform
 * Unavailable: transaction — no payment settlement or transaction query API is exposed to sellers
 * Unverified:  location    — third-party integrators report a location feed but no bg.* method name is publicly documented; API docs are behind login
 */

import { connectionScope, customForm, pageByRows, reportUpstreamPage } from '@opensteward/shared'
import type { Credentials, CursorPage, QueryParams } from '@opensteward/shared'
import type { EcommerceAdapter } from '../../adapter/interface'
import type { Product, ProductVariant } from '../../schema/product'
import type { InventoryLevel } from '../../schema/inventory'
import type { Order } from '../../schema/order'
import type { Fulfillment } from '../../schema/fulfillment'
import type { Refund } from '../../schema/refund'

import { buildAuthUrl, exchangeCode as temuExchangeCode } from './auth'
import { TemuClient } from './client'
import {
  AFTERSALES_PAGE_MAX,
  AFTERSALES_REFUNDED_GROUP,
  DEFAULT_BASE_URL,
  GOODS_PAGE_MAX,
  GOODS_STATUS_BUCKETS,
  ORDER_PAGE_MAX,
} from './constants'

import {
  transformProduct,
  transformProductDetail,
  untransformProduct,
  type RawTemuGoods,
  type RawTemuGoodsDetail,
} from './transform/product'
import { transformOrder, type RawTemuOrder } from './transform/order'
import { transformRefund, type RawTemuRefund } from './transform/refund'

const TEMU_FORM = customForm({
  fields: [
    {
      name: 'accessToken',
      label: 'Access token',
      type: 'password',
      required: true,
      helpText:
        'Authorize your app in Temu Seller Center → Open Platform → App Management to obtain a 90-day access token.',
    },
    {
      name: 'appKey',
      label: 'App key',
      type: 'text',
      required: true,
      helpText: 'The app_key assigned to your Open Platform app.',
    },
    {
      name: 'appSecret',
      label: 'App secret',
      type: 'password',
      required: true,
      helpText: 'The app_secret assigned to your Open Platform app.',
    },
  ],
  async exchange(input) {
    const accessToken = (input['accessToken'] ?? '').trim()
    const appKey = (input['appKey'] ?? '').trim()
    const appSecret = (input['appSecret'] ?? '').trim()
    if (!accessToken) throw new Error('Access token is required.')
    if (!appKey) throw new Error('App key is required.')
    if (!appSecret) throw new Error('App secret is required.')
    return { accessToken, extra: { appKey, appSecret } }
  },
})

export interface TemuAdapterConfig {
  /**
   * Temu Open Platform base URL. Defaults to the US endpoint.
   * Use `BASE_URL_EU` or `BASE_URL_GLOBAL` for other regions.
   */
  baseUrl?: string
}

/** `result` of bg.local.goods.list.query: "pageNo", "total", "goodsList". */
interface GoodsPage {
  pageNo?: number
  total?: number
  goodsList?: RawTemuGoods[]
}

/** `result` of bg.order.list.v2.get: "pageItems", "totalItemNum". */
interface OrderPage {
  pageItems?: RawTemuOrder[]
  totalItemNum?: number
}

/** `result` of bg.aftersales.parentaftersales.list.get: "total", "pageNumber", "data". */
interface AfterSalesPage {
  total?: number
  pageNumber?: number
  data?: RawTemuRefund[]
}

function notSupported(message: string): Error {
  return Object.assign(new Error(message), { statusCode: 501, code: 'NOT_SUPPORTED' })
}

/** The caller's 1-based page: a missing, 0, negative or non-finite page is page 1. */
function callerPage(params: QueryParams): number {
  const p = params.page
  return typeof p === 'number' && Number.isFinite(p) && p >= 1 ? Math.floor(p) : 1
}

/** The caller's exact limit clamped to an endpoint's documented maximum. */
function upstreamSize(params: QueryParams, max: number): number {
  const l = params.limit
  const asked = typeof l === 'number' && Number.isFinite(l) && l >= 1 ? Math.floor(l) : max
  return Math.min(asked, max)
}

/** Report a page-number page: the total the platform counted, and the size sent when clamped. */
function reportNumberedPage(
  params: QueryParams,
  page: number,
  size: number,
  total: number | undefined,
): void {
  const clamped = typeof params.limit === 'number' && size < params.limit ? { pageSize: size } : {}
  if (typeof total === 'number')
    reportUpstreamPage(params, { totalCount: total, hasMore: page * size < total, ...clamped })
  else reportUpstreamPage(params, clamped)
}

const seconds = (d: Date): number => Math.floor(d.getTime() / 1000)

export class TemuAdapter implements EcommerceAdapter {
  readonly platform = 'temu'
  readonly version = '0.1.0'
  /** bg.order.list.v2.get: "max is 100"; the goods walk re-cuts its own pages. */
  readonly capabilities = { maxPageSize: ORDER_PAGE_MAX }

  // Connect Link: three-field form collecting accessToken, appKey, appSecret.
  // appKey and appSecret are stored in credentials.extra so TemuClient can
  // use them to sign every request.
  credentialFields = TEMU_FORM.credentialFields
  exchangeCredentials = TEMU_FORM.exchangeCredentials

  private baseUrl: string

  constructor(config: TemuAdapterConfig = {}) {
    this.baseUrl = config.baseUrl ?? DEFAULT_BASE_URL
  }

  // ── Auth ──────────────────────────────────────────────────────────────────

  getAuthUrl(_state: string): string {
    return buildAuthUrl('us')
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    return temuExchangeCode()
  }

  /**
   * Temu access tokens are long-lived (90 days) and not refreshable via API.
   * Return credentials unchanged — the platform admin will re-authorize when
   * the token expires.
   */
  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return credentials
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private client(credentials: Credentials): TemuClient {
    return new TemuClient(credentials, this.baseUrl)
  }

  // ── Products ──────────────────────────────────────────────────────────────

  /**
   * bg.local.goods.list.query pages by "pageNo" and "pageSize ... with a limit
   * of 100 per page", reports "total", and needs a status filter
   * (goodsSearchType is "Optional if at least one of goodsStatusFilterType or
   * goodsIdList is provided"). The catalog is therefore one stream over the
   * status buckets 1, 4 and 5, walked at 100 rows an upstream page and cut to
   * the caller's page by pageByRows. The cursor is `<bucket index>:<pageNo>`.
   *
   * `updatedAfter` is not sent: the endpoint documents no update-time filter
   * (goodsStatusChangeTimeFrom is a status-change time with no unit named).
   */
  async listProducts(credentials: Credentials, params: QueryParams): Promise<Product[]> {
    const client = this.client(credentials)
    const key = `${connectionScope(`temu:${this.baseUrl}`, credentials)}:goods:${GOODS_PAGE_MAX}`
    const fetch = async (cursor: string | undefined): Promise<CursorPage<Product, string>> => {
      const [b, p] = cursor ? cursor.split(':').map(Number) : [0, 1]
      const bucket = b!
      const pageNo = p!
      const res = await client.call<GoodsPage>('bg.local.goods.list.query', {
        pageNo,
        pageSize: GOODS_PAGE_MAX,
        goodsStatusFilterType: GOODS_STATUS_BUCKETS[bucket],
      })
      const rows = res?.goodsList ?? []
      const more =
        typeof res?.total === 'number'
          ? pageNo * GOODS_PAGE_MAX < res.total
          : rows.length === GOODS_PAGE_MAX
      const next = more
        ? `${bucket}:${pageNo + 1}`
        : bucket + 1 < GOODS_STATUS_BUCKETS.length
          ? `${bucket + 1}:1`
          : undefined
      return { items: rows.map((g) => transformProduct(g)), next }
    }
    const { items } = await pageByRows<Product, string>(key, params, fetch)
    return items
  }

  /** bg.local.goods.detail.query: "goodsId [LONG] req=true :: goods id". */
  async getProduct(credentials: Credentials, id: string): Promise<Product> {
    if (!/^\d+$/.test(id))
      throw Object.assign(new Error(`Temu goods id must be numeric (goodsId is a LONG): ${id}`), {
        statusCode: 400,
      })
    const data = await this.client(credentials).call<RawTemuGoodsDetail>(
      'bg.local.goods.detail.query',
      {
        goodsId: Number(id),
      },
    )
    return transformProductDetail(data ?? {})
  }

  async updateProduct(
    credentials: Credentials,
    id: string,
    data: Partial<Product>,
  ): Promise<Product> {
    const body = untransformProduct(data)
    body['goods_id'] = id
    await this.client(credentials).call('bg.local.goods.partial.update', body)
    // Temu's update returns a result code, not the updated object — re-fetch.
    return this.getProduct(credentials, id)
  }

  // ── Variants (SKUs) ───────────────────────────────────────────────────────

  /**
   * Refused: every documented SKU price (bg.local.goods.sku.list.query
   * `retailPrice`, bg.local.goods.detail.query `skuList[].retailPrice`) is
   * `amount [STRING] :: Amount` with no unit or scale named, and the canonical
   * variant's `price` is required.
   */
  async listVariants(_credentials: Credentials, _params: QueryParams): Promise<ProductVariant[]> {
    throw notSupported(
      'Temu variants cannot be mapped: every documented SKU price is "amount [STRING] :: Amount" with no unit or scale, and a variant requires a price',
    )
  }

  async getVariant(_credentials: Credentials, _id: string): Promise<ProductVariant> {
    throw notSupported(
      'Temu cannot get a variant: bg.local.goods.sku.get is not in the public API index, and SKU prices ("amount [STRING] :: Amount") name no unit',
    )
  }

  // ── Inventory ─────────────────────────────────────────────────────────────

  /**
   * Refused: bg.local.goods.sku.list.query reports one "stock [INTEGER] ::
   * Stock quantity" per SKU with no warehouse or location, and the canonical
   * inventory level requires a `locationId`.
   */
  async listInventoryLevels(
    _credentials: Credentials,
    _params: QueryParams,
  ): Promise<InventoryLevel[]> {
    throw notSupported(
      'Temu cannot list inventory levels: bg.local.goods.sku.list.query reports "stock [INTEGER] :: Stock quantity" per SKU with no location, and an inventory level requires one',
    )
  }

  async getInventoryLevel(_credentials: Credentials, _id: string): Promise<InventoryLevel> {
    throw notSupported(
      'Temu cannot get an inventory level: SKU stock ("stock [INTEGER] :: Stock quantity") carries no location, and bg.local.goods.sku.get is not in the public API index',
    )
  }

  // ── Orders ────────────────────────────────────────────────────────────────

  /**
   * bg.order.list.v2.get: "pageNumber ... Page number for pagination, default
   * is 1.", "pageSize ... default is 10, max is 100.", "totalItemNum ... Total
   * number of matching records." `updatedAfter` becomes updateAtStart with
   * updateAtEnd ("in seconds(timestamp)", "Must be used in conjunction").
   */
  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const page = callerPage(params)
    const size = upstreamSize(params, ORDER_PAGE_MAX)
    const body: Record<string, unknown> = { pageNumber: page, pageSize: size }
    if (params.updatedAfter) {
      body['updateAtStart'] = seconds(params.updatedAfter)
      body['updateAtEnd'] = seconds(new Date())
    }
    const res = await this.client(credentials).call<OrderPage>('bg.order.list.v2.get', body)
    reportNumberedPage(params, page, size, res?.totalItemNum)
    return (res?.pageItems ?? []).map((o) => transformOrder(o))
  }

  /** bg.order.detail.v2.get: "parentOrderSn [STRING] req=true :: Parent order number". */
  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const data = await this.client(credentials).call<RawTemuOrder>('bg.order.detail.v2.get', {
      parentOrderSn: id,
    })
    return transformOrder(data ?? {})
  }

  async cancelOrder(
    credentials: Credentials,
    id: string,
    data?: { reason?: string },
  ): Promise<Order> {
    await this.client(credentials).call('bg.order.cancel', {
      order_sn: id,
      cancel_reason: data?.reason ?? '',
    })
    return this.getOrder(credentials, id)
  }

  // ── Fulfillments ──────────────────────────────────────────────────────────

  /**
   * Refused: bg.order.orderpackage.query/.get are not in Temu's public API
   * index. The one paged package list, bg.order.unshipped.package.get, covers
   * only unshipped packages ("totalItemNum ... Total number of unshipped
   * packages"), so it cannot serve every fulfillment. The documented shipment
   * read, bg.logistics.shipment.v2.get, is a lookup of one sub-order
   * ("parentOrderSn [STRING] req=true", "orderSn [STRING] req=true"), not a list.
   */
  async listFulfillments(_credentials: Credentials, _params: QueryParams): Promise<Fulfillment[]> {
    throw notSupported(
      'Temu cannot list fulfillments: the only documented package list, bg.order.unshipped.package.get, returns "Total number of unshipped packages" only, and bg.logistics.shipment.v2.get looks up one sub-order by parentOrderSn and orderSn',
    )
  }

  async getFulfillment(_credentials: Credentials, _id: string): Promise<Fulfillment> {
    throw notSupported(
      'Temu cannot get a fulfillment by id: no package lookup is documented (bg.order.orderpackage.get is not in the public API index)',
    )
  }

  // ── Refunds ───────────────────────────────────────────────────────────────

  /**
   * bg.aftersales.parentaftersales.list.get, filtered to afterSalesStatusGroup
   * "5: Refunded". It pages by "pageNo" and "pageSize ... default is 10, max
   * is 200", reports "total", and requires a time range: "At least one set of
   * creation or update times must be provided as required input parameters."
   * No retention or lookback limit is documented, so a call without
   * `updatedAfter` is refused; one with it sends updateAtStart/updateAtEnd.
   */
  async listRefunds(credentials: Credentials, params: QueryParams): Promise<Refund[]> {
    if (!params.updatedAfter)
      throw notSupported(
        'Temu cannot list refunds without updatedAfter: bg.aftersales.parentaftersales.list.get requires "at least one set of creation or update times", and no lookback limit is documented',
      )
    const page = callerPage(params)
    const size = upstreamSize(params, AFTERSALES_PAGE_MAX)
    const res = await this.client(credentials).call<AfterSalesPage>(
      'bg.aftersales.parentaftersales.list.get',
      {
        pageNo: page,
        pageSize: size,
        afterSalesStatusGroup: AFTERSALES_REFUNDED_GROUP,
        updateAtStart: seconds(params.updatedAfter),
        updateAtEnd: seconds(new Date()),
      },
    )
    reportNumberedPage(params, page, size, res?.total)
    return (res?.data ?? []).map((r) => transformRefund(r))
  }

  /**
   * Refused: bg.order.aftersale.refund.get is not in the public API index.
   * The documented detail, temu.aftersales.parentaftersales.detail.get, needs
   * "parentOrderSn [STRING] req=true" as well as the after-sales number, and
   * the list needs a time range.
   */
  async getRefund(_credentials: Credentials, _id: string): Promise<Refund> {
    throw notSupported(
      'Temu cannot get a refund by id alone: temu.aftersales.parentaftersales.detail.get requires parentOrderSn with parentAfterSalesSn',
    )
  }
}
