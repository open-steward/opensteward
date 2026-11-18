/**
 * Prediko adapter — AI-powered inventory management for Shopify brands.
 *
 * Auth: Bearer API key (Settings > API Keys in the Prediko dashboard).
 * Supported resources: products (SKUs), stock levels (per warehouse),
 *   locations (warehouses), suppliers, purchase orders.
 * Not supported: stock transfers, stock adjustments (no API endpoints).
 * Webhooks: not implemented (no documented HMAC/JWT signing).
 *
 * ── Resource coverage ──────────────────────────────────────────────
 * Unavailable: stock-adjustment — Prediko API has no stock-adjustment endpoints (confirmed via api.prediko.io/docs/api-reference)
 * Unavailable: stock-transfer — Prediko API has no stock-transfer endpoints (confirmed via api.prediko.io/docs/api-reference)
 */
import { pageLocally, type CredentialField, type Credentials, type QueryParams } from '@opensteward/shared'
import type { InventoryAdapter } from '../../adapter/interface'
import type { Product } from '../../schema/product'
import type { StockLevel } from '../../schema/stock-level'
import type { Location } from '../../schema/location'
import type { Supplier } from '../../schema/supplier'
import type { PurchaseOrder } from '../../schema/purchase-order'

import {
  credentialFields as predikoCredentialFields,
  exchangeCredentials as predikoExchangeCredentials,
  getAuthUrlUnsupported,
} from './auth'
import {PredikoClient} from './client'
import {DEFAULT_PAGE_SIZE} from './constants'

import {transformProduct, type RawPredikoSku} from './transform/product'
import {transformStockLevel, type RawPredikoSkuLocation} from './transform/stock-level'
import {transformLocation, type RawPredikoWarehouse} from './transform/location'
import {transformSupplier, type RawPredikoSupplier} from './transform/supplier'
import {transformPurchaseOrder, type RawPredikoOrder} from './transform/purchase-order'

export type PredikoAdapterConfig = Record<string, never>

/** Response envelope for GET /warehouses and GET /suppliers */
interface ListDataResponse<T> { data?: T[]; total?: number }

/** Response envelope for GET /orders */
interface OrdersResponse { data?: RawPredikoOrder[]; total?: number }

/** Response envelope for POST /skus */
interface SkusResponse<T> {
  pagination?: { total: number; limit: number; offset: number; has_more: boolean }
  data?: T[]
}

/**
 * Rows in id order, ready to slice by position.
 *
 * GET /warehouses, /suppliers and /orders document no sort order, and every
 * caller page re-fetches the whole list. Sliced in the platform's order, a
 * row that moved between two pages of one walk (an unordered read commonly
 * returns an updated row last) shifted every row after it: one was skipped and
 * another served twice. Ids are immutable UUIDs, so while the membership
 * holds, each row keeps its position across requests.
 */
function inIdOrder<T extends { id: string }>(rows: T[]): T[] {
  return rows.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
}

/**
 * The query for GET /orders: `updated_after` is the one documented filter
 * that QueryParams carries ("Orders updated after this timestamp (ISO 8601
 * format, e.g., 2025-01-15T10:30:00Z)"). Filtered upstream, the list is exactly
 * the matching orders, so the total pageLocally reports counts those orders
 * and not the whole collection. It is sent in the documented format,
 * whole seconds. Dropping the milliseconds moves the bound earlier, so the
 * filter can only widen and never loses an order.
 */
function ordersQuery(params: QueryParams): Record<string, string> | undefined {
  if (!params.updatedAfter) return undefined
  return { updated_after: params.updatedAfter.toISOString().replace(/\.\d{3}Z$/, 'Z') }
}

export class PredikoAdapter implements InventoryAdapter {
  readonly platform = 'prediko'
  readonly version = '0.1.0'

  constructor(_config: PredikoAdapterConfig) {}

  credentialFields(): CredentialField[] {
    return predikoCredentialFields()
  }

  async exchangeCredentials(fields: Record<string, string>) {
    return predikoExchangeCredentials(fields)
  }

  getAuthUrl(_state: string, _scopes?: string[]): string {
    return getAuthUrlUnsupported()
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    throw new Error('prediko uses a static API key; use credentialFields() instead')
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return credentials
  }

  private client(credentials: Credentials): PredikoClient {
    return new PredikoClient(credentials)
  }

  private paginationParams(params: QueryParams): { limit: number; offset: number } {
    const limit = params.limit ?? DEFAULT_PAGE_SIZE
    const offset = params.page !== undefined ? (params.page - 1) * limit : 0
    return { limit, offset }
  }

  async listProducts(credentials: Credentials, params: QueryParams): Promise<Product[]> {
    const { limit, offset } = this.paginationParams(params)
    const res = await this.client(credentials).post<SkusResponse<RawPredikoSku>>(
      '/skus',
      {},
      { limit, offset, aggregation_level: 'SKU' },
    )
    return (res.data ?? []).map(transformProduct)
  }

  async getProduct(_credentials: Credentials, id: string): Promise<Product> {
    throw new Error(`prediko does not support single-SKU fetch; call listProducts. id=${id}`)
  }

  async listStockLevels(credentials: Credentials, params: QueryParams): Promise<StockLevel[]> {
    const { limit, offset } = this.paginationParams(params)
    const res = await this.client(credentials).post<SkusResponse<RawPredikoSkuLocation>>(
      '/skus',
      {},
      { limit, offset, aggregation_level: 'SKU_LOCATION' },
    )
    return (res.data ?? []).map(transformStockLevel)
  }

  async getStockLevel(_credentials: Credentials, id: string): Promise<StockLevel> {
    throw new Error(`prediko stock-level fetch is bulk-only; call listStockLevels. id=${id}`)
  }

  // GET /warehouses, /suppliers and /orders take no paging parameter and
  // return the whole collection: "The SKUs endpoint is the only paginated
  // endpoint in the Prediko API. All other endpoints (Orders, Suppliers,
  // Locations) return complete result sets." (api.prediko.io/docs/guides/pagination/)
  // Each list is therefore put in id order and sliced into the caller's page here.

  async listLocations(credentials: Credentials, params: QueryParams): Promise<Location[]> {
    const res = await this.client(credentials).get<ListDataResponse<RawPredikoWarehouse>>('/warehouses')
    return pageLocally(inIdOrder((res.data ?? []).map(transformLocation)), params)
  }

  async getLocation(credentials: Credentials, id: string): Promise<Location> {
    const res = await this.client(credentials).get<ListDataResponse<RawPredikoWarehouse>>('/warehouses')
    const found = (res.data ?? []).find((w) => w.id === id)
    if (!found) throw new Error(`prediko warehouse ${id} not found`)
    return transformLocation(found)
  }

  async listSuppliers(credentials: Credentials, params: QueryParams): Promise<Supplier[]> {
    const res = await this.client(credentials).get<ListDataResponse<RawPredikoSupplier>>('/suppliers')
    return pageLocally(inIdOrder((res.data ?? []).map(transformSupplier)), params)
  }

  async getSupplier(credentials: Credentials, id: string): Promise<Supplier> {
    const res = await this.client(credentials).get<ListDataResponse<RawPredikoSupplier>>('/suppliers')
    const found = (res.data ?? []).find((s) => s.id === id)
    if (!found) throw new Error(`prediko supplier ${id} not found`)
    return transformSupplier(found)
  }

  async listPurchaseOrders(credentials: Credentials, params: QueryParams): Promise<PurchaseOrder[]> {
    const res = await this.client(credentials).get<OrdersResponse>('/orders', ordersQuery(params))
    return pageLocally(inIdOrder((res.data ?? []).map(transformPurchaseOrder)), params)
  }

  async getPurchaseOrder(credentials: Credentials, id: string): Promise<PurchaseOrder> {
    const res = await this.client(credentials).get<RawPredikoOrder>(`/orders/${id}`)
    return transformPurchaseOrder(res)
  }
}
