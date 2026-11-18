/**
 * Orderbot inventory adapter.
 *
 * Orderbot is a cloud-based OMS / IMS serving multi-channel retailers.
 * REST API base: https://api-beta.orderbot.com
 *
 * Auth flow:
 *   GET /accesstoken with HTTP Basic (email:password) → { token: string }
 *   Subsequent calls: Authorization: Bearer <token>  (token TTL ~5 min)
 *
 * Pagination: query param `page` (1-based); `x-total-pages` response header.
 *
 * Supported resources (confirmed from public API + integrator docs):
 *   - products           → GET /products
 *   - stock-levels       → GET /inventory
 *   - locations          → GET /distribution_centers
 *   - suppliers          → GET /suppliers
 *   - purchase-orders    → GET /purchase_orders
 *   - stock-transfers    → GET /stock_transfers
 *   - stock-adjustments  → GET /stock_adjustments
 *
 * No public HMAC/JWT webhook signing documented; webhook.ts is omitted.
 */
import type { CredentialField, Credentials, QueryParams } from '@opensteward/shared'
import type { InventoryAdapter } from '../../adapter/interface'
import type { Product } from '../../schema/product'
import type { StockLevel } from '../../schema/stock-level'
import type { Location } from '../../schema/location'
import type { Supplier } from '../../schema/supplier'
import type { PurchaseOrder } from '../../schema/purchase-order'
import type { StockTransfer } from '../../schema/stock-transfer'
import type { StockAdjustment } from '../../schema/stock-adjustment'

import {
  credentialFields as orderbotCredentialFields,
  exchangeCredentials as orderbotExchangeCredentials,
  getAuthUrlUnsupported,
} from './auth'
import {OrderbotClient} from './client'
import {DEFAULT_PAGE_SIZE} from './constants'

import {transformProduct, type RawOrderbotProduct} from './transform/product'
import {transformStockLevel, type RawOrderbotInventory} from './transform/stock-level'
import {transformLocation, type RawOrderbotLocation} from './transform/location'
import {transformSupplier, type RawOrderbotSupplier} from './transform/supplier'
import {transformPurchaseOrder, type RawOrderbotPurchaseOrder} from './transform/purchase-order'
import {transformStockTransfer, type RawOrderbotStockTransfer} from './transform/stock-transfer'
import {
  transformStockAdjustment,
  type RawOrderbotStockAdjustment,
} from './transform/stock-adjustment'

export type OrderbotAdapterConfig = Record<string, never>

function listParams(params: QueryParams): Record<string, unknown> {
  return {
    per_page: params.limit ?? DEFAULT_PAGE_SIZE,
    ...(params.page !== undefined ? { page: params.page } : {}),
  }
}

export class OrderbotAdapter implements InventoryAdapter {
  readonly platform = 'orderbot'
  readonly version = '0.1.0'

  constructor(_config?: OrderbotAdapterConfig) {}

  credentialFields(): CredentialField[] {
    return orderbotCredentialFields()
  }

  async exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
    return orderbotExchangeCredentials(fields)
  }

  getAuthUrl(_state: string, _scopes?: string[]): string {
    return getAuthUrlUnsupported()
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    throw new Error('orderbot uses email + password credentials; use credentialFields() instead')
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    // Token refresh is handled transparently by the client's internal cache.
    return credentials
  }

  private client(credentials: Credentials): OrderbotClient {
    return new OrderbotClient(credentials)
  }

  // ── Products ──────────────────────────────────────────────────────────────

  async listProducts(credentials: Credentials, params: QueryParams): Promise<Product[]> {
    const { data } = await this.client(credentials).get<RawOrderbotProduct[]>(
      '/products',
      listParams(params),
    )
    return (Array.isArray(data) ? data : []).map(transformProduct)
  }

  async getProduct(credentials: Credentials, id: string): Promise<Product> {
    const { data } = await this.client(credentials).get<RawOrderbotProduct>(`/products/${id}`)
    return transformProduct(data)
  }

  // ── Stock Levels ──────────────────────────────────────────────────────────

  async listStockLevels(credentials: Credentials, params: QueryParams): Promise<StockLevel[]> {
    const { data } = await this.client(credentials).get<RawOrderbotInventory[]>(
      '/inventory',
      listParams(params),
    )
    return (Array.isArray(data) ? data : []).map(transformStockLevel)
  }

  async getStockLevel(_credentials: Credentials, id: string): Promise<StockLevel> {
    // Orderbot inventory is fetched in bulk; single-record fetch is not
    // publicly documented.
    throw new Error(`orderbot stock-level lookup is bulk-only; call listStockLevels. id=${id}`)
  }

  // ── Locations (Distribution Centers) ─────────────────────────────────────

  async listLocations(credentials: Credentials, params: QueryParams): Promise<Location[]> {
    const { data } = await this.client(credentials).get<RawOrderbotLocation[]>(
      '/distribution_centers',
      listParams(params),
    )
    return (Array.isArray(data) ? data : []).map(transformLocation)
  }

  async getLocation(credentials: Credentials, id: string): Promise<Location> {
    const { data } = await this.client(credentials).get<RawOrderbotLocation>(
      `/distribution_centers/${id}`,
    )
    return transformLocation(data)
  }

  // ── Suppliers ─────────────────────────────────────────────────────────────

  async listSuppliers(credentials: Credentials, params: QueryParams): Promise<Supplier[]> {
    const { data } = await this.client(credentials).get<RawOrderbotSupplier[]>(
      '/suppliers',
      listParams(params),
    )
    return (Array.isArray(data) ? data : []).map(transformSupplier)
  }

  async getSupplier(credentials: Credentials, id: string): Promise<Supplier> {
    const { data } = await this.client(credentials).get<RawOrderbotSupplier>(`/suppliers/${id}`)
    return transformSupplier(data)
  }

  // ── Purchase Orders ───────────────────────────────────────────────────────

  async listPurchaseOrders(credentials: Credentials, params: QueryParams): Promise<PurchaseOrder[]> {
    const { data } = await this.client(credentials).get<RawOrderbotPurchaseOrder[]>(
      '/purchase_orders',
      listParams(params),
    )
    return (Array.isArray(data) ? data : []).map(transformPurchaseOrder)
  }

  async getPurchaseOrder(credentials: Credentials, id: string): Promise<PurchaseOrder> {
    const { data } = await this.client(credentials).get<RawOrderbotPurchaseOrder>(
      `/purchase_orders/${id}`,
    )
    return transformPurchaseOrder(data)
  }

  // ── Stock Transfers ───────────────────────────────────────────────────────

  async listStockTransfers(credentials: Credentials, params: QueryParams): Promise<StockTransfer[]> {
    const { data } = await this.client(credentials).get<RawOrderbotStockTransfer[]>(
      '/stock_transfers',
      listParams(params),
    )
    return (Array.isArray(data) ? data : []).map(transformStockTransfer)
  }

  async getStockTransfer(credentials: Credentials, id: string): Promise<StockTransfer> {
    const { data } = await this.client(credentials).get<RawOrderbotStockTransfer>(
      `/stock_transfers/${id}`,
    )
    return transformStockTransfer(data)
  }

  // ── Stock Adjustments ─────────────────────────────────────────────────────

  async listStockAdjustments(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<StockAdjustment[]> {
    const { data } = await this.client(credentials).get<RawOrderbotStockAdjustment[]>(
      '/stock_adjustments',
      listParams(params),
    )
    return (Array.isArray(data) ? data : []).map(transformStockAdjustment)
  }

  async getStockAdjustment(credentials: Credentials, id: string): Promise<StockAdjustment> {
    const { data } = await this.client(credentials).get<RawOrderbotStockAdjustment>(
      `/stock_adjustments/${id}`,
    )
    return transformStockAdjustment(data)
  }
}
