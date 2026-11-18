/**
 * ERPAG adapter — inventory vertical.
 *
 * Cloud-based MRP/ERP system.
 * Auth: api_key + api_secret → Authorization: Basic base64(key:secret).
 * Rate limit: 2 req/s.
 *
 * ERPAG's list endpoints return arrays of string IDs only; individual records
 * must be fetched one by one. Pagination is handled client-side by slicing the
 * ID list according to the QueryParams limit/page.
 *
 * Supported resources: products, stock-levels (embedded in items), suppliers,
 * purchase-orders.
 */
// ── Resource coverage ──────────────────────────────────────────────
// Unavailable: location       — ERPAG public API has no documented endpoint for warehouses/locations; only UI-based management is available.
// Unavailable: stock-adjustment — ERPAG public API has no documented endpoint for stock adjustments; the concept exists only in the UI and QuickBooks sync.
// Unavailable: stock-transfer — ERPAG public API has no documented endpoint for stock transfers; only UI-based warehouse transfers are available.
import type { CredentialField, Credentials, QueryParams } from '@opensteward/shared'
import type { InventoryAdapter } from '../../adapter/interface'
import type { Product } from '../../schema/product'
import type { StockLevel } from '../../schema/stock-level'
import type { Supplier } from '../../schema/supplier'
import type { PurchaseOrder } from '../../schema/purchase-order'

import {
  credentialFields as erpagCredentialFields,
  exchangeCredentials as erpagExchangeCredentials,
  getAuthUrlUnsupported,
} from './auth'
import {ErpagClient} from './client'
import {DEFAULT_PAGE_SIZE} from './constants'

import {transformProduct, type RawErpagProduct} from './transform/product'
import {transformStockLevel} from './transform/stock-level'
import {transformSupplier, type RawErpagSupplier} from './transform/supplier'
import {transformPurchaseOrder, type RawErpagPurchaseOrder} from './transform/purchase-order'
export type ErpagAdapterConfig = Record<string, never>

export class ErpagAdapter implements InventoryAdapter {
  readonly platform = 'erpag'
  readonly version = '0.1.0'

  constructor(_config?: ErpagAdapterConfig) {}

  credentialFields(): CredentialField[] {
    return erpagCredentialFields()
  }

  async exchangeCredentials(fields: Record<string, string>) {
    return erpagExchangeCredentials(fields)
  }

  getAuthUrl(_state: string, _scopes?: string[]): string {
    return getAuthUrlUnsupported()
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    throw new Error('erpag uses static API key + secret; use credentialFields() instead')
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return credentials
  }

  private client(credentials: Credentials): ErpagClient {
    return new ErpagClient(credentials)
  }

  /**
   * Resolve a slice of IDs into full objects via per-id GET requests.
   * ERPAG list endpoints return ID arrays only — no pagination parameters.
   */
  private pageIds(ids: string[], params: QueryParams): string[] {
    const limit = params.limit ?? DEFAULT_PAGE_SIZE
    const page = params.page ?? 1
    const start = (page - 1) * limit
    return ids.slice(start, start + limit)
  }

  // ── Products ──────────────────────────────────────────────────────────────

  async listProducts(credentials: Credentials, params: QueryParams): Promise<Product[]> {
    const allIds = await this.client(credentials).get<string[]>('/items')
    const ids = this.pageIds(allIds, params)
    const results = await Promise.all(
      ids.map(async (id) => {
        try {
          const raw = await this.client(credentials).get<Omit<RawErpagProduct, 'id'>>('/item', { id })
          return transformProduct({ ...raw, id })
        } catch {
          return undefined
        }
      }),
    )
    return results.filter((p): p is Product => p !== undefined)
  }

  async getProduct(credentials: Credentials, id: string): Promise<Product> {
    const raw = await this.client(credentials).get<Omit<RawErpagProduct, 'id'>>('/item', { id })
    return transformProduct({ ...raw, id })
  }

  // ── Stock Levels (embedded inside each item's inventory array) ────────────

  async listStockLevels(credentials: Credentials, params: QueryParams): Promise<StockLevel[]> {
    const allIds = await this.client(credentials).get<string[]>('/items')
    const ids = this.pageIds(allIds, params)
    const levels: StockLevel[] = []
    await Promise.all(
      ids.map(async (productId) => {
        try {
          const raw = await this.client(credentials).get<RawErpagProduct>('/item', { id: productId })
          for (const entry of raw.inventory ?? []) {
            levels.push(transformStockLevel({ ...entry, productId }))
          }
        } catch {
          // skip items that fail individually
        }
      }),
    )
    return levels
  }

  async getStockLevel(_credentials: Credentials, id: string): Promise<StockLevel> {
    throw new Error(`erpag stock-levels are embedded in items; call listStockLevels. id=${id}`)
  }

  // ── Suppliers ─────────────────────────────────────────────────────────────

  async listSuppliers(credentials: Credentials, params: QueryParams): Promise<Supplier[]> {
    const allIds = await this.client(credentials).get<string[]>('/suppliers')
    const ids = this.pageIds(allIds, params)
    const results = await Promise.all(
      ids.map(async (id) => {
        try {
          const raw = await this.client(credentials).get<Omit<RawErpagSupplier, 'id'>>('/supplier', { id })
          return transformSupplier({ ...raw, id })
        } catch {
          return undefined
        }
      }),
    )
    return results.filter((s): s is Supplier => s !== undefined)
  }

  async getSupplier(credentials: Credentials, id: string): Promise<Supplier> {
    const raw = await this.client(credentials).get<Omit<RawErpagSupplier, 'id'>>('/supplier', { id })
    return transformSupplier({ ...raw, id })
  }

  // ── Purchase Orders ────────────────────────────────────────────────────────

  async listPurchaseOrders(credentials: Credentials, params: QueryParams): Promise<PurchaseOrder[]> {
    const allIds = await this.client(credentials).get<string[]>('/purchaseorders')
    const ids = this.pageIds(allIds, params)
    const results = await Promise.all(
      ids.map(async (id) => {
        try {
          const raw = await this.client(credentials).get<Omit<RawErpagPurchaseOrder, 'id'>>('/purchaseorder', { id })
          return transformPurchaseOrder({ ...raw, id })
        } catch {
          return undefined
        }
      }),
    )
    return results.filter((po): po is PurchaseOrder => po !== undefined)
  }

  async getPurchaseOrder(credentials: Credentials, id: string): Promise<PurchaseOrder> {
    const raw = await this.client(credentials).get<Omit<RawErpagPurchaseOrder, 'id'>>('/purchaseorder', { id })
    return transformPurchaseOrder({ ...raw, id })
  }
}
