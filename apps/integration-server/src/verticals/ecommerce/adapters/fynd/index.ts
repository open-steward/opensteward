/**
 * Fynd Platform adapter for the ecommerce vertical.
 *
 * Maps Fynd's company-scoped Platform API (Catalog, CompanyProfile, Order,
 * Cart/Coupon, User modules) to the canonical ecommerce resources.
 *
 * All endpoint paths, parameters and response shapes are verified against
 * `gofynd/fdk-client-javascript` @ commit
 * `7598488bf04e7a75bc44088441745538d524abec` (2026-09-10) — see the
 * per-module citation in each `transform/*.ts` file and in `auth.ts`.
 *
 * Auth is OAuth2 **authorization-code**, not client-credentials (see
 * `auth.ts` header for why): `companyId` and `applicationId` are the
 * customer's, collected via `oauthFields()` before the redirect (the
 * `BaseAdapter` mechanism for a per-customer host/id an OAuth authorize URL
 * needs but deployment config cannot supply), then read back from
 * `credentials.extra`.
 *
 * Coverage: 7 of 11 resources this vertical's interface knows about
 * (product, collection, location, inventory, customer, order, discount);
 * variant/fulfillment/refund/transaction are declared unavailable in
 * `metadata.ts` with platform-specific reasons.
 */

// ── Resource coverage ──────────────────────────────────────────────
// Unavailable: variant — no company-wide, store-independent SKU resource with a
//              documented create/update/delete endpoint (see metadata.ts).
// Unavailable: fulfillment — shipment line items are untyped nested `bags`, and
//              trackingNumber/carrier have no documented field (see metadata.ts).
// Unavailable: refund — no standalone refund REST resource (see metadata.ts).
// Unavailable: transaction — payment fields are untyped, no resource of their
//              own (see metadata.ts).

import type { CredentialField, Credentials, QueryParams } from '@opensteward/shared'
import { reportUpstreamPage } from '@opensteward/shared'
import type { EcommerceAdapter } from '../../adapter/interface'
import type { Product } from '../../schema/product'
import type { Collection } from '../../schema/collection'
import type { Location } from '../../schema/location'
import type { InventoryLevel } from '../../schema/inventory'
import type { Customer } from '../../schema/customer'
import type { Order } from '../../schema/order'
import type { Discount } from '../../schema/discount'

import { buildAuthorizeUrl, exchangeCode as fyndExchangeCode, refreshToken as fyndRefreshToken } from './auth'
import { FyndClient, type FyndListResponse, type FyndPage } from './client'
import { DEFAULT_PAGE_SIZE, DEFAULT_SCOPES, FYND_DOMAIN } from './constants'

import { transformProduct, untransformProduct, type RawFyndProduct } from './transform/product'
import { transformCollection, type RawFyndCategory } from './transform/collection'
import { transformLocation, type RawFyndLocation } from './transform/location'
import { transformInventoryLevel, type RawFyndInventoryArticle } from './transform/inventory'
import { transformCustomer, type RawFyndCustomer } from './transform/customer'
import {
  transformOrderListItem,
  transformOrderDetail,
  type RawFyndOrderListItem,
  type RawFyndOrderDetail,
  type RawFyndOrderUser,
} from './transform/order'
import { transformDiscount, untransformDiscount, type RawFyndCoupon } from './transform/discount'

export interface FyndAdapterConfig {
  /** This deployment's Fynd "extension" (integration app) client id/secret —
   *  the same pair for every company that connects. Generated once in the
   *  Fynd Partners portal, not per-customer. */
  clientId: string
  clientSecret: string
  redirectUri: string
  scopes?: string[]
  /** Override for testing; defaults to `https://api.fynd.com`. */
  domain?: string
}

export class FyndAdapter implements EcommerceAdapter {
  readonly platform = 'fynd'
  readonly version = '0.1.0'

  private clientId: string
  private clientSecret: string
  private redirectUri: string
  private scopes: string[]
  private domain: string

  constructor(config: FyndAdapterConfig) {
    this.clientId = config.clientId
    this.clientSecret = config.clientSecret
    this.redirectUri = config.redirectUri
    this.scopes = config.scopes ?? DEFAULT_SCOPES
    this.domain = config.domain ?? FYND_DOMAIN
  }

  // ── Auth ──────────────────────────────────────────────────────────────────

  /**
   * Fynd's authorize and token endpoints are `.../company/{companyId}/...` —
   * deployment config cannot know the customer's company. `applicationId`
   * is collected alongside it because several resources here (customers,
   * discounts) are application-scoped and there is no way to discover
   * "which application" after the fact.
   */
  oauthFields(): CredentialField[] {
    return [
      {
        name: 'companyId',
        label: 'Fynd Company ID',
        type: 'text',
        required: true,
        placeholder: '10000123',
        helpText: 'Shown in the company panel URL: partners.fynd.com/company/<companyId>/...',
      },
      {
        name: 'applicationId',
        label: 'Fynd Application ID',
        type: 'text',
        required: true,
        placeholder: '60f1a2b3c4d5e6f7a8b9c0d1',
        helpText: 'The sales-channel (application) this connection reads customers and coupons for.',
      },
    ]
  }

  getAuthUrl(
    state: string,
    overrideScopes?: string[],
    _codeChallenge?: string,
    inputs?: Record<string, string>,
  ): string {
    const companyId = this.resolveCompanyId(inputs?.companyId)
    return buildAuthorizeUrl(
      companyId,
      this.clientId,
      this.redirectUri,
      overrideScopes ?? this.scopes,
      state,
      this.domain,
    )
  }

  async exchangeCode(code: string, _redirectUri: string): Promise<Credentials> {
    const companyId = this.resolveCompanyId()
    return fyndExchangeCode(companyId, code, this.clientId, this.clientSecret, this.domain)
  }

  async exchangeCodeWithInputs(
    code: string,
    _redirectUri: string,
    inputs: Record<string, string>,
  ): Promise<Credentials> {
    const companyId = this.resolveCompanyId(inputs.companyId)
    const applicationId = inputs.applicationId
    if (!applicationId) throw new Error('Fynd connect requires an applicationId.')
    const creds = await fyndExchangeCode(companyId, code, this.clientId, this.clientSecret, this.domain)
    return { ...creds, extra: { ...(creds.extra ?? {}), companyId, applicationId } }
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    const companyId = credentials.extra?.['companyId'] as string | undefined
    if (!companyId || !credentials.refreshToken) {
      throw new Error(
        'Fynd refreshCredentials requires credentials.extra.companyId and a refreshToken; ' +
          're-connect via the OAuth flow.',
      )
    }
    const refreshed = await fyndRefreshToken(
      companyId,
      credentials.refreshToken,
      this.clientId,
      this.clientSecret,
      this.domain,
    )
    return { ...refreshed, extra: { ...(credentials.extra ?? {}), ...refreshed.extra } }
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private resolveCompanyId(companyId?: string): string {
    if (companyId) return companyId
    throw new Error(
      'Fynd adapter is missing a companyId. Connect via the OAuth flow, which collects it ' +
        'as an oauthField before the redirect.',
    )
  }

  private companyIdFor(credentials: Credentials): string {
    const companyId = credentials.extra?.['companyId'] as string | undefined
    if (!companyId) throw new Error('Fynd connection is missing credentials.extra.companyId.')
    return companyId
  }

  private applicationIdFor(credentials: Credentials): string {
    const applicationId = credentials.extra?.['applicationId'] as string | undefined
    if (!applicationId) throw new Error('Fynd connection is missing credentials.extra.applicationId.')
    return applicationId
  }

  private client(credentials: Credentials): FyndClient {
    return new FyndClient(credentials.accessToken, this.domain)
  }

  private pageParams(params: QueryParams): { page_no: number; page_size: number } {
    return { page_no: params.page ?? 1, page_size: params.limit ?? DEFAULT_PAGE_SIZE }
  }

  private reportPage(params: QueryParams, page: FyndPage | undefined): void {
    if (!page) return
    reportUpstreamPage(params, {
      totalCount: page.item_total,
      currentPage: page.current,
      hasMore: page.has_next,
    })
  }

  // ── Products ──────────────────────────────────────────────────────────────

  async listProducts(credentials: Credentials, params: QueryParams): Promise<Product[]> {
    const companyId = this.companyIdFor(credentials)
    const res = await this.client(credentials).get<FyndListResponse<RawFyndProduct>>(
      `/service/platform/catalog/v2.0/company/${companyId}/products/`,
      this.pageParams(params),
    )
    this.reportPage(params, res.page)
    return (res.items ?? []).map(transformProduct)
  }

  async getProduct(credentials: Credentials, id: string): Promise<Product> {
    const companyId = this.companyIdFor(credentials)
    const res = await this.client(credentials).get<{ data: RawFyndProduct }>(
      `/service/platform/catalog/v2.0/company/${companyId}/products/${encodeURIComponent(id)}/`,
    )
    return transformProduct(res.data)
  }

  async updateProduct(credentials: Credentials, id: string, data: Partial<Product>): Promise<Product> {
    const companyId = this.companyIdFor(credentials)
    const body = untransformProduct(data)
    // PATCH's own response is just `{success}` (`SuccessResponseSchema`) —
    // re-fetch to return the canonical shape.
    await this.client(credentials).patch<{ success: boolean }>(
      `/service/platform/catalog/v3.0/company/${companyId}/products/${encodeURIComponent(id)}/`,
      body,
    )
    return this.getProduct(credentials, id)
  }

  async deleteProduct(credentials: Credentials, id: string): Promise<void> {
    const companyId = this.companyIdFor(credentials)
    await this.client(credentials).delete(
      `/service/platform/catalog/v2.0/company/${companyId}/products/${encodeURIComponent(id)}/`,
    )
  }

  // ── Collections ───────────────────────────────────────────────────────────

  async listCollections(credentials: Credentials, params: QueryParams): Promise<Collection[]> {
    const companyId = this.companyIdFor(credentials)
    const res = await this.client(credentials).get<FyndListResponse<RawFyndCategory>>(
      `/service/platform/catalog/v1.0/company/${companyId}/category/`,
      this.pageParams(params),
    )
    this.reportPage(params, res.page)
    return (res.items ?? []).map(transformCollection)
  }

  async getCollection(credentials: Credentials, id: string): Promise<Collection> {
    const companyId = this.companyIdFor(credentials)
    const res = await this.client(credentials).get<{ data: RawFyndCategory }>(
      `/service/platform/catalog/v1.0/company/${companyId}/category/${encodeURIComponent(id)}/`,
    )
    return transformCollection(res.data)
  }

  // ── Locations ─────────────────────────────────────────────────────────────

  async listLocations(credentials: Credentials, params: QueryParams): Promise<Location[]> {
    const companyId = this.companyIdFor(credentials)
    const res = await this.client(credentials).get<FyndListResponse<RawFyndLocation>>(
      `/service/platform/company-profile/v2.0/company/${companyId}/location`,
      this.pageParams(params),
    )
    this.reportPage(params, res.page)
    return (res.items ?? []).map(transformLocation)
  }

  async getLocation(credentials: Credentials, id: string): Promise<Location> {
    const companyId = this.companyIdFor(credentials)
    const raw = await this.client(credentials).get<RawFyndLocation>(
      `/service/platform/company-profile/v2.0/company/${companyId}/location/${encodeURIComponent(id)}`,
    )
    return transformLocation(raw)
  }

  // ── Inventory ─────────────────────────────────────────────────────────────

  async listInventoryLevels(credentials: Credentials, params: QueryParams): Promise<InventoryLevel[]> {
    const companyId = this.companyIdFor(credentials)
    const res = await this.client(credentials).get<FyndListResponse<RawFyndInventoryArticle>>(
      `/service/platform/catalog/v1.0/company/${companyId}/inventories`,
      this.pageParams(params),
    )
    this.reportPage(params, res.page)
    return (res.items ?? []).map(transformInventoryLevel)
  }

  /**
   * No single-record "get inventory by id" endpoint exists (see
   * `transform/inventory.ts`) — `id` is `${sellerIdentifier}:${storeId}`,
   * so it is decomposed back into the list endpoint's filters.
   */
  async getInventoryLevel(credentials: Credentials, id: string): Promise<InventoryLevel> {
    const companyId = this.companyIdFor(credentials)
    const [sellerIdentifier, storeId] = id.split(':')
    if (!sellerIdentifier || !storeId) {
      throw new Error('Invalid Fynd inventory id: expected `${sellerIdentifier}:${storeId}`')
    }
    const res = await this.client(credentials).get<FyndListResponse<RawFyndInventoryArticle>>(
      `/service/platform/catalog/v1.0/company/${companyId}/inventories`,
      { store_ids: storeId, seller_identifiers: sellerIdentifier, page_size: 50 },
    )
    const match = (res.items ?? []).find((i) => i.seller_identifier === sellerIdentifier)
    if (!match) throw new Error(`No Fynd inventory record found for id ${id}`)
    return transformInventoryLevel(match)
  }

  async setInventoryLevel(
    credentials: Credentials,
    data: { variantId: string; locationId: string; available: number },
  ): Promise<InventoryLevel> {
    const companyId = this.companyIdFor(credentials)
    await this.client(credentials).post(
      `/service/platform/catalog/v1.0/company/${companyId}/store/${encodeURIComponent(
        data.locationId,
      )}/identifier/${encodeURIComponent(data.variantId)}/quantity`,
      { total_quantity: data.available },
    )
    return this.getInventoryLevel(credentials, `${data.variantId}:${data.locationId}`)
  }

  // ── Customers ─────────────────────────────────────────────────────────────

  async listCustomers(credentials: Credentials, params: QueryParams): Promise<Customer[]> {
    const companyId = this.companyIdFor(credentials)
    const applicationId = this.applicationIdFor(credentials)
    const res = await this.client(credentials).get<FyndListResponse<RawFyndCustomer>>(
      `/service/platform/user/v1.0/company/${companyId}/application/${applicationId}/customers/list`,
      { page_no: params.page ?? 1, page_size: params.limit ?? DEFAULT_PAGE_SIZE },
    )
    this.reportPage(params, res.page)
    return (res.items ?? []).map(transformCustomer)
  }

  // ── Orders ────────────────────────────────────────────────────────────────

  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const companyId = this.companyIdFor(credentials)
    const res = await this.client(credentials).get<FyndListResponse<RawFyndOrderListItem>>(
      `/service/platform/order/v1.0/company/${companyId}/orders-listing`,
      this.pageParams(params),
    )
    this.reportPage(params, res.page)
    return (res.items ?? []).map(transformOrderListItem)
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const companyId = this.companyIdFor(credentials)
    const res = await this.client(credentials).get<{
      order: RawFyndOrderDetail
      shipments?: Array<{ user?: RawFyndOrderUser }>
    }>(`/service/platform/order/v1.0/company/${companyId}/order-details`, { order_id: id })
    return transformOrderDetail(res.order, res.shipments?.[0]?.user)
  }

  // ── Discounts (Fynd "coupons") ────────────────────────────────────────────

  async listDiscounts(credentials: Credentials, params: QueryParams): Promise<Discount[]> {
    const companyId = this.companyIdFor(credentials)
    const applicationId = this.applicationIdFor(credentials)
    const res = await this.client(credentials).get<FyndListResponse<RawFyndCoupon>>(
      `/service/platform/cart/v1.0/company/${companyId}/application/${applicationId}/coupon`,
      this.pageParams(params),
    )
    this.reportPage(params, res.page)
    return (res.items ?? []).map(transformDiscount)
  }

  async getDiscount(credentials: Credentials, id: string): Promise<Discount> {
    const companyId = this.companyIdFor(credentials)
    const applicationId = this.applicationIdFor(credentials)
    const raw = await this.client(credentials).get<RawFyndCoupon>(
      `/service/platform/cart/v1.0/company/${companyId}/application/${applicationId}/coupon/${encodeURIComponent(id)}`,
    )
    return transformDiscount(raw)
  }

  async createDiscount(credentials: Credentials, data: Partial<Discount>): Promise<Discount> {
    const companyId = this.companyIdFor(credentials)
    const applicationId = this.applicationIdFor(credentials)
    const body = untransformDiscount(data)
    const res = await this.client(credentials).post<{ success: boolean; message?: string; _id?: string }>(
      `/service/platform/cart/v1.0/company/${companyId}/application/${applicationId}/coupon`,
      body,
    )
    if (!res._id) throw new Error(`Fynd coupon create did not return an id: ${res.message ?? ''}`)
    return this.getDiscount(credentials, res._id)
  }

  async updateDiscount(credentials: Credentials, id: string, data: Partial<Discount>): Promise<Discount> {
    const companyId = this.companyIdFor(credentials)
    const applicationId = this.applicationIdFor(credentials)
    const body = untransformDiscount(data)
    await this.client(credentials).put<{ success: boolean }>(
      `/service/platform/cart/v1.0/company/${companyId}/application/${applicationId}/coupon/${encodeURIComponent(id)}`,
      body,
    )
    return this.getDiscount(credentials, id)
  }

  async deleteDiscount(credentials: Credentials, id: string): Promise<void> {
    const companyId = this.companyIdFor(credentials)
    const applicationId = this.applicationIdFor(credentials)
    await this.client(credentials).delete(
      `/service/platform/cart/v1.0/company/${companyId}/application/${applicationId}/coupon/${encodeURIComponent(id)}`,
    )
  }
}
