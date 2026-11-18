/**
 * NHN Commerce (Godomall / Shopby) adapter for the ecommerce vertical.
 *
 * Maps the Shopby Shop REST API to the canonical ecommerce resources.
 *
 * Auth model:
 *   - Every API call requires the `clientId` header (identifies the mall).
 *   - Member-scoped endpoints require an `accessToken` header (12 h validity).
 *   - Token exchange: POST /oauth/token with memberId + password.
 *
 * Supported resources:
 *   - Products     (list via /products/search, detail via /products/{productNo})
 *   - Collections  (categories via /categories)
 *   - Customers    (authenticated member profile via /profile)
 *   - Orders       (member orders via /profile/orders)
 *   - Fulfillments (derived from order options)
 *   - Refunds      (claims via /profile/claims)
 *   - Transactions (synthesized from order payment meta)
 *   - Discounts    (member coupons via /coupons)
 *
 * Resources NOT supported (return 501 automatically):
 *   - Locations      (Shopby shop API is single-location/member-scoped; warehouse
 *                     data exists only in the server API which requires a separate
 *                     systemKey credential outside this adapter's auth model)
 *   - InventoryLevel (derived from product options; no standalone endpoint)
 *   - Webhooks       (not documented in the shop API)
 *
 * ── Resource coverage ──────────────────────────────────────────────────────
 * Unavailable: location — Shopby shop API (shop-api.e-ncp.com) is single-location
 *              and member-scoped; warehouses live in server-api.e-ncp.com which
 *              requires a systemKey credential this adapter does not manage.
 *
 * Docs: https://docs.shopby.co.kr / https://server-docs.shopby.co.kr
 */

import type { Credentials, QueryParams } from '@opensteward/shared'
import type { EcommerceAdapter } from '../../adapter/interface'
import type { Product, ProductVariant } from '../../schema/product'
import type { Collection } from '../../schema/collection'
import type { Customer } from '../../schema/customer'
import type { Order } from '../../schema/order'
import type { Fulfillment } from '../../schema/fulfillment'
import type { Refund } from '../../schema/refund'
import type { Transaction } from '../../schema/transaction'
import type { Discount } from '../../schema/discount'

import { buildAuthUrl, exchangeCode as nhnExchangeCode, refreshToken } from './auth'
import { NhnCommerceClient } from './client'
import { DEFAULT_PAGE_SIZE } from './constants'

import {
  transformProductDetail,
  transformProductSummary,
  transformProductOption,
  type RawNhnProductDetail,
  type RawNhnProductSummary,
  type RawNhnProductOption,
  DEFAULT_CURRENCY,
} from './transform/product'
import {
  transformCategory,
  flattenCategories,
  type RawNhnCategory,
  type RawNhnCategoryResponse,
} from './transform/collection'
import { transformProfile, type RawNhnProfile } from './transform/customer'
import {
  transformOrder,
  type RawNhnOrder,
} from './transform/order'
import { transformFulfillment, type RawNhnOrderOptionWithDelivery } from './transform/fulfillment'
import { transformClaim, untransformRefund, type RawNhnClaimItem } from './transform/refund'
import { transformOrderTransaction } from './transform/transaction'
import { transformCoupon, type RawNhnCoupon } from './transform/discount'

export interface NhnCommerceAdapterConfig {
  /**
   * Mall client ID — identifies the mall for every API call.
   * Found in `{mallDomain}/environment.json` or Service Admin > Service Management.
   */
  clientId: string
  /**
   * OAuth redirect URI — used when building the authorization URL.
   * For direct credential integration this is informational only.
   */
  redirectUri?: string
}

export class NhnCommerceAdapter implements EcommerceAdapter {
  readonly platform = 'nhn-commerce'
  readonly version = '0.1.0'

  private clientId: string
  private redirectUri: string

  constructor(config: NhnCommerceAdapterConfig) {
    this.clientId = config.clientId
    this.redirectUri = config.redirectUri ?? ''
  }

  // ── Auth ──────────────────────────────────────────────────────────────────

  getAuthUrl(state: string): string {
    return buildAuthUrl(this.clientId, this.redirectUri, state)
  }

  /**
   * Exchange a `memberId:password` code for a Shopby access token.
   * The caller encodes the credentials as `<memberId>:<password>`.
   */
  async exchangeCode(code: string, _redirectUri: string): Promise<Credentials> {
    return nhnExchangeCode(code, this.clientId)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return refreshToken(credentials)
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private client(credentials: Credentials): NhnCommerceClient {
    return new NhnCommerceClient(credentials, this.clientId)
  }

  private pageParams(params: QueryParams): { pageNumber: number; pageSize: number } {
    const pageNumber = Number(params['pageNumber'] ?? params['page'] ?? 1)
    const pageSize = Math.min(
      Number(params.limit ?? params['pageSize'] ?? DEFAULT_PAGE_SIZE),
      200,
    )
    return { pageNumber, pageSize }
  }

  // ── Products ──────────────────────────────────────────────────────────────

  async listProducts(credentials: Credentials, params: QueryParams): Promise<Product[]> {
    const { pageNumber, pageSize } = this.pageParams(params)
    const res = await this.client(credentials).listPage<RawNhnProductSummary>(
      '/products/search',
      {},
      pageNumber,
      pageSize,
    )
    return res.items.map((p) => transformProductSummary(p, DEFAULT_CURRENCY))
  }

  async getProduct(credentials: Credentials, id: string): Promise<Product> {
    const res = await this.client(credentials).get<RawNhnProductDetail>(`/products/${id}`)
    return transformProductDetail(res, DEFAULT_CURRENCY)
  }

  // ── Variants ──────────────────────────────────────────────────────────────

  async listVariants(credentials: Credentials, params: QueryParams): Promise<ProductVariant[]> {
    const productId = String(params['productId'] ?? params['product_id'] ?? '')
    if (!productId) {
      throw new Error('listVariants requires `productId` in query params')
    }
    const res = await this.client(credentials).get<RawNhnProductDetail>(`/products/${productId}`)
    return (res.options ?? []).map((opt: RawNhnProductOption) =>
      transformProductOption(opt, productId, DEFAULT_CURRENCY),
    )
  }

  async getVariant(credentials: Credentials, id: string): Promise<ProductVariant> {
    // Shopby options require a productNo context. Callers should pass
    // `productNo:optionNo` as the composite id.
    const [productNo, optionNo] = id.split(':')
    if (!productNo) throw new Error('getVariant: id must be `productNo:optionNo`')
    const res = await this.client(credentials).get<RawNhnProductDetail>(`/products/${productNo}`)
    const opt = (res.options ?? []).find(
      (o: RawNhnProductOption) =>
        String(o.optionNo ?? o.mallOptionNo) === (optionNo ?? productNo),
    )
    if (!opt) throw new Error(`Variant ${id} not found`)
    return transformProductOption(opt, productNo, DEFAULT_CURRENCY)
  }

  // ── Collections / Categories ──────────────────────────────────────────────

  async listCollections(credentials: Credentials, _params: QueryParams): Promise<Collection[]> {
    const res = await this.client(credentials).get<RawNhnCategoryResponse>('/categories')
    return flattenCategories(res.multiLevelCategories ?? [])
  }

  async getCollection(credentials: Credentials, id: string): Promise<Collection> {
    const res = await this.client(credentials).get<{ multiLevelCategories: RawNhnCategory[] }>(
      `/categories/${id}`,
    )
    const cats = res.multiLevelCategories ?? []
    if (cats.length === 0) throw new Error(`Category ${id} not found`)
    return transformCategory(cats[0]!)
  }

  // ── Customers ─────────────────────────────────────────────────────────────

  async getCustomer(credentials: Credentials, _id: string): Promise<Customer> {
    // Shopby shop API only exposes the currently authenticated member.
    const res = await this.client(credentials).get<RawNhnProfile>('/profile')
    return transformProfile(res)
  }

  // ── Orders ────────────────────────────────────────────────────────────────

  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const { pageNumber, pageSize } = this.pageParams(params)
    const res = await this.client(credentials).listPage<RawNhnOrder>(
      '/profile/orders',
      {},
      pageNumber,
      pageSize,
    )
    return res.items.map((o) => transformOrder(o, DEFAULT_CURRENCY))
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const res = await this.client(credentials).get<RawNhnOrder>(`/profile/orders/${id}`)
    return transformOrder(res, DEFAULT_CURRENCY)
  }

  async cancelOrder(
    credentials: Credentials,
    id: string,
    data?: { reason?: string },
  ): Promise<Order> {
    const order = await this.getOrder(credentials, id)
    const orderOptionNos = (order.lineItems ?? []).map((li) => li.id)
    await this.client(credentials).post(`/profile/claims/cancel`, {
      claimReasonType: 'CHANGE_MIND',
      claimReasonDetail: data?.reason ?? '',
      orderOptionNos,
      refundType: 'ACCOUNT',
    })
    return this.getOrder(credentials, id)
  }

  // ── Fulfillments ──────────────────────────────────────────────────────────

  async listFulfillments(credentials: Credentials, params: QueryParams): Promise<Fulfillment[]> {
    const orderId = String(params['orderId'] ?? params['order_id'] ?? '')
    if (!orderId) throw new Error('listFulfillments requires `orderId` in query params')
    const order = await this.client(credentials).get<RawNhnOrder>(`/profile/orders/${orderId}`)
    // Surface each dispatched order option as a fulfillment.
    const dispatched = (order.orderOptions ?? []).filter((opt: RawNhnOrderOptionWithDelivery) => {
      const s = opt.orderStatusType ?? ''
      return ['DELIVERY_PREPARE', 'DELIVERY_ING', 'DELIVERY_DONE'].includes(s)
    })
    return dispatched.map((opt: RawNhnOrderOptionWithDelivery) =>
      transformFulfillment(opt, orderId),
    )
  }

  // ── Refunds ───────────────────────────────────────────────────────────────

  async listRefunds(credentials: Credentials, params: QueryParams): Promise<Refund[]> {
    const { pageNumber, pageSize } = this.pageParams(params)
    const extra: Record<string, unknown> = {}
    const orderId = params['orderId'] ?? params['order_id']
    if (orderId) extra.orderNo = orderId
    const res = await this.client(credentials).listPage<RawNhnClaimItem>(
      '/profile/claims',
      extra,
      pageNumber,
      pageSize,
    )
    return res.items.map((c) => transformClaim(c, DEFAULT_CURRENCY))
  }

  async getRefund(credentials: Credentials, id: string): Promise<Refund> {
    const res = await this.client(credentials).get<{ result?: RawNhnClaimItem }>(
      `/profile/claims/${id}/result`,
    )
    const claim = res.result ?? (res as unknown as RawNhnClaimItem)
    return transformClaim(claim, DEFAULT_CURRENCY)
  }

  async createRefund(credentials: Credentials, data: Partial<Refund>): Promise<Refund> {
    if (!data.orderId) throw new Error('createRefund requires orderId')
    const body = untransformRefund(data)
    const res = await this.client(credentials).post<{ claimNo?: number | string }>(
      '/profile/claims/cancel',
      body,
    )
    return {
      id: String(res.claimNo ?? ''),
      orderId: data.orderId,
      reason: data.reason,
      refundLineItems: data.refundLineItems,
      metadata: res as unknown as Record<string, unknown>,
    }
  }

  // ── Transactions ──────────────────────────────────────────────────────────

  async listTransactions(credentials: Credentials, params: QueryParams): Promise<Transaction[]> {
    const orderId = String(params['orderId'] ?? params['order_id'] ?? '')
    if (!orderId) throw new Error('listTransactions requires `orderId` in query params')
    const order = await this.client(credentials).get<RawNhnOrder>(`/profile/orders/${orderId}`)
    return [transformOrderTransaction(order, DEFAULT_CURRENCY)]
  }

  async getTransaction(credentials: Credentials, id: string): Promise<Transaction> {
    // id is the orderNo
    const order = await this.client(credentials).get<RawNhnOrder>(`/profile/orders/${id}`)
    return transformOrderTransaction(order, DEFAULT_CURRENCY)
  }

  // ── Discounts / Coupons ───────────────────────────────────────────────────

  async listDiscounts(credentials: Credentials, params: QueryParams): Promise<Discount[]> {
    const { pageNumber, pageSize } = this.pageParams(params)
    const res = await this.client(credentials).listPage<RawNhnCoupon>(
      '/coupons',
      {},
      pageNumber,
      pageSize,
    )
    return res.items.map((c) => transformCoupon(c, DEFAULT_CURRENCY))
  }

  async getDiscount(credentials: Credentials, id: string): Promise<Discount> {
    // No direct single-coupon GET — list and find by couponNo.
    const res = await this.client(credentials).listPage<RawNhnCoupon>('/coupons', {}, 1, 200)
    const coupon = res.items.find((c) => String(c.couponNo) === id)
    if (!coupon) throw new Error(`Coupon ${id} not found`)
    return transformCoupon(coupon, DEFAULT_CURRENCY)
  }
}
