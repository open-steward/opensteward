/**
 * ShipEdge adapter — WMS + OMS inventory integration.
 *
 * ShipEdge is a warehouse-management and order-management platform targeted
 * at 3PLs and ecommerce brands. API coverage in the public REST documentation:
 *
 *   • Products / SKUs   — Inventory v2 POST /get_products, /get_product
 *   • Stock Levels      — derived from product quantity fields (same endpoint)
 *   • Purchase Orders   — Replenishment v3 GET /get_reple
 *
 * Locations, Suppliers, StockTransfers, and StockAdjustments do not have
 * documented public list endpoints; those InventoryAdapter methods are omitted.
 *
 * Auth:
 *   Inventory v2  — body params: account_id, key, warehouse
 *   Replenishment v3 — headers: X-UID, X-TIMESTAMP, X-KEY (SHA1 hash)
 */
import type { CredentialField, Credentials, QueryParams } from '@opensteward/shared'
import type { InventoryAdapter } from '../../adapter/interface'
import type { Product } from '../../schema/product'
import type { StockLevel } from '../../schema/stock-level'
import type { PurchaseOrder } from '../../schema/purchase-order'

import {
  credentialFields as shipedgeCredentialFields,
  exchangeCredentials as shipedgeExchangeCredentials,
  getAuthUrlUnsupported,
} from './auth'
import {ShipEdgeClient} from './client'
import {DEFAULT_PAGE_SIZE} from './constants'

import {transformProduct, type RawShipEdgeProduct} from './transform/product'
import {transformStockLevel, type RawShipEdgeStockLevel} from './transform/stock-level'
import {transformPurchaseOrder, type RawShipEdgePurchaseOrder} from './transform/purchase-order'

// ── API response envelopes ────────────────────────────────────────────────────

interface InventoryProductsResponse {
  status?: string
  result?: {
    products?: RawShipEdgeProduct[]
    page?: number | string
    page_size?: number | string
    total_pages?: number | string
  }
}

interface InventorySingleProductResponse {
  status?: string
  result?: RawShipEdgeProduct
}

interface ReplenishmentGetResponse {
  success?: boolean
  data?: RawShipEdgePurchaseOrder
}

// ── Adapter ───────────────────────────────────────────────────────────────────

export type ShipedgeAdapterConfig = Record<string, never>

export class ShipedgeAdapter implements InventoryAdapter {
  readonly platform = 'shipedge'
  readonly version = '0.1.0'

  constructor(_config?: ShipedgeAdapterConfig) {}

  credentialFields(): CredentialField[] {
    return shipedgeCredentialFields()
  }

  async exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
    return shipedgeExchangeCredentials(fields)
  }

  getAuthUrl(_state: string, _scopes?: string[]): string {
    return getAuthUrlUnsupported()
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    throw new Error('shipedge uses static API key; use credentialFields() instead')
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return credentials
  }

  private client(credentials: Credentials): ShipEdgeClient {
    return new ShipEdgeClient(credentials)
  }

  // ── Products ────────────────────────────────────────────────────────────────

  async listProducts(credentials: Credentials, params: QueryParams): Promise<Product[]> {
    const page = params.page ?? 1
    const res = await this.client(credentials).inventoryPost<InventoryProductsResponse>('/get_products', {
      page,
      page_size: params.limit ?? DEFAULT_PAGE_SIZE,
    })
    return (res.result?.products ?? []).map(transformProduct)
  }

  async getProduct(credentials: Credentials, id: string): Promise<Product> {
    const res = await this.client(credentials).inventoryPost<InventorySingleProductResponse>('/get_product', {
      product_id: id,
    })
    if (!res.result) throw new Error(`shipedge product ${id} not found`)
    return transformProduct(res.result)
  }

  // ── Stock Levels ────────────────────────────────────────────────────────────
  //
  // ShipEdge embeds warehouse-level quantity fields directly on the product
  // record. listStockLevels re-uses listProducts and maps each product to a
  // StockLevel using its distribution_center as the location.

  async listStockLevels(credentials: Credentials, params: QueryParams): Promise<StockLevel[]> {
    const page = params.page ?? 1
    const res = await this.client(credentials).inventoryPost<InventoryProductsResponse>('/get_products', {
      page,
      page_size: params.limit ?? DEFAULT_PAGE_SIZE,
    })
    const products = res.result?.products ?? []
    return products.map((p) => transformStockLevel(p as unknown as RawShipEdgeStockLevel))
  }

  async getStockLevel(credentials: Credentials, id: string): Promise<StockLevel> {
    // id is product_id; fetch single product and map to stock level
    const res = await this.client(credentials).inventoryPost<InventorySingleProductResponse>('/get_product', {
      product_id: id,
    })
    if (!res.result) throw new Error(`shipedge stock level for product ${id} not found`)
    return transformStockLevel(res.result as unknown as RawShipEdgeStockLevel)
  }

  // ── Purchase Orders (Replenishments) ────────────────────────────────────────

  async getPurchaseOrder(credentials: Credentials, id: string): Promise<PurchaseOrder> {
    const warehouse = String(credentials.extra?.['warehouse'] ?? '')
    const res = await this.client(credentials).replenishmentGet<ReplenishmentGetResponse>(
      `/get_reple/${encodeURIComponent(id)}/${encodeURIComponent(warehouse)}`,
    )
    if (!res.success || !res.data) throw new Error(`shipedge replenishment ${id} not found`)
    return transformPurchaseOrder(res.data)
  }
}
