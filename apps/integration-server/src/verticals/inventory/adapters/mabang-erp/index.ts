/**
 * Mabang ERP adapter — inventory vertical.
 *
 * Mabang (马帮ERP) is a Chinese cross-border e-commerce ERP system.
 * Auth: HMAC-SHA256 per-request signature (developer key pair).
 *   Every POST body includes { developerId, timestamp, action } and is
 *   signed with the developer secret key; signature sent as Authorization header.
 *
 * Supported resources:
 *   - Products          (do-search-stockSku)
 *   - StockLevels       (get-stock-quantity)
 *   - PurchaseOrders    (get-purchase-list)
 *   - StockAdjustments  (get-storage-log-data — in/out storage log)
 *
 * NOT supported (no documented API endpoint):
 *   - Locations      (no warehouse-list action in the Open API; warehouse name/code
 *                     only appear as fields on stock-log records)
 *   - Suppliers      (no supplier list/search action; only do-add-provider and
 *                     get-add-provider-option are documented — both write/create-context)
 *   - StockTransfers (no inter-warehouse transfer listing action; warehouse API covers
 *                     only in/out logs, purchase storage, manual in/out, and counts)
 *   - Webhooks       (not documented)
 *
 * Schema-firewall: no product images, no supplier banking, BOM refused.
 *
 * ── Resource coverage ──────────────────────────────────────────────
 * Unavailable: location      — no warehouse-list endpoint in Open API
 * Unavailable: supplier      — no supplier list/search endpoint in Open API
 * Unavailable: stock-transfer — no inter-warehouse transfer listing endpoint
 */
import type { CredentialField, Credentials, QueryParams } from '@opensteward/shared'
import type { InventoryAdapter } from '../../adapter/interface'
import type { Product } from '../../schema/product'
import type { StockLevel } from '../../schema/stock-level'
import type { PurchaseOrder } from '../../schema/purchase-order'
import type { StockAdjustment } from '../../schema/stock-adjustment'

import {
  credentialFields as mabangCredentialFields,
  exchangeCredentials as mabangExchangeCredentials,
  getAuthUrlUnsupported,
} from './auth'
import {MabangErpClient} from './client'
import {DEFAULT_PAGE, DEFAULT_PAGE_SIZE} from './constants'

import {transformProduct, type RawMabangProduct} from './transform/product'
import {transformStockLevel, type RawMabangStockLevel} from './transform/stock-level'
import {transformPurchaseOrder, type RawMabangPurchaseOrder} from './transform/purchase-order'
import {transformStorageLog, type RawMabangStorageLog} from './transform/stock-adjustment'

export interface MabangErpAdapterConfig {
  /** Reserved for future use; Mabang uses developer key pairs, not OAuth. */
  _placeholder?: never
}

export class MabangErpAdapter implements InventoryAdapter {
  readonly platform = 'mabang-erp'
  readonly version = '0.1.0'

  constructor(_config: MabangErpAdapterConfig = {}) {}

  credentialFields(): CredentialField[] {
    return mabangCredentialFields()
  }

  async exchangeCredentials(fields: Record<string, string>) {
    return mabangExchangeCredentials(fields)
  }

  getAuthUrl(_state: string, _scopes?: string[]): string {
    return getAuthUrlUnsupported()
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    throw new Error('mabang-erp uses developer key pairs; use credentialFields() instead')
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return credentials
  }

  private client(credentials: Credentials): MabangErpClient {
    return new MabangErpClient(credentials)
  }

  private pageParam(params: QueryParams): number {
    return params.page ?? DEFAULT_PAGE
  }

  // ── Products ───────────────────────────────────────────────────────────────

  async listProducts(credentials: Credentials, params: QueryParams): Promise<Product[]> {
    const res = await this.client(credentials).call<RawMabangProduct[]>('do-search-stockSku', {
      page: String(this.pageParam(params)),
      pageSize: String(params.limit ?? DEFAULT_PAGE_SIZE),
    })
    return (res.data ?? []).map(transformProduct)
  }

  async getProduct(credentials: Credentials, id: string): Promise<Product> {
    // Mabang lookup by stockSku; id may be numeric stockId or SKU string
    const res = await this.client(credentials).call<RawMabangProduct[]>('do-search-stockSku', {
      stockSku: id,
      page: '1',
    })
    const item = (res.data ?? [])[0]
    if (!item) throw new Error(`mabang-erp product not found: ${id}`)
    return transformProduct(item)
  }

  // ── Stock Levels ───────────────────────────────────────────────────────────

  async listStockLevels(credentials: Credentials, params: QueryParams): Promise<StockLevel[]> {
    const res = await this.client(credentials).call<RawMabangStockLevel[]>('get-stock-quantity', {
      page: String(this.pageParam(params)),
      pageSize: String(params.limit ?? DEFAULT_PAGE_SIZE),
    })
    return (res.data ?? []).map(transformStockLevel)
  }

  async getStockLevel(_credentials: Credentials, id: string): Promise<StockLevel> {
    throw new Error(
      `mabang-erp stock-level fetch is bulk-only; call listStockLevels. id=${id}`,
    )
  }

  // ── Purchase Orders ────────────────────────────────────────────────────────

  async listPurchaseOrders(credentials: Credentials, params: QueryParams): Promise<PurchaseOrder[]> {
    const res = await this.client(credentials).call<RawMabangPurchaseOrder[]>('get-purchase-list', {
      page: String(this.pageParam(params)),
      pageSize: String(params.limit ?? DEFAULT_PAGE_SIZE),
    })
    return (res.data ?? []).map(transformPurchaseOrder)
  }

  async getPurchaseOrder(credentials: Credentials, id: string): Promise<PurchaseOrder> {
    const res = await this.client(credentials).call<RawMabangPurchaseOrder[]>('get-purchase-list', {
      purchaseId: id,
      page: '1',
    })
    const item = (res.data ?? [])[0]
    if (!item) throw new Error(`mabang-erp purchase order not found: ${id}`)
    return transformPurchaseOrder(item)
  }

  // ── Stock Adjustments (storage log) ───────────────────────────────────────

  async listStockAdjustments(credentials: Credentials, params: QueryParams): Promise<StockAdjustment[]> {
    // Storage log requires a time range; default to last 7 days when none given
    const now = new Date()
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
    const fmt = (d: Date) => d.toISOString().replace('T', ' ').substring(0, 19)

    const res = await this.client(credentials).call<RawMabangStorageLog[]>('get-storage-log-data', {
      updateTimeStart: fmt(sevenDaysAgo),
      updateTimeEnd: fmt(now),
      page: String(this.pageParam(params)),
    })
    return (res.data ?? []).map(transformStorageLog)
  }

  async getStockAdjustment(_credentials: Credentials, id: string): Promise<StockAdjustment> {
    throw new Error(
      `mabang-erp stock-adjustment fetch is bulk-only; call listStockAdjustments. id=${id}`,
    )
  }
}
