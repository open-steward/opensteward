/**
 * PlentyONE adapter for the ecommerce vertical.
 *
 * Maps the PlentyONE REST API (https://p{plentyId}.my.plentysystems.com/rest)
 * to canonical ecommerce resources. Auth uses username/password login to
 * obtain a short-lived Bearer token (24 h) with a refresh token.
 *
 * PlentyONE does not publish a signed webhook mechanism, so webhook methods
 * are intentionally omitted (the registry returns 501 automatically).
 *
 * Key resource mappings:
 *   items            → Products / Variants
 *   categories       → Collections
 *   accounts/contacts→ Customers
 *   orders           → Orders
 *   shipping/packages→ Fulfillments
 *   orders (credit)  → Refunds
 *   payments         → Transactions
 *   coupons/campaigns→ Discounts
 *   warehouses       → Locations
 *   variation stock  → InventoryLevels
 */

import type { Credentials, QueryParams } from '@opensteward/shared'
import { pageLocally } from '@opensteward/shared'
import type { EcommerceAdapter } from '../../adapter/interface'
import type { Product, ProductVariant } from '../../schema/product'
import type { Collection } from '../../schema/collection'
import type { Location } from '../../schema/location'
import type { InventoryLevel } from '../../schema/inventory'
import type { Customer } from '../../schema/customer'
import type { Order } from '../../schema/order'
import type { Fulfillment } from '../../schema/fulfillment'
import type { Refund } from '../../schema/refund'
import type { Transaction } from '../../schema/transaction'
import type { Discount } from '../../schema/discount'

import { buildAuthUrl, loginWithPassword, refreshAccessToken } from './auth'
import { PlentyOneClient } from './client'
import { DEFAULT_PAGE_SIZE } from './constants'

import {
  transformItem,
  untransformItem,
  transformVariation,
  untransformVariation,
  type RawPlentyOneItem,
  type RawPlentyOneVariation,
} from './transform/product'
import {
  transformCategory,
  untransformCategory,
  type RawPlentyOneCategory,
} from './transform/collection'
import { transformWarehouse, type RawPlentyOneWarehouse } from './transform/location'
import { transformStock, type RawPlentyOneStock } from './transform/inventory'
import {
  transformContact,
  untransformContact,
  type RawPlentyOneContact,
} from './transform/customer'
import {
  transformOrder,
  untransformOrder,
  type RawPlentyOneOrder,
} from './transform/order'
import {
  transformShippingPackage,
  untransformShippingPackage,
  type RawPlentyOneShippingPackage,
} from './transform/fulfillment'
import {
  transformCreditNote,
  untransformCreditNote,
  type RawPlentyOneCreditNote,
} from './transform/refund'
import {
  transformPayment,
  untransformPayment,
  type RawPlentyOnePayment,
} from './transform/transaction'
import {
  transformCampaign,
  untransformCampaign,
  type RawPlentyOneCouponCampaign,
  type RawPlentyOneCouponCode,
} from './transform/discount'

export interface PlentyoneAdapterConfig {
  /**
   * PlentyONE system ID (the numeric part of the base URL,
   * e.g. `54321` for `https://p54321.my.plentysystems.com`).
   */
  plentyId?: string | number
  /** REST API user username (for the per-connection login flow). */
  username?: string
  /** REST API user password. */
  password?: string
}

export class PlentyoneAdapter implements EcommerceAdapter {
  readonly platform = 'plentyone'
  readonly version = '0.1.0'

  private plentyId: string | undefined
  private username: string | undefined
  private password: string | undefined

  constructor(config: PlentyoneAdapterConfig = {}) {
    this.plentyId = config.plentyId != null ? String(config.plentyId) : undefined
    this.username = config.username
    this.password = config.password
  }

  // ── Auth ──────────────────────────────────────────────────────────────────

  getAuthUrl(_state: string): string {
    return buildAuthUrl(this.plentyId ?? 'your-plenty-id')
  }

  /**
   * PlentyONE does not use OAuth authorization codes. This method exchanges
   * username + password (passed as code + state respectively) for a Bearer
   * token. When using the standard adapter framework, pass credentials as
   * `{ accessToken: username, extra: { password, plentyId } }` instead and
   * rely on `loginWithPassword` directly.
   */
  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    const plentyId = this.plentyId
    const username = this.username
    const password = this.password
    if (!plentyId || !username || !password) {
      throw new Error(
        'PlentyONE does not use OAuth code exchange. ' +
          'Configure plentyId, username, and password in the adapter config, ' +
          'or POST credentials to /v1/connections with body ' +
          '`{ platform: "plentyone", credentials: { accessToken: "<username>", ' +
          'extra: { password: "<password>", plentyId: "<id>" } } }`.',
      )
    }
    return loginWithPassword(plentyId, username, password)
  }

  /**
   * Refresh the access token using the stored refresh_token when it expires.
   */
  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    if (!credentials.refreshToken) return credentials
    try {
      return await refreshAccessToken(credentials)
    } catch {
      return credentials
    }
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private client(credentials: Credentials): PlentyOneClient {
    // Allow plentyId from credentials.extra as an override.
    const plentyId =
      (credentials.extra?.['plentyId'] as string | undefined) ??
      this.plentyId
    if (!plentyId) {
      throw new Error(
        'PlentyOneAdapter: plentyId is required. ' +
          'Supply it via credentials.extra.plentyId or adapter config.',
      )
    }
    const merged: Credentials = {
      ...credentials,
      extra: { ...credentials.extra, plentyId },
    }
    return new PlentyOneClient(merged)
  }

  private listParams(params: QueryParams): Record<string, unknown> {
    const out: Record<string, unknown> = {
      itemsPerPage: params.limit ?? DEFAULT_PAGE_SIZE,
    }
    if (params['page'] != null) out['page'] = params['page']
    if (params.updatedAfter) {
      out['updatedAtFrom'] = params.updatedAfter.toISOString()
    }
    return out
  }

  // ── Products ──────────────────────────────────────────────────────────────

  async listProducts(credentials: Credentials, params: QueryParams): Promise<Product[]> {
    const res = await this.client(credentials).listWithPage<RawPlentyOneItem>(
      '/items',
      { ...this.listParams(params), with: 'texts,variations,itemImages' },
    )
    return res.items.map(transformItem)
  }

  async getProduct(credentials: Credentials, id: string): Promise<Product> {
    const raw = await this.client(credentials).get<RawPlentyOneItem>(
      `/items/${id}`,
      { with: 'texts,variations,itemImages' },
    )
    return transformItem(raw)
  }

  async createProduct(credentials: Credentials, data: Partial<Product>): Promise<Product> {
    const raw = await this.client(credentials).post<RawPlentyOneItem>(
      '/items',
      untransformItem(data),
    )
    return transformItem(raw)
  }

  async updateProduct(
    credentials: Credentials,
    id: string,
    data: Partial<Product>,
  ): Promise<Product> {
    const raw = await this.client(credentials).put<RawPlentyOneItem>(
      `/items/${id}`,
      untransformItem(data),
    )
    return transformItem(raw)
  }

  async deleteProduct(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`/items/${id}`)
  }

  // ── Variants ──────────────────────────────────────────────────────────────

  async listVariants(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<ProductVariant[]> {
    const productId = params['productId'] ?? params['product_id']
    if (!productId) {
      throw new Error('PlentyONE requires ?product_id= for listVariants (variations are nested under items)')
    }
    const res = await this.client(credentials).listWithPage<RawPlentyOneVariation>(
      `/items/${String(productId)}/variations`,
      { ...this.listParams(params), with: 'variationSalesPrices,variationAttributeValues' },
    )
    return res.items.map(transformVariation)
  }

  async getVariant(credentials: Credentials, id: string): Promise<ProductVariant> {
    const [itemId, variationId] = id.split(':')
    if (!itemId || !variationId) {
      throw new Error('Invalid variant id format: expected `itemId:variationId`')
    }
    const raw = await this.client(credentials).get<RawPlentyOneVariation>(
      `/items/${itemId}/variations/${variationId}`,
      { with: 'variationSalesPrices,variationAttributeValues' },
    )
    return transformVariation(raw)
  }

  async updateVariant(
    credentials: Credentials,
    id: string,
    data: Partial<ProductVariant>,
  ): Promise<ProductVariant> {
    const [itemId, variationId] = id.split(':')
    if (!itemId || !variationId) {
      throw new Error('Invalid variant id format: expected `itemId:variationId`')
    }
    const raw = await this.client(credentials).put<RawPlentyOneVariation>(
      `/items/${itemId}/variations/${variationId}`,
      untransformVariation(data),
    )
    return transformVariation(raw)
  }

  // ── Collections (Categories) ──────────────────────────────────────────────

  async listCollections(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<Collection[]> {
    const res = await this.client(credentials).listWithPage<RawPlentyOneCategory>(
      '/categories',
      { ...this.listParams(params), type: 'item', with: 'details' },
    )
    return res.items.map(transformCategory)
  }

  async getCollection(credentials: Credentials, id: string): Promise<Collection> {
    const raw = await this.client(credentials).get<RawPlentyOneCategory>(
      `/categories/${id}`,
      { with: 'details' },
    )
    return transformCategory(raw)
  }

  async createCollection(
    credentials: Credentials,
    data: Partial<Collection>,
  ): Promise<Collection> {
    const raw = await this.client(credentials).post<RawPlentyOneCategory>(
      '/categories',
      untransformCategory(data),
    )
    return transformCategory(raw)
  }

  async updateCollection(
    credentials: Credentials,
    id: string,
    data: Partial<Collection>,
  ): Promise<Collection> {
    const raw = await this.client(credentials).put<RawPlentyOneCategory>(
      `/categories/${id}`,
      untransformCategory(data),
    )
    return transformCategory(raw)
  }

  async deleteCollection(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`/categories/${id}`)
  }

  // ── Locations (Warehouses) ────────────────────────────────────────────────

  async listLocations(credentials: Credentials, params: QueryParams): Promise<Location[]> {
    // GET /rest/stockmanagement/warehouses documents only `with` and
    // `sortingOrder` — no page/itemsPerPage — and answers with a plain
    // Collection of every warehouse. Fetch it once, whole, and cut the
    // caller's page locally. The Collection has no documented example, so
    // read a bare array and an `entries` envelope alike. Every caller page
    // refetches the list, so pin the documented `sortingOrder[id]=asc`
    // instead of trusting the unspecified "natural order" to hold between
    // requests; otherwise the windows could skip or repeat rows.
    const res = await this.client(credentials).get<
      RawPlentyOneWarehouse[] | { entries?: RawPlentyOneWarehouse[] }
    >('/stockmanagement/warehouses', { 'sortingOrder[id]': 'asc' })
    const rows = Array.isArray(res) ? res : (res?.entries ?? [])
    return pageLocally(rows.map(transformWarehouse), params)
  }

  async getLocation(credentials: Credentials, id: string): Promise<Location> {
    const raw = await this.client(credentials).get<RawPlentyOneWarehouse>(
      `/stockmanagement/warehouses/${id}`,
    )
    return transformWarehouse(raw)
  }

  // ── Inventory ─────────────────────────────────────────────────────────────

  async listInventoryLevels(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<InventoryLevel[]> {
    const variationId = params['variationId'] ?? params['variantId']
    const itemId = params['itemId'] ?? params['productId']

    if (variationId && itemId) {
      // Fetch stock for a specific variation across all warehouses.
      const res = await this.client(credentials).listWithPage<RawPlentyOneStock>(
        `/items/${String(itemId)}/variations/${String(variationId)}/stock`,
        this.listParams(params),
      )
      return res.items.map(transformStock)
    }

    // Fallback: bulk stock listing endpoint.
    // GET /rest/stockmanagement/stock returns all stock across warehouses.
    // (GET /rest/stockmanagement/stock/redistribution is a redistribution-proposal
    //  endpoint, not a stock-listing endpoint.)
    const warehouseId = params['warehouseId'] ?? params['locationId']
    const extra: Record<string, unknown> = this.listParams(params)
    if (warehouseId) extra['warehouseId'] = warehouseId
    const res = await this.client(credentials).listWithPage<RawPlentyOneStock>(
      '/stockmanagement/stock',
      extra,
    )
    return res.items.map(transformStock)
  }

  async setInventoryLevel(
    credentials: Credentials,
    data: { variantId: string; locationId: string; available: number },
  ): Promise<InventoryLevel> {
    // PlentyONE stock correction endpoint: POST /rest/stockmanagement/stock/correction
    const [itemId, variationId] = data.variantId.split(':')
    if (!itemId || !variationId) {
      throw new Error(
        'PlentyONE setInventoryLevel requires composite variantId `itemId:variationId`',
      )
    }
    const raw = await this.client(credentials).post<RawPlentyOneStock>(
      '/stockmanagement/stock/correction',
      {
        variationId: Number(variationId),
        warehouseId: Number(data.locationId),
        quantity: data.available,
        reason: 1, // stocktaking correction
      },
    )
    return transformStock({
      variationId: Number(variationId),
      warehouseId: Number(data.locationId),
      netStock: data.available,
      physicalStock: data.available,
      ...raw,
    })
  }

  // ── Customers (Contacts) ──────────────────────────────────────────────────

  async listCustomers(credentials: Credentials, params: QueryParams): Promise<Customer[]> {
    const res = await this.client(credentials).listWithPage<RawPlentyOneContact>(
      '/accounts/contacts',
      this.listParams(params),
    )
    return res.items.map(transformContact)
  }

  async getCustomer(credentials: Credentials, id: string): Promise<Customer> {
    const raw = await this.client(credentials).get<RawPlentyOneContact>(
      `/accounts/contacts/${id}`,
    )
    return transformContact(raw)
  }

  async createCustomer(
    credentials: Credentials,
    data: Partial<Customer>,
  ): Promise<Customer> {
    const raw = await this.client(credentials).post<RawPlentyOneContact>(
      '/accounts/contacts',
      untransformContact(data),
    )
    return transformContact(raw)
  }

  async updateCustomer(
    credentials: Credentials,
    id: string,
    data: Partial<Customer>,
  ): Promise<Customer> {
    const raw = await this.client(credentials).put<RawPlentyOneContact>(
      `/accounts/contacts/${id}`,
      untransformContact(data),
    )
    return transformContact(raw)
  }

  async deleteCustomer(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`/accounts/contacts/${id}`)
  }

  // ── Orders ────────────────────────────────────────────────────────────────

  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const extra: Record<string, unknown> = {
      ...this.listParams(params),
      typeId: 1, // sales orders only
      with: 'amounts,orderItems,billingAddress,deliveryAddress',
    }
    if (params.updatedAfter) {
      extra['updatedAtFrom'] = params.updatedAfter.toISOString()
    }
    const res = await this.client(credentials).post<{ entries: RawPlentyOneOrder[]; isLastPage: boolean; page: number; totalsCount: number }>(
      '/orders/search',
      extra,
    )
    const entries = res.entries ?? []
    return entries.map(transformOrder)
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const raw = await this.client(credentials).get<RawPlentyOneOrder>(
      `/orders/${id}`,
      { with: 'amounts,orderItems,billingAddress,deliveryAddress' },
    )
    return transformOrder(raw)
  }

  async createOrder(credentials: Credentials, data: Partial<Order>): Promise<Order> {
    const raw = await this.client(credentials).post<RawPlentyOneOrder>(
      '/orders',
      untransformOrder(data),
    )
    return transformOrder(raw)
  }

  async updateOrder(
    credentials: Credentials,
    id: string,
    data: Partial<Order>,
  ): Promise<Order> {
    const raw = await this.client(credentials).put<RawPlentyOneOrder>(
      `/orders/${id}`,
      untransformOrder(data),
    )
    return transformOrder(raw)
  }

  async cancelOrder(
    credentials: Credentials,
    id: string,
    _data?: { reason?: string },
  ): Promise<Order> {
    // Cancellation in PlentyONE = set statusId to 8 (cancelled)
    const raw = await this.client(credentials).put<RawPlentyOneOrder>(
      `/orders/${id}`,
      { statusId: 8 },
    )
    return transformOrder(raw)
  }

  // ── Fulfillments (Shipping Packages) ──────────────────────────────────────

  async listFulfillments(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<Fulfillment[]> {
    const orderId = params['order_id'] ?? params['orderId']
    if (!orderId) {
      throw new Error('listFulfillments requires `order_id` in query params')
    }
    const oid = String(orderId)
    const res = await this.client(credentials).listWithPage<RawPlentyOneShippingPackage>(
      `/orders/${oid}/shipping/packages`,
      this.listParams(params),
    )
    return res.items.map((pkg) => transformShippingPackage(pkg, oid))
  }

  async getFulfillment(credentials: Credentials, id: string): Promise<Fulfillment> {
    const [orderId, packageId] = id.split(':')
    if (!orderId || !packageId) {
      throw new Error('Invalid fulfillment id format: expected `orderId:packageId`')
    }
    const raw = await this.client(credentials).get<RawPlentyOneShippingPackage>(
      `/orders/${orderId}/shipping/packages/${packageId}`,
    )
    return transformShippingPackage(raw, orderId)
  }

  async createFulfillment(
    credentials: Credentials,
    data: Partial<Fulfillment>,
  ): Promise<Fulfillment> {
    if (!data.orderId) throw new Error('createFulfillment requires orderId')
    const raw = await this.client(credentials).post<RawPlentyOneShippingPackage>(
      `/orders/${data.orderId}/shipping/packages`,
      untransformShippingPackage(data),
    )
    return transformShippingPackage(raw, data.orderId)
  }

  async cancelFulfillment(credentials: Credentials, id: string): Promise<Fulfillment> {
    const [orderId, packageId] = id.split(':')
    if (!orderId || !packageId) {
      throw new Error('Invalid fulfillment id format: expected `orderId:packageId`')
    }
    await this.client(credentials).delete(
      `/orders/${orderId}/shipping/packages/${packageId}`,
    )
    // Return a minimal representation — the package no longer exists.
    return {
      id,
      orderId,
      status: 'CANCELLED',
      metadata: {},
    }
  }

  // ── Refunds (Credit Notes) ────────────────────────────────────────────────

  async listRefunds(credentials: Credentials, params: QueryParams): Promise<Refund[]> {
    const orderId = params['order_id'] ?? params['orderId']
    if (!orderId) {
      throw new Error('listRefunds requires `order_id` in query params')
    }
    const oid = String(orderId)
    const res = await this.client(credentials).post<{ entries: RawPlentyOneCreditNote[]; isLastPage: boolean; page: number; totalsCount: number }>(
      '/orders/search',
      {
        ...this.listParams(params),
        typeId: 4, // credit note
        referenceOrderId: Number(oid),
        with: 'amounts,orderItems,orderReferences',
      },
    )
    return (res.entries ?? []).map((cn) => transformCreditNote(cn, oid))
  }

  async getRefund(credentials: Credentials, id: string): Promise<Refund> {
    const raw = await this.client(credentials).get<RawPlentyOneCreditNote>(
      `/orders/${id}`,
      { with: 'amounts,orderItems,orderReferences' },
    )
    return transformCreditNote(raw)
  }

  async createRefund(credentials: Credentials, data: Partial<Refund>): Promise<Refund> {
    if (!data.orderId) throw new Error('createRefund requires orderId')
    const raw = await this.client(credentials).post<RawPlentyOneCreditNote>(
      '/orders',
      untransformCreditNote(data),
    )
    return transformCreditNote(raw, data.orderId)
  }

  // ── Transactions (Payments) ───────────────────────────────────────────────

  async listTransactions(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<Transaction[]> {
    const orderId = params['order_id'] ?? params['orderId']
    if (!orderId) {
      throw new Error('listTransactions requires `order_id` in query params')
    }
    const oid = String(orderId)
    const res = await this.client(credentials).listWithPage<RawPlentyOnePayment>(
      '/payments',
      { ...this.listParams(params), orderId: Number(oid) },
    )
    return res.items.map((p) => transformPayment(p, oid))
  }

  async getTransaction(credentials: Credentials, id: string): Promise<Transaction> {
    const raw = await this.client(credentials).get<RawPlentyOnePayment>(`/payments/${id}`)
    return transformPayment(raw)
  }

  async createTransaction(
    credentials: Credentials,
    data: Partial<Transaction>,
  ): Promise<Transaction> {
    if (!data.orderId) throw new Error('createTransaction requires orderId')
    const raw = await this.client(credentials).post<RawPlentyOnePayment>(
      '/payments',
      untransformPayment(data),
    )
    return transformPayment(raw, data.orderId)
  }

  // ── Discounts (Coupon Campaigns) ──────────────────────────────────────────

  async listDiscounts(credentials: Credentials, params: QueryParams): Promise<Discount[]> {
    const client = this.client(credentials)
    const res = await client.listWithPage<RawPlentyOneCouponCampaign>(
      '/coupons/campaigns',
      this.listParams(params),
    )
    // Fetch the first coupon code for each campaign in parallel.
    const withCodes = await Promise.all(
      res.items.map(async (campaign) => {
        try {
          const cr = await client.listWithPage<RawPlentyOneCouponCode>(
            '/coupons/codes',
            { campaignId: campaign.id, itemsPerPage: 1 },
          )
          return transformCampaign(campaign, cr.items[0])
        } catch {
          return transformCampaign(campaign)
        }
      }),
    )
    return withCodes
  }

  async getDiscount(credentials: Credentials, id: string): Promise<Discount> {
    const client = this.client(credentials)
    const campaign = await client.get<RawPlentyOneCouponCampaign>(`/coupons/campaigns/${id}`)
    let code: RawPlentyOneCouponCode | undefined
    try {
      const cr = await client.listWithPage<RawPlentyOneCouponCode>(
        '/coupons/codes',
        { campaignId: id, itemsPerPage: 1 },
      )
      code = cr.items[0]
    } catch {
      /* no codes */
    }
    return transformCampaign(campaign, code)
  }

  async createDiscount(
    credentials: Credentials,
    data: Partial<Discount>,
  ): Promise<Discount> {
    const campaign = await this.client(credentials).post<RawPlentyOneCouponCampaign>(
      '/coupons/campaigns',
      untransformCampaign(data),
    )
    return transformCampaign(campaign)
  }

  async updateDiscount(
    credentials: Credentials,
    id: string,
    data: Partial<Discount>,
  ): Promise<Discount> {
    const campaign = await this.client(credentials).put<RawPlentyOneCouponCampaign>(
      `/coupons/campaigns/${id}`,
      untransformCampaign(data),
    )
    return transformCampaign(campaign)
  }

  async deleteDiscount(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`/coupons/campaigns/${id}`)
  }
}
