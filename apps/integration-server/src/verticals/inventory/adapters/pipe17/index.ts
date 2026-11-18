/**
 * Pipe17 adapter — inventory vertical.
 *
 * Pipe17 is an enterprise order-operations platform (ecommerce hub + 3PL).
 * Auth: single API key sent as X-Pipe17-Key header.
 * Supported resources: products (items), stock levels (inventory), locations,
 *   suppliers, purchase orders (/purchases), stock transfers (/transfers),
 *   stock adjustments (/inventory/events?eventType=adjust).
 * Schema-firewall: no product images, no supplier banking.
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
  credentialFields as pipe17CredentialFields,
  exchangeCredentials as pipe17ExchangeCredentials,
  getAuthUrlUnsupported,
} from './auth'
import {Pipe17Client} from './client'
import {DEFAULT_PAGE_SIZE} from './constants'

import {transformProduct, type RawPipe17Item} from './transform/product'
import {transformStockLevel, type RawPipe17InventoryRecord} from './transform/stock-level'
import {transformLocation, type RawPipe17Location} from './transform/location'
import {transformSupplier, type RawPipe17Supplier} from './transform/supplier'
import {transformPurchaseOrder, type RawPipe17Purchase} from './transform/purchase-order'
import {transformStockTransfer, type RawPipe17Transfer} from './transform/stock-transfer'
import {transformStockAdjustment, type RawPipe17AdjustEvent} from './transform/stock-adjustment'

export type Pipe17AdapterConfig = Record<string, never>

/** Pipe17 paginated list response wrapper */
interface Pipe17ListResponse<T> {
  data?: T[]
  items?: T[]
  pagination?: {
    pageSize?: number
    pageIndex?: number
    pages?: number
    total?: number
  }
}

export class Pipe17Adapter implements InventoryAdapter {
  readonly platform = 'pipe17'
  readonly version = '0.1.0'

  constructor(_config: Pipe17AdapterConfig = {}) {}

  credentialFields(): CredentialField[] {
    return pipe17CredentialFields()
  }

  async exchangeCredentials(fields: Record<string, string>) {
    return pipe17ExchangeCredentials(fields)
  }

  getAuthUrl(_state: string, _scopes?: string[]): string {
    return getAuthUrlUnsupported()
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    throw new Error('pipe17 uses a static API key; use credentialFields() instead')
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return credentials
  }

  private client(credentials: Credentials): Pipe17Client {
    return new Pipe17Client(credentials)
  }

  private pageParams(params: QueryParams): Record<string, unknown> {
    return {
      pageSize: params.limit ?? DEFAULT_PAGE_SIZE,
      ...(params.page ? { pageIndex: params.page } : {}),
    }
  }

  // ── Products ─────────────────────────────────────────────────────────────

  async listProducts(credentials: Credentials, params: QueryParams): Promise<Product[]> {
    const res = await this.client(credentials).get<Pipe17ListResponse<RawPipe17Item>>('/items', this.pageParams(params))
    const rows = res.data ?? res.items ?? []
    return rows.map(transformProduct)
  }

  async getProduct(credentials: Credentials, id: string): Promise<Product> {
    const raw = await this.client(credentials).get<RawPipe17Item>(`/items/${id}`)
    return transformProduct(raw)
  }

  // ── StockLevels ───────────────────────────────────────────────────────────

  async listStockLevels(credentials: Credentials, params: QueryParams): Promise<StockLevel[]> {
    const res = await this.client(credentials).get<Pipe17ListResponse<RawPipe17InventoryRecord>>('/inventory', this.pageParams(params))
    const rows = res.data ?? res.items ?? []
    return rows.map(transformStockLevel)
  }

  async getStockLevel(_credentials: Credentials, id: string): Promise<StockLevel> {
    throw new Error(`pipe17 stock-level fetch is bulk-only; call listStockLevels. id=${id}`)
  }

  // ── Locations ─────────────────────────────────────────────────────────────

  async listLocations(credentials: Credentials, params: QueryParams): Promise<Location[]> {
    const res = await this.client(credentials).get<Pipe17ListResponse<RawPipe17Location>>('/locations', this.pageParams(params))
    const rows = res.data ?? res.items ?? []
    return rows.map(transformLocation)
  }

  async getLocation(credentials: Credentials, id: string): Promise<Location> {
    const raw = await this.client(credentials).get<RawPipe17Location>(`/locations/${id}`)
    return transformLocation(raw)
  }

  // ── Suppliers ─────────────────────────────────────────────────────────────

  async listSuppliers(credentials: Credentials, params: QueryParams): Promise<Supplier[]> {
    const res = await this.client(credentials).get<Pipe17ListResponse<RawPipe17Supplier>>('/suppliers', this.pageParams(params))
    const rows = res.data ?? res.items ?? []
    return rows.map(transformSupplier)
  }

  async getSupplier(credentials: Credentials, id: string): Promise<Supplier> {
    const raw = await this.client(credentials).get<RawPipe17Supplier>(`/suppliers/${id}`)
    return transformSupplier(raw)
  }

  // ── PurchaseOrders ────────────────────────────────────────────────────────

  async listPurchaseOrders(credentials: Credentials, params: QueryParams): Promise<PurchaseOrder[]> {
    const res = await this.client(credentials).get<Pipe17ListResponse<RawPipe17Purchase>>('/purchases', this.pageParams(params))
    const rows = res.data ?? res.items ?? []
    return rows.map(transformPurchaseOrder)
  }

  async getPurchaseOrder(credentials: Credentials, id: string): Promise<PurchaseOrder> {
    const raw = await this.client(credentials).get<RawPipe17Purchase>(`/purchases/${id}`)
    return transformPurchaseOrder(raw)
  }

  // ── StockTransfers ────────────────────────────────────────────────────────

  async listStockTransfers(credentials: Credentials, params: QueryParams): Promise<StockTransfer[]> {
    const res = await this.client(credentials).get<Pipe17ListResponse<RawPipe17Transfer>>('/transfers', this.pageParams(params))
    const rows = res.data ?? res.items ?? []
    return rows.map(transformStockTransfer)
  }

  async getStockTransfer(credentials: Credentials, id: string): Promise<StockTransfer> {
    const raw = await this.client(credentials).get<RawPipe17Transfer>(`/transfers/${id}`)
    return transformStockTransfer(raw)
  }

  // ── StockAdjustments ─────────────────────────────────────────────────────

  async listStockAdjustments(credentials: Credentials, params: QueryParams): Promise<StockAdjustment[]> {
    const res = await this.client(credentials).get<Pipe17ListResponse<RawPipe17AdjustEvent>>(
      '/inventory/events',
      { ...this.pageParams(params), eventType: 'adjust' },
    )
    const rows = res.data ?? res.items ?? []
    return rows.map(transformStockAdjustment)
  }

  async getStockAdjustment(credentials: Credentials, id: string): Promise<StockAdjustment> {
    const raw = await this.client(credentials).get<RawPipe17AdjustEvent>(`/inventory/events/${id}`)
    return transformStockAdjustment(raw)
  }
}
