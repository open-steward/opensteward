/**
 * StockTrim inventory adapter.
 *
 * StockTrim is a demand-forecasting and inventory optimisation platform.
 * Auth: api-auth-id (tenant UUID) + api-auth-signature (tenant name) headers.
 * Base address: https://api.stocktrim.com/api
 * Swagger: https://api.stocktrim.com/index.html
 *
 * Supported resources: Products, StockLevels (derived from Products),
 *   Locations, Suppliers, PurchaseOrders.
 * Not supported: StockTransfers, StockAdjustments (no API endpoints),
 *   Webhooks (not documented).
 */
import type { CredentialField, Credentials, QueryParams } from '@opensteward/shared'
import type { InventoryAdapter } from '../../adapter/interface'
import type { Product } from '../../schema/product'
import type { StockLevel } from '../../schema/stock-level'
import type { Location } from '../../schema/location'
import type { Supplier } from '../../schema/supplier'
import type { PurchaseOrder } from '../../schema/purchase-order'

import {
  credentialFields as stocktrimCredentialFields,
  exchangeCredentials as stocktrimExchangeCredentials,
  getAuthUrlUnsupported,
} from './auth'
import {StockTrimClient} from './client'
import {DEFAULT_PAGE_SIZE} from './constants'

import {transformProduct, type RawStockTrimProduct} from './transform/product'
import {transformStockLevel, type RawStockTrimStockLevel} from './transform/stock-level'
import {transformLocation, type RawStockTrimLocation} from './transform/location'
import {transformSupplier, type RawStockTrimSupplier} from './transform/supplier'
import {transformPurchaseOrder, type RawStockTrimPurchaseOrder} from './transform/purchase-order'

// StockTrim uses static API credentials; no OAuth config needed
export type StocktrimAdapterConfig = Record<string, never>

/** Paginated response envelope from GET /V2/PurchaseOrders */
interface PurchaseOrdersPage {
  data?: RawStockTrimPurchaseOrder[]
  hasNextPage?: boolean
  pageNo?: number
}

export class StocktrimAdapter implements InventoryAdapter {
  readonly platform = 'stocktrim'
  readonly version = '0.1.0'

  constructor(_config: StocktrimAdapterConfig) {}

  credentialFields(): CredentialField[] {
    return stocktrimCredentialFields()
  }

  async exchangeCredentials(fields: Record<string, string>) {
    return stocktrimExchangeCredentials(fields)
  }

  getAuthUrl(_state: string, _scopes?: string[]): string {
    return getAuthUrlUnsupported()
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    throw new Error('stocktrim uses static api-auth-id + api-auth-signature; use credentialFields() instead')
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return credentials
  }

  private client(credentials: Credentials): StockTrimClient {
    return new StockTrimClient(credentials)
  }

  // ── Products ──────────────────────────────────────────────────────────────

  async listProducts(credentials: Credentials, params: QueryParams): Promise<Product[]> {
    const pageNo = params.page ?? 0
    const perPage = params.limit ?? DEFAULT_PAGE_SIZE
    const raw = await this.client(credentials).get<RawStockTrimProduct[]>('/Products', {
      pageNo,
      perPage,
    })
    return (raw ?? []).map(transformProduct)
  }

  async getProduct(credentials: Credentials, id: string): Promise<Product> {
    const raw = await this.client(credentials).get<RawStockTrimProduct>('/Products', { code: id })
    if (!raw) throw new Error(`stocktrim product ${id} not found`)
    return transformProduct(raw)
  }

  // ── StockLevels (derived from product stockLocations) ─────────────────────

  async listStockLevels(credentials: Credentials, params: QueryParams): Promise<StockLevel[]> {
    const pageNo = params.page ?? 0
    const perPage = params.limit ?? DEFAULT_PAGE_SIZE
    const products = await this.client(credentials).get<RawStockTrimProduct[]>('/Products', {
      pageNo,
      perPage,
    })
    const levels: StockLevel[] = []
    for (const p of products ?? []) {
      const locs = p.stockLocations ?? []
      if (locs.length > 0) {
        for (const loc of locs) {
          // Per-location stockOnHand / stockOnOrder come from the stockLocations
          // entry itself (confirmed by official StockTrim API schema).
          const entry: RawStockTrimStockLevel = {
            productId: p.productId,
            locationCode: loc.locationCode,
            locationName: loc.locationName,
            stockOnHand: typeof loc.stockOnHand === 'number' ? loc.stockOnHand : undefined,
            stockOnOrder: typeof loc.stockOnOrder === 'number' ? loc.stockOnOrder : undefined,
          }
          levels.push(transformStockLevel(entry))
        }
      } else {
        // No location breakdown — emit an aggregate row using product-level totals
        levels.push(transformStockLevel({
          productId: p.productId,
          stockOnHand: typeof p.stockOnHand === 'number' ? p.stockOnHand : undefined,
          stockOnOrder: typeof p.stockOnOrder === 'number' ? p.stockOnOrder : undefined,
        }))
      }
    }
    return levels
  }

  async getStockLevel(_credentials: Credentials, id: string): Promise<StockLevel> {
    throw new Error(`stocktrim stock-levels are derived from products; call listStockLevels. id=${id}`)
  }

  // ── Locations ─────────────────────────────────────────────────────────────

  async listLocations(credentials: Credentials, _params: QueryParams): Promise<Location[]> {
    const raw = await this.client(credentials).get<RawStockTrimLocation[]>('/Locations')
    return (raw ?? []).map(transformLocation)
  }

  async getLocation(credentials: Credentials, id: string): Promise<Location> {
    const raw = await this.client(credentials).get<RawStockTrimLocation>('/Locations', { code: id })
    if (!raw) throw new Error(`stocktrim location ${id} not found`)
    return transformLocation(raw)
  }

  // ── Suppliers ─────────────────────────────────────────────────────────────

  async listSuppliers(credentials: Credentials, _params: QueryParams): Promise<Supplier[]> {
    const raw = await this.client(credentials).get<RawStockTrimSupplier[]>('/SuppliersBulk')
    return (raw ?? []).map(transformSupplier)
  }

  async getSupplier(credentials: Credentials, id: string): Promise<Supplier> {
    const raw = await this.client(credentials).get<RawStockTrimSupplier>('/Suppliers', { code: id })
    if (!raw) throw new Error(`stocktrim supplier ${id} not found`)
    return transformSupplier(raw)
  }

  // ── PurchaseOrders ────────────────────────────────────────────────────────

  async listPurchaseOrders(credentials: Credentials, params: QueryParams): Promise<PurchaseOrder[]> {
    const page = params.page ?? 0
    const pageSize = params.limit ?? DEFAULT_PAGE_SIZE
    const res = await this.client(credentials).get<PurchaseOrdersPage>('/V2/PurchaseOrders', {
      page,
      pageSize,
    })
    return (res?.data ?? []).map(transformPurchaseOrder)
  }

  async getPurchaseOrder(credentials: Credentials, id: string): Promise<PurchaseOrder> {
    const raw = await this.client(credentials).get<RawStockTrimPurchaseOrder>(
      `/V2/PurchaseOrders/${encodeURIComponent(id)}`,
    )
    if (!raw) throw new Error(`stocktrim purchase order ${id} not found`)
    return transformPurchaseOrder(raw)
  }
}
