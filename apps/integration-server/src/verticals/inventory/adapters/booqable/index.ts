/**
 * Booqable adapter for the inventory vertical.
 *
 * Booqable is a rental management platform. It exposes product_groups (rentable SKUs),
 * stock_items (individual tracked units), locations, rental orders, and stock_adjustments.
 *
 * Auth: Bearer access token + company slug (subdomain).
 * API: JSON:API v4 at https://{company_slug}.booqable.com/api/4/
 * Pagination: page[number] / page[size] query params.
 *
 * Supported resources:
 *   - products       (product_groups endpoint)
 *   - stockLevels    (stock_items endpoint — one record per physical item)
 *   - locations
 *   - purchaseOrders (orders endpoint — rental orders mapped onto PO schema)
 *   - stockAdjustments
 *
 * Not supported (no equivalent in Booqable):
 *   - suppliers      (Booqable has no vendor/supplier management)
 *   - stockTransfers (Booqable has no warehouse-to-warehouse transfer concept)
 */

// ── Resource coverage ──────────────────────────────────────────────────────────
// Unavailable: supplier      — Booqable has no vendor/supplier management concept; confirmed absent from the full v4 API resource list
// Unavailable: stock-transfer — Booqable has no warehouse-to-warehouse transfer concept; confirmed absent from the full v4 API resource list

import type { CredentialField, Credentials, QueryParams } from '@opensteward/shared'
import type { InventoryAdapter } from '../../adapter/interface'
import type { Product } from '../../schema/product'
import type { StockLevel } from '../../schema/stock-level'
import type { Location } from '../../schema/location'
import type { PurchaseOrder } from '../../schema/purchase-order'
import type { StockAdjustment } from '../../schema/stock-adjustment'

import {
  credentialFields as booqableCredentialFields,
  exchangeCredentials as booqableExchangeCredentials,
  getAuthUrlUnsupported,
} from './auth'
import {BooqableClient} from './client'
import {DEFAULT_PAGE_SIZE} from './constants'

import {transformProduct, type RawBooqableProductGroup} from './transform/product'
import {transformStockLevel, type RawBooqableStockItem} from './transform/stock-level'
import {transformLocation, type RawBooqableLocation} from './transform/location'
import {transformPurchaseOrder, type RawBooqableOrder} from './transform/purchase-order'
import {transformStockAdjustment, type RawBooqableStockAdjustment} from './transform/stock-adjustment'

export interface BooqableAdapterConfig {
  /** Reserved for future OAuth flow support. */
  clientId?: string
  clientSecret?: string
  redirectUri?: string
}

/** Booqable JSON:API list envelope */
interface JsonApiListResponse<T> {
  data: T[]
  links?: { self?: string; first?: string; last?: string; next?: string; prev?: string }
  meta?: Record<string, unknown>
}

/** Booqable JSON:API single-resource envelope */
interface JsonApiSingleResponse<T> {
  data: T
  meta?: Record<string, unknown>
}

export class BooqableAdapter implements InventoryAdapter {
  readonly platform = 'booqable'
  readonly version = '0.1.0'

  constructor(_config: BooqableAdapterConfig) {}

  credentialFields(): CredentialField[] {
    return booqableCredentialFields()
  }

  async exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
    return booqableExchangeCredentials(fields)
  }

  getAuthUrl(_state: string, _scopes?: string[]): string {
    return getAuthUrlUnsupported()
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    throw new Error('booqable uses a static access token; use credentialFields() instead')
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return credentials
  }

  private client(credentials: Credentials): BooqableClient {
    return new BooqableClient(credentials)
  }

  private pageParams(params: QueryParams): Record<string, unknown> {
    return {
      'page[number]': params.page ?? 1,
      'page[size]': params.limit ?? DEFAULT_PAGE_SIZE,
    }
  }

  // ── Products (product_groups) ──────────────────────────────────────────────

  async listProducts(credentials: Credentials, params: QueryParams): Promise<Product[]> {
    const res = await this.client(credentials).get<JsonApiListResponse<RawBooqableProductGroup>>(
      '/product_groups',
      this.pageParams(params),
    )
    return (res.data ?? []).map(transformProduct)
  }

  async getProduct(credentials: Credentials, id: string): Promise<Product> {
    const res = await this.client(credentials).get<JsonApiSingleResponse<RawBooqableProductGroup>>(
      `/product_groups/${id}`,
    )
    return transformProduct(res.data)
  }

  // ── Stock Levels (stock_items) ─────────────────────────────────────────────

  async listStockLevels(credentials: Credentials, params: QueryParams): Promise<StockLevel[]> {
    const res = await this.client(credentials).get<JsonApiListResponse<RawBooqableStockItem>>(
      '/stock_items',
      this.pageParams(params),
    )
    return (res.data ?? []).map(transformStockLevel)
  }

  async getStockLevel(credentials: Credentials, id: string): Promise<StockLevel> {
    const res = await this.client(credentials).get<JsonApiSingleResponse<RawBooqableStockItem>>(
      `/stock_items/${id}`,
    )
    return transformStockLevel(res.data)
  }

  // ── Locations ─────────────────────────────────────────────────────────────

  async listLocations(credentials: Credentials, params: QueryParams): Promise<Location[]> {
    const res = await this.client(credentials).get<JsonApiListResponse<RawBooqableLocation>>(
      '/locations',
      this.pageParams(params),
    )
    return (res.data ?? []).map(transformLocation)
  }

  async getLocation(credentials: Credentials, id: string): Promise<Location> {
    const res = await this.client(credentials).get<JsonApiSingleResponse<RawBooqableLocation>>(
      `/locations/${id}`,
    )
    return transformLocation(res.data)
  }

  // ── Purchase Orders (orders) ───────────────────────────────────────────────

  async listPurchaseOrders(credentials: Credentials, params: QueryParams): Promise<PurchaseOrder[]> {
    const res = await this.client(credentials).get<JsonApiListResponse<RawBooqableOrder>>(
      '/orders',
      this.pageParams(params),
    )
    return (res.data ?? []).map(transformPurchaseOrder)
  }

  async getPurchaseOrder(credentials: Credentials, id: string): Promise<PurchaseOrder> {
    const res = await this.client(credentials).get<JsonApiSingleResponse<RawBooqableOrder>>(
      `/orders/${id}`,
    )
    return transformPurchaseOrder(res.data)
  }

  // ── Stock Adjustments ─────────────────────────────────────────────────────

  async listStockAdjustments(credentials: Credentials, params: QueryParams): Promise<StockAdjustment[]> {
    const res = await this.client(credentials).get<JsonApiListResponse<RawBooqableStockAdjustment>>(
      '/stock_adjustments',
      this.pageParams(params),
    )
    return (res.data ?? []).map(transformStockAdjustment)
  }

  async getStockAdjustment(credentials: Credentials, id: string): Promise<StockAdjustment> {
    const res = await this.client(credentials).get<JsonApiSingleResponse<RawBooqableStockAdjustment>>(
      `/stock_adjustments/${id}`,
    )
    return transformStockAdjustment(res.data)
  }
}
