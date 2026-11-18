/**
 * Da Vinci Unified (DVU) WMS adapter.
 *
 * Wolin Design Group Corp warehouse management system.
 * Auth: single API key sent as X-Api-Key header.
 * API base: https://api.wdgcorp.com
 * Pagination: pageNumber (1-based) + pageSize query params.
 * Schema-firewall: no product images, no vendor banking, no BOM/work orders.
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
  credentialFields as dvuCredentialFields,
  exchangeCredentials as dvuExchangeCredentials,
  getAuthUrlUnsupported,
} from './auth'
import {DaVinciUnifiedClient} from './client'
import {DEFAULT_PAGE_SIZE} from './constants'

import {transformProduct, type RawDaVinciUnifiedProduct} from './transform/product'
import {transformStockLevel, type RawDaVinciUnifiedStockLevel} from './transform/stock-level'
import {transformLocation, type RawDaVinciUnifiedLocation} from './transform/location'
import {transformSupplier, type RawDaVinciUnifiedSupplier} from './transform/supplier'
import {transformPurchaseOrder, type RawDaVinciUnifiedPurchaseOrder} from './transform/purchase-order'
import {transformStockTransfer, type RawDaVinciUnifiedStockTransfer} from './transform/stock-transfer'
import {transformStockAdjustment, type RawDaVinciUnifiedStockAdjustment} from './transform/stock-adjustment'

export interface DaVinciUnifiedAdapterConfig {
  /** No OAuth config needed — DVU uses a simple API key. */
  _placeholder?: never
}

/** Paginated list envelope from the DVU API */
interface DvuPage<T> {
  data?: T[]
  items?: T[]
  totalCount?: number
  pageNumber?: number
  pageSize?: number
}

export class DaVinciUnifiedAdapter implements InventoryAdapter {
  readonly platform = 'da-vinci-unified'
  readonly version = '0.1.0'

  constructor(_config?: DaVinciUnifiedAdapterConfig) {}

  credentialFields(): CredentialField[] {
    return dvuCredentialFields()
  }

  async exchangeCredentials(fields: Record<string, string>) {
    return dvuExchangeCredentials(fields)
  }

  getAuthUrl(_state: string, _scopes?: string[]): string {
    return getAuthUrlUnsupported()
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    throw new Error('da-vinci-unified uses a static API key; use credentialFields() instead')
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return credentials
  }

  private client(credentials: Credentials): DaVinciUnifiedClient {
    return new DaVinciUnifiedClient(credentials)
  }

  private pageParams(params: QueryParams): Record<string, unknown> {
    return {
      pageSize: params.limit ?? DEFAULT_PAGE_SIZE,
      pageNumber: params.page ?? 1,
    }
  }

  private unwrap<T>(res: DvuPage<T>): T[] {
    return res.data ?? res.items ?? []
  }

  // ── Products ───────────────────────────────────────────────────────────────

  async listProducts(credentials: Credentials, params: QueryParams): Promise<Product[]> {
    const res = await this.client(credentials).get<DvuPage<RawDaVinciUnifiedProduct>>(
      '/api/item/items',
      this.pageParams(params),
    )
    return this.unwrap(res).map(transformProduct)
  }

  async getProduct(credentials: Credentials, id: string): Promise<Product> {
    const raw = await this.client(credentials).get<RawDaVinciUnifiedProduct>(
      `/api/item/items/${id}`,
    )
    return transformProduct(raw)
  }

  // ── Stock Levels ───────────────────────────────────────────────────────────

  async listStockLevels(credentials: Credentials, params: QueryParams): Promise<StockLevel[]> {
    const res = await this.client(credentials).get<DvuPage<RawDaVinciUnifiedStockLevel>>(
      '/api/inventory/itemInventory',
      this.pageParams(params),
    )
    return this.unwrap(res).map(transformStockLevel)
  }

  async getStockLevel(_credentials: Credentials, id: string): Promise<StockLevel> {
    throw new Error(
      `da-vinci-unified stock-level fetch is bulk-only; call listStockLevels. id=${id}`,
    )
  }

  // ── Locations ──────────────────────────────────────────────────────────────

  async listLocations(credentials: Credentials, params: QueryParams): Promise<Location[]> {
    const res = await this.client(credentials).get<DvuPage<RawDaVinciUnifiedLocation>>(
      '/api/warehouse/warehouses',
      this.pageParams(params),
    )
    return this.unwrap(res).map(transformLocation)
  }

  async getLocation(credentials: Credentials, id: string): Promise<Location> {
    const raw = await this.client(credentials).get<RawDaVinciUnifiedLocation>(
      `/api/warehouse/warehouses/${id}`,
    )
    return transformLocation(raw)
  }

  // ── Suppliers (vendors) ────────────────────────────────────────────────────

  async listSuppliers(credentials: Credentials, params: QueryParams): Promise<Supplier[]> {
    const res = await this.client(credentials).get<DvuPage<RawDaVinciUnifiedSupplier>>(
      '/api/vendor/vendors',
      this.pageParams(params),
    )
    return this.unwrap(res).map(transformSupplier)
  }

  async getSupplier(credentials: Credentials, id: string): Promise<Supplier> {
    const raw = await this.client(credentials).get<RawDaVinciUnifiedSupplier>(
      `/api/vendor/vendors/${id}`,
    )
    return transformSupplier(raw)
  }

  // ── Purchase Orders (receipt headers) ─────────────────────────────────────

  async listPurchaseOrders(credentials: Credentials, params: QueryParams): Promise<PurchaseOrder[]> {
    const res = await this.client(credentials).get<DvuPage<RawDaVinciUnifiedPurchaseOrder>>(
      '/api/receipt/receiptHeaders',
      this.pageParams(params),
    )
    return this.unwrap(res).map(transformPurchaseOrder)
  }

  async getPurchaseOrder(credentials: Credentials, id: string): Promise<PurchaseOrder> {
    const raw = await this.client(credentials).get<RawDaVinciUnifiedPurchaseOrder>(
      `/api/receipt/receiptHeaders/${id}`,
    )
    return transformPurchaseOrder(raw)
  }

  // ── Stock Transfers ────────────────────────────────────────────────────────

  async listStockTransfers(credentials: Credentials, params: QueryParams): Promise<StockTransfer[]> {
    const res = await this.client(credentials).get<DvuPage<RawDaVinciUnifiedStockTransfer>>(
      '/api/transfer/transferOrders',
      this.pageParams(params),
    )
    return this.unwrap(res).map(transformStockTransfer)
  }

  async getStockTransfer(credentials: Credentials, id: string): Promise<StockTransfer> {
    const raw = await this.client(credentials).get<RawDaVinciUnifiedStockTransfer>(
      `/api/transfer/transferOrders/${id}`,
    )
    return transformStockTransfer(raw)
  }

  // ── Stock Adjustments ──────────────────────────────────────────────────────

  async listStockAdjustments(credentials: Credentials, params: QueryParams): Promise<StockAdjustment[]> {
    const res = await this.client(credentials).get<DvuPage<RawDaVinciUnifiedStockAdjustment>>(
      '/api/inventory/adjustments',
      this.pageParams(params),
    )
    return this.unwrap(res).map(transformStockAdjustment)
  }

  async getStockAdjustment(credentials: Credentials, id: string): Promise<StockAdjustment> {
    const raw = await this.client(credentials).get<RawDaVinciUnifiedStockAdjustment>(
      `/api/inventory/adjustments/${id}`,
    )
    return transformStockAdjustment(raw)
  }
}
