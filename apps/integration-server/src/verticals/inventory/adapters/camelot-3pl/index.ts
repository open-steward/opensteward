/**
 * Camelot 3PL Software (Excalibur WMS) adapter.
 *
 * Excalibur is a tenant-hosted WMS used exclusively by 3PL warehouses.
 * Each customer's instance runs at a distinct URL; the base URL is
 * captured as a credential field alongside the API key and client code.
 *
 * Auth: Bearer API key via Authorization header (api_key auth type).
 * Schema-firewall: no product images, no supplier banking details, no
 * manufacturing BOM, no customer order financials.
 *
 * Supported resources: products, stock-levels, locations.
 * Conditionally supported (custom export profiles required): suppliers,
 * purchase-orders, stock-transfers, stock-adjustments.
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
  credentialFields as camelotCredentialFields,
  exchangeCredentials as camelotExchangeCredentials,
  getAuthUrlUnsupported,
} from './auth'
import {Camelot3plClient} from './client'
import {DEFAULT_PAGE_SIZE} from './constants'

import {transformProduct, type RawCamelot3plProduct} from './transform/product'
import {transformStockLevel, type RawCamelot3plStockLevel} from './transform/stock-level'
import {transformLocation, type RawCamelot3plLocation} from './transform/location'
import {transformSupplier, type RawCamelot3plSupplier} from './transform/supplier'
import {transformPurchaseOrder, type RawCamelot3plPurchaseOrder} from './transform/purchase-order'
import {transformStockTransfer, type RawCamelot3plStockTransfer} from './transform/stock-transfer'
import {transformStockAdjustment, type RawCamelot3plStockAdjustment} from './transform/stock-adjustment'

export type Camelot3plAdapterConfig = Record<string, never>

interface PagedResponse<T> {
  items?: T[]
  data?: T[]
  results?: T[]
  total?: number
  page?: number
  pageSize?: number
}

function extractItems<T>(res: PagedResponse<T> | T[]): T[] {
  if (Array.isArray(res)) return res
  return res.items ?? res.data ?? res.results ?? []
}

export class Camelot3plAdapter implements InventoryAdapter {
  readonly platform = 'camelot-3pl'
  readonly version = '0.1.0'

  constructor(_config?: Camelot3plAdapterConfig) {}

  credentialFields(): CredentialField[] {
    return camelotCredentialFields()
  }

  async exchangeCredentials(fields: Record<string, string>) {
    return camelotExchangeCredentials(fields)
  }

  getAuthUrl(_state: string, _scopes?: string[]): string {
    return getAuthUrlUnsupported()
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    throw new Error('camelot-3pl uses a static API key; use credentialFields() instead')
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return credentials
  }

  private client(credentials: Credentials): Camelot3plClient {
    return new Camelot3plClient(credentials)
  }

  private pageParams(params: QueryParams): Record<string, unknown> {
    return {
      pageSize: params.limit ?? DEFAULT_PAGE_SIZE,
      ...(params.page ? { page: params.page } : { page: 1 }),
    }
  }

  // ── Products ────────────────────────────────────────────────────────────────

  async listProducts(credentials: Credentials, params: QueryParams): Promise<Product[]> {
    const res = await this.client(credentials).get<PagedResponse<RawCamelot3plProduct> | RawCamelot3plProduct[]>(
      '/items',
      this.pageParams(params),
    )
    return extractItems(res).map(transformProduct)
  }

  async getProduct(credentials: Credentials, id: string): Promise<Product> {
    const res = await this.client(credentials).get<RawCamelot3plProduct>(`/items/${encodeURIComponent(id)}`)
    return transformProduct(res)
  }

  // ── Stock Levels ────────────────────────────────────────────────────────────

  async listStockLevels(credentials: Credentials, params: QueryParams): Promise<StockLevel[]> {
    const res = await this.client(credentials).get<PagedResponse<RawCamelot3plStockLevel> | RawCamelot3plStockLevel[]>(
      '/inventoryout',
      this.pageParams(params),
    )
    return extractItems(res).map(transformStockLevel)
  }

  async getStockLevel(_credentials: Credentials, id: string): Promise<StockLevel> {
    throw new Error(`camelot-3pl stock-level fetch is bulk-only via /inventoryout; call listStockLevels. id=${id}`)
  }

  // ── Locations ───────────────────────────────────────────────────────────────

  async listLocations(credentials: Credentials, params: QueryParams): Promise<Location[]> {
    const res = await this.client(credentials).get<PagedResponse<RawCamelot3plLocation> | RawCamelot3plLocation[]>(
      '/warehouses',
      this.pageParams(params),
    )
    return extractItems(res).map(transformLocation)
  }

  async getLocation(credentials: Credentials, id: string): Promise<Location> {
    const res = await this.client(credentials).get<RawCamelot3plLocation>(`/warehouses/${encodeURIComponent(id)}`)
    return transformLocation(res)
  }

  // ── Suppliers ───────────────────────────────────────────────────────────────

  async listSuppliers(credentials: Credentials, params: QueryParams): Promise<Supplier[]> {
    const res = await this.client(credentials).get<PagedResponse<RawCamelot3plSupplier> | RawCamelot3plSupplier[]>(
      '/vendors',
      this.pageParams(params),
    )
    return extractItems(res).map(transformSupplier)
  }

  async getSupplier(credentials: Credentials, id: string): Promise<Supplier> {
    const res = await this.client(credentials).get<RawCamelot3plSupplier>(`/vendors/${encodeURIComponent(id)}`)
    return transformSupplier(res)
  }

  // ── Purchase Orders ─────────────────────────────────────────────────────────

  async listPurchaseOrders(credentials: Credentials, params: QueryParams): Promise<PurchaseOrder[]> {
    const res = await this.client(credentials).get<PagedResponse<RawCamelot3plPurchaseOrder> | RawCamelot3plPurchaseOrder[]>(
      '/orderin',
      this.pageParams(params),
    )
    return extractItems(res).map(transformPurchaseOrder)
  }

  async getPurchaseOrder(credentials: Credentials, id: string): Promise<PurchaseOrder> {
    const res = await this.client(credentials).get<RawCamelot3plPurchaseOrder>(`/orderin/${encodeURIComponent(id)}`)
    return transformPurchaseOrder(res)
  }

  // ── Stock Transfers ─────────────────────────────────────────────────────────

  async listStockTransfers(credentials: Credentials, params: QueryParams): Promise<StockTransfer[]> {
    const res = await this.client(credentials).get<PagedResponse<RawCamelot3plStockTransfer> | RawCamelot3plStockTransfer[]>(
      '/transfers',
      this.pageParams(params),
    )
    return extractItems(res).map(transformStockTransfer)
  }

  async getStockTransfer(credentials: Credentials, id: string): Promise<StockTransfer> {
    const res = await this.client(credentials).get<RawCamelot3plStockTransfer>(`/transfers/${encodeURIComponent(id)}`)
    return transformStockTransfer(res)
  }

  // ── Stock Adjustments ───────────────────────────────────────────────────────

  async listStockAdjustments(credentials: Credentials, params: QueryParams): Promise<StockAdjustment[]> {
    const res = await this.client(credentials).get<PagedResponse<RawCamelot3plStockAdjustment> | RawCamelot3plStockAdjustment[]>(
      '/adjustments',
      this.pageParams(params),
    )
    return extractItems(res).map(transformStockAdjustment)
  }

  async getStockAdjustment(credentials: Credentials, id: string): Promise<StockAdjustment> {
    const res = await this.client(credentials).get<RawCamelot3plStockAdjustment>(`/adjustments/${encodeURIComponent(id)}`)
    return transformStockAdjustment(res)
  }
}
