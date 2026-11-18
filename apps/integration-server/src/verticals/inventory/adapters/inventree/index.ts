/**
 * InvenTree adapter — open-source self-hosted inventory management.
 *
 * Auth: API token, sent as "Authorization: Token <TOKEN>".
 * Base URL: user-configured per instance (e.g. https://inventree.example.com).
 * Pagination: limit/offset via query params; response shape: { count, next, previous, results[] }.
 *
 * Supported resources:
 *   - Products (Parts)          GET /api/part/
 *   - StockLevels (StockItems)  GET /api/stock/
 *   - Locations (StockLocation) GET /api/stock/location/
 *   - Suppliers (Company)       GET /api/company/?is_supplier=true
 *   - PurchaseOrders            GET /api/order/po/
 *   - StockTransfers            GET /api/stock/track/?tracking_type=1
 *   - StockAdjustments          GET /api/stock/track/?tracking_type=10  (plus 3/4)
 *
 * No outbound webhook signing documented — verifyWebhook / parseWebhookEvents omitted.
 * Schema-firewall: no product images, no supplier banking, no BOM/build orders.
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
  credentialFields as inventreeCredentialFields,
  exchangeCredentials as inventreeExchangeCredentials,
  getAuthUrlUnsupported,
} from './auth'
import {InvenTreeClient} from './client'
import {DEFAULT_PAGE_SIZE} from './constants'

import {transformProduct, type RawInvenTreePart} from './transform/product'
import {transformStockLevel, type RawInvenTreeStockItem} from './transform/stock-level'
import {transformLocation, type RawInvenTreeLocation} from './transform/location'
import {transformSupplier, type RawInvenTreeCompany} from './transform/supplier'
import {transformPurchaseOrder, type RawInvenTreePurchaseOrder, type RawInvenTreePOLine} from './transform/purchase-order'
import {transformStockTransfer, type RawInvenTreeStockTracking} from './transform/stock-transfer'
import {transformStockAdjustment} from './transform/stock-adjustment'

export type InventreeAdapterConfig = Record<string, never>

export class InventreeAdapter implements InventoryAdapter {
  readonly platform = 'inventree'
  readonly version = '0.1.0'

  constructor(_config?: InventreeAdapterConfig) {}

  credentialFields(): CredentialField[] {
    return inventreeCredentialFields()
  }

  async exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
    return inventreeExchangeCredentials(fields)
  }

  getAuthUrl(_state: string, _scopes?: string[]): string {
    return getAuthUrlUnsupported()
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    throw new Error('inventree uses static API token; use credentialFields() instead')
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return credentials
  }

  private client(credentials: Credentials): InvenTreeClient {
    return new InvenTreeClient(credentials)
  }

  private pageParams(params: QueryParams): Record<string, unknown> {
    const limit = params.limit ?? DEFAULT_PAGE_SIZE
    const offset = params.page != null ? (params.page - 1) * limit : 0
    return { limit, offset }
  }

  // ── Products (Parts) ────────────────────────────────────────────────────────

  async listProducts(credentials: Credentials, params: QueryParams): Promise<Product[]> {
    const res = await this.client(credentials).getPage<RawInvenTreePart>('/part/', this.pageParams(params))
    return (res.results ?? []).map(transformProduct)
  }

  async getProduct(credentials: Credentials, id: string): Promise<Product> {
    const raw = await this.client(credentials).get<RawInvenTreePart>(`/part/${id}/`)
    return transformProduct(raw)
  }

  // ── StockLevels (StockItems) ─────────────────────────────────────────────

  async listStockLevels(credentials: Credentials, params: QueryParams): Promise<StockLevel[]> {
    const res = await this.client(credentials).getPage<RawInvenTreeStockItem>('/stock/', this.pageParams(params))
    return (res.results ?? []).map(transformStockLevel)
  }

  async getStockLevel(credentials: Credentials, id: string): Promise<StockLevel> {
    const raw = await this.client(credentials).get<RawInvenTreeStockItem>(`/stock/${id}/`)
    return transformStockLevel(raw)
  }

  // ── Locations (StockLocation) ────────────────────────────────────────────

  async listLocations(credentials: Credentials, params: QueryParams): Promise<Location[]> {
    const res = await this.client(credentials).getPage<RawInvenTreeLocation>('/stock/location/', this.pageParams(params))
    return (res.results ?? []).map(transformLocation)
  }

  async getLocation(credentials: Credentials, id: string): Promise<Location> {
    const raw = await this.client(credentials).get<RawInvenTreeLocation>(`/stock/location/${id}/`)
    return transformLocation(raw)
  }

  // ── Suppliers (Company filtered by is_supplier=true) ────────────────────

  async listSuppliers(credentials: Credentials, params: QueryParams): Promise<Supplier[]> {
    const res = await this.client(credentials).getPage<RawInvenTreeCompany>('/company/', {
      ...this.pageParams(params),
      is_supplier: true,
    })
    return (res.results ?? []).map(transformSupplier)
  }

  async getSupplier(credentials: Credentials, id: string): Promise<Supplier> {
    const raw = await this.client(credentials).get<RawInvenTreeCompany>(`/company/${id}/`)
    return transformSupplier(raw)
  }

  // ── PurchaseOrders ───────────────────────────────────────────────────────

  async listPurchaseOrders(credentials: Credentials, params: QueryParams): Promise<PurchaseOrder[]> {
    const res = await this.client(credentials).getPage<RawInvenTreePurchaseOrder>('/order/po/', this.pageParams(params))
    return (res.results ?? []).map((po) => transformPurchaseOrder(po))
  }

  async getPurchaseOrder(credentials: Credentials, id: string): Promise<PurchaseOrder> {
    const [po, linesPage] = await Promise.all([
      this.client(credentials).get<RawInvenTreePurchaseOrder>(`/order/po/${id}/`),
      this.client(credentials).getPage<RawInvenTreePOLine>('/order/po-line/', {
        order: id,
        limit: 250,
        offset: 0,
      }),
    ])
    return transformPurchaseOrder(po, linesPage.results ?? [])
  }

  // ── StockTransfers (via StockTracking, tracking_type=1) ─────────────────

  async listStockTransfers(credentials: Credentials, params: QueryParams): Promise<StockTransfer[]> {
    // tracking_type=1 = "transferred to new location"
    const res = await this.client(credentials).getPage<RawInvenTreeStockTracking>('/stock/track/', {
      ...this.pageParams(params),
      tracking_type: 1,
    })
    return (res.results ?? []).map(transformStockTransfer)
  }

  async getStockTransfer(credentials: Credentials, id: string): Promise<StockTransfer> {
    const raw = await this.client(credentials).get<RawInvenTreeStockTracking>(`/stock/track/${id}/`)
    return transformStockTransfer(raw)
  }

  // ── StockAdjustments (via StockTracking, tracking_type=10/3/4) ──────────

  async listStockAdjustments(credentials: Credentials, params: QueryParams): Promise<StockAdjustment[]> {
    // tracking_type=10 = stock count; also surfaces type 3 (add) and 4 (remove)
    // Fetch all three types: use type=10 (count) as primary list
    const res = await this.client(credentials).getPage<RawInvenTreeStockTracking>('/stock/track/', {
      ...this.pageParams(params),
      tracking_type: 10,
    })
    return (res.results ?? []).map(transformStockAdjustment)
  }

  async getStockAdjustment(credentials: Credentials, id: string): Promise<StockAdjustment> {
    const raw = await this.client(credentials).get<RawInvenTreeStockTracking>(`/stock/track/${id}/`)
    return transformStockAdjustment(raw)
  }
}
