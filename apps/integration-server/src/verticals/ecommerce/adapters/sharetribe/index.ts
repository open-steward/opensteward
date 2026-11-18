/**
 * Sharetribe adapter for the ecommerce vertical.
 *
 * Sharetribe is a peer-to-peer marketplace platform. Its Integration API
 * exposes resources that map to canonical ecommerce types:
 *
 *   listings          → Product        (marketplace items for sale/rent)
 *   users             → Customer       (buyers and sellers)
 *   transactions      → Order          (marketplace exchanges)
 *   stock_adjustments → InventoryLevel (listing-level stock, no multi-location)
 *
 * Auth: OAuth2 client_credentials grant — no per-user authorization URL.
 * Tokens expire in ~1 hour; refreshed automatically via refresh_token or
 * re-issued via client_credentials when none is available.
 *
 * Docs: https://www.sharetribe.com/api-reference/integration.html
 *
 * ── Resource coverage ──────────────────────────────────────────────────────
 * Unavailable: collection   — Sharetribe has no collection/category concept in its API
 * Unavailable: discount     — No discount/coupon endpoints in Integration API
 * Unavailable: fulfillment  — Sharetribe is a marketplace platform; no shipping fulfillment API
 * Unavailable: location     — No warehouse/location concept; stock is listing-level only
 * Unavailable: refund       — Refunds are operator actions inside the transaction process (Stripe only); no dedicated refund endpoint
 * Unavailable: transaction  — Canonical payment-ledger transactions not exposed; payin/payout embedded in Orders
 */

import type { Credentials, QueryParams } from '@opensteward/shared'
import type { EcommerceAdapter } from '../../adapter/interface'
import type { Product } from '../../schema/product'
import type { Customer } from '../../schema/customer'
import type { Order } from '../../schema/order'
import type { InventoryLevel } from '../../schema/inventory'

import { fetchClientCredentialsToken, refreshToken as doRefreshToken } from './auth'
import { SharetribeClient } from './client'
import { DEFAULT_PAGE_SIZE } from './constants'

import {
  transformListing,
  untransformListing,
  type RawSharetribeListing,
} from './transform/product'
import {
  transformUser,
  untransformUser,
  type RawSharetribeUser,
} from './transform/customer'
import {
  transformTransaction,
  type RawSharetribeTransaction,
} from './transform/order'
import {
  transformStockAdjustment,
  type RawSharetribeStockAdjustment,
} from './transform/inventory'

export interface SharetribeAdapterConfig {
  clientId: string
  clientSecret: string
}

export class SharetribeAdapter implements EcommerceAdapter {
  readonly platform = 'sharetribe'
  readonly version = '0.1.0'

  private clientId: string
  private clientSecret: string

  constructor(config: SharetribeAdapterConfig) {
    this.clientId = config.clientId
    this.clientSecret = config.clientSecret
  }

  // ── Auth ──────────────────────────────────────────────────────────────────

  /**
   * Sharetribe Integration API uses client_credentials — there is no
   * per-user authorization URL. Return an empty string so the registry
   * can still call this without throwing.
   */
  getAuthUrl(_state: string): string {
    return ''
  }

  /**
   * `exchangeCode` is not applicable for client_credentials flow.
   * Issue a fresh Integration API token from the stored client credentials.
   */
  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    return fetchClientCredentialsToken(this.clientId, this.clientSecret)
  }

  /**
   * Refresh an expired access token. Uses the stored refresh_token if
   * available, otherwise re-issues via client_credentials.
   */
  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return doRefreshToken(credentials, this.clientId, this.clientSecret)
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private client(credentials: Credentials): SharetribeClient {
    return new SharetribeClient(credentials)
  }

  /** Build Sharetribe page-based list params from canonical QueryParams. */
  private listParams(params: QueryParams): Record<string, unknown> {
    const out: Record<string, unknown> = {
      perPage: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, 100),
    }
    const page = params['page']
    if (page) out.page = page
    if (params.updatedAfter) {
      out.updatedAtStart = params.updatedAfter.toISOString()
    }
    return out
  }

  // ── Inventory (StockAdjustments) ─────────────────────────────────────────
  //
  // Sharetribe tracks stock at listing level via stockAdjustments (deltas).
  // There is no multi-location concept; each adjustment is tied to a listing.
  // We map each adjustment to a canonical InventoryLevel (one per adjustment).

  async listInventoryLevels(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<InventoryLevel[]> {
    const result = await this.client(credentials).list<RawSharetribeStockAdjustment>(
      '/stock_adjustments/query',
      this.listParams(params),
    )
    return result.items.map(transformStockAdjustment)
  }

  async getInventoryLevel(credentials: Credentials, id: string): Promise<InventoryLevel> {
    // Sharetribe has no single-adjustment show endpoint; query by listingId
    // and return the most-recent adjustment for that listing.
    const result = await this.client(credentials).list<RawSharetribeStockAdjustment>(
      '/stock_adjustments/query',
      { listingId: id, perPage: 1 },
    )
    const item = result.items[0]
    if (!item) {
      throw new Error(`No stock adjustments found for listing ${id}`)
    }
    return transformStockAdjustment(item)
  }

  // ── Products (Listings) ───────────────────────────────────────────────────

  async listProducts(credentials: Credentials, params: QueryParams): Promise<Product[]> {
    const result = await this.client(credentials).list<RawSharetribeListing>(
      '/listings/query',
      this.listParams(params),
    )
    return result.items.map(transformListing)
  }

  async getProduct(credentials: Credentials, id: string): Promise<Product> {
    const listing = await this.client(credentials).get<RawSharetribeListing>(
      '/listings/show',
      { id },
    )
    return transformListing(listing)
  }

  async createProduct(credentials: Credentials, data: Partial<Product>): Promise<Product> {
    const listing = await this.client(credentials).post<RawSharetribeListing>(
      '/listings/create',
      untransformListing(data),
    )
    return transformListing(listing)
  }

  async updateProduct(
    credentials: Credentials,
    id: string,
    data: Partial<Product>,
  ): Promise<Product> {
    const body = { id, ...untransformListing(data) }
    const listing = await this.client(credentials).post<RawSharetribeListing>(
      '/listings/update',
      body,
    )
    return transformListing(listing)
  }

  /**
   * Sharetribe does not hard-delete listings; closing (archiving) is the
   * closest equivalent. Calls `/listings/close`.
   */
  async deleteProduct(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).post<RawSharetribeListing>('/listings/close', { id })
  }

  // ── Customers (Users) ─────────────────────────────────────────────────────

  async listCustomers(credentials: Credentials, params: QueryParams): Promise<Customer[]> {
    const result = await this.client(credentials).list<RawSharetribeUser>(
      '/users/query',
      this.listParams(params),
    )
    return result.items.map(transformUser)
  }

  async getCustomer(credentials: Credentials, id: string): Promise<Customer> {
    const user = await this.client(credentials).get<RawSharetribeUser>('/users/show', { id })
    return transformUser(user)
  }

  async updateCustomer(
    credentials: Credentials,
    id: string,
    data: Partial<Customer>,
  ): Promise<Customer> {
    const body = { id, ...untransformUser(data) }
    const user = await this.client(credentials).post<RawSharetribeUser>(
      '/users/update_profile',
      body,
    )
    return transformUser(user)
  }

  // ── Orders (Transactions) ─────────────────────────────────────────────────

  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const result = await this.client(credentials).list<RawSharetribeTransaction>(
      '/transactions/query',
      this.listParams(params),
    )
    return result.items.map(transformTransaction)
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const txn = await this.client(credentials).get<RawSharetribeTransaction>(
      '/transactions/show',
      { id },
    )
    return transformTransaction(txn)
  }
}
