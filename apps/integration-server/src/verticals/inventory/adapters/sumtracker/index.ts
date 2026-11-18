/**
 * Sumtracker adapter — multi-channel inventory management for ecommerce brands.
 *
 * Auth: single API key sent as Authorization: Bearer header.
 * Supported resources: products, stock levels (inventory), warehouses (locations),
 * suppliers, purchase orders, stock adjustments.
 * Schema-firewall: no product images, no supplier banking, no BOM/manufacturing.
 *
 * Note: Sumtracker does not publish webhook signing docs; verifyWebhook is not
 * implemented and parseWebhookEvents is not exposed.
 */
import type { CredentialField, Credentials, QueryParams } from '@opensteward/shared'
import type { InventoryAdapter } from '../../adapter/interface'
import type { Product } from '../../schema/product'
import type { StockLevel } from '../../schema/stock-level'
import type { Location } from '../../schema/location'
import type { Supplier } from '../../schema/supplier'
import type { PurchaseOrder } from '../../schema/purchase-order'
import type { StockAdjustment } from '../../schema/stock-adjustment'

import {
  credentialFields as sumtrackerCredentialFields,
  exchangeCredentials as sumtrackerExchangeCredentials,
  getAuthUrlUnsupported,
} from './auth'
import {SumtrackerClient} from './client'
import {DEFAULT_PAGE_SIZE} from './constants'

import {transformProduct, type RawSumtrackerProduct} from './transform/product'
import {transformStockLevel, type RawSumtrackerStockLevel} from './transform/stock-level'
import {transformLocation, type RawSumtrackerLocation} from './transform/location'
import {transformSupplier, type RawSumtrackerSupplier} from './transform/supplier'
import {transformPurchaseOrder, type RawSumtrackerPurchaseOrder} from './transform/purchase-order'
import {transformStockAdjustment, type RawSumtrackerStockAdjustment} from './transform/stock-adjustment'

export type SumtrackerAdapterConfig = Record<string, never>

// Sumtracker returns paginated lists in { data: T[], meta: { total, page, per_page } } envelope
interface PagedResponse<T> {
  data?: T[]
  // Some endpoints return the array directly at the root key
  products?: T[]
  inventory?: T[]
  warehouses?: T[]
  suppliers?: T[]
  purchase_orders?: T[]
  stock_adjustments?: T[]
  meta?: { total?: number; page?: number; per_page?: number }
}

export class SumtrackerAdapter implements InventoryAdapter {
  readonly platform = 'sumtracker'
  readonly version = '0.1.0'

  constructor(_config?: SumtrackerAdapterConfig) {}

  credentialFields(): CredentialField[] {
    return sumtrackerCredentialFields()
  }

  async exchangeCredentials(fields: Record<string, string>) {
    return sumtrackerExchangeCredentials(fields)
  }

  getAuthUrl(_state: string, _scopes?: string[]): string {
    return getAuthUrlUnsupported()
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    throw new Error('sumtracker uses a static API key; use credentialFields() instead')
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return credentials
  }

  private client(credentials: Credentials): SumtrackerClient {
    return new SumtrackerClient(credentials)
  }

  private listParams(params: QueryParams): Record<string, unknown> {
    return {
      per_page: params.limit ?? DEFAULT_PAGE_SIZE,
      ...(params.page ? { page: params.page } : {}),
    }
  }

  // ── Products ───────────────────────────────────────────────────────────────

  async listProducts(credentials: Credentials, params: QueryParams): Promise<Product[]> {
    const res = await this.client(credentials).get<PagedResponse<RawSumtrackerProduct>>(
      '/products',
      this.listParams(params),
    )
    return (res.data ?? res.products ?? []).map(transformProduct)
  }

  async getProduct(credentials: Credentials, id: string): Promise<Product> {
    const res = await this.client(credentials).get<{ data?: RawSumtrackerProduct } & RawSumtrackerProduct>(
      `/products/${id}`,
    )
    const raw = (res as { data?: RawSumtrackerProduct }).data ?? (res as RawSumtrackerProduct)
    if (!raw?.id) throw new Error(`sumtracker product ${id} not found`)
    return transformProduct(raw)
  }

  // ── Stock Levels ───────────────────────────────────────────────────────────

  async listStockLevels(credentials: Credentials, params: QueryParams): Promise<StockLevel[]> {
    const res = await this.client(credentials).get<PagedResponse<RawSumtrackerStockLevel>>(
      '/inventory',
      this.listParams(params),
    )
    return (res.data ?? res.inventory ?? []).map(transformStockLevel)
  }

  async getStockLevel(_credentials: Credentials, id: string): Promise<StockLevel> {
    throw new Error(`sumtracker stock-level fetch is bulk-only; call listStockLevels. id=${id}`)
  }

  // ── Locations (Warehouses) ─────────────────────────────────────────────────

  async listLocations(credentials: Credentials, params: QueryParams): Promise<Location[]> {
    const res = await this.client(credentials).get<PagedResponse<RawSumtrackerLocation>>(
      '/warehouses',
      this.listParams(params),
    )
    return (res.data ?? res.warehouses ?? []).map(transformLocation)
  }

  async getLocation(credentials: Credentials, id: string): Promise<Location> {
    const res = await this.client(credentials).get<{ data?: RawSumtrackerLocation } & RawSumtrackerLocation>(
      `/warehouses/${id}`,
    )
    const raw = (res as { data?: RawSumtrackerLocation }).data ?? (res as RawSumtrackerLocation)
    if (!raw?.id) throw new Error(`sumtracker warehouse ${id} not found`)
    return transformLocation(raw)
  }

  // ── Suppliers ──────────────────────────────────────────────────────────────

  async listSuppliers(credentials: Credentials, params: QueryParams): Promise<Supplier[]> {
    const res = await this.client(credentials).get<PagedResponse<RawSumtrackerSupplier>>(
      '/suppliers',
      this.listParams(params),
    )
    return (res.data ?? res.suppliers ?? []).map(transformSupplier)
  }

  async getSupplier(credentials: Credentials, id: string): Promise<Supplier> {
    const res = await this.client(credentials).get<{ data?: RawSumtrackerSupplier } & RawSumtrackerSupplier>(
      `/suppliers/${id}`,
    )
    const raw = (res as { data?: RawSumtrackerSupplier }).data ?? (res as RawSumtrackerSupplier)
    if (!raw?.id) throw new Error(`sumtracker supplier ${id} not found`)
    return transformSupplier(raw)
  }

  // ── Purchase Orders ────────────────────────────────────────────────────────

  async listPurchaseOrders(credentials: Credentials, params: QueryParams): Promise<PurchaseOrder[]> {
    const res = await this.client(credentials).get<PagedResponse<RawSumtrackerPurchaseOrder>>(
      '/purchase_orders',
      this.listParams(params),
    )
    return (res.data ?? res.purchase_orders ?? []).map(transformPurchaseOrder)
  }

  async getPurchaseOrder(credentials: Credentials, id: string): Promise<PurchaseOrder> {
    const res = await this.client(credentials).get<{ data?: RawSumtrackerPurchaseOrder } & RawSumtrackerPurchaseOrder>(
      `/purchase_orders/${id}`,
    )
    const raw = (res as { data?: RawSumtrackerPurchaseOrder }).data ?? (res as RawSumtrackerPurchaseOrder)
    if (!raw?.id) throw new Error(`sumtracker purchase order ${id} not found`)
    return transformPurchaseOrder(raw)
  }

  // ── Stock Adjustments ──────────────────────────────────────────────────────

  async listStockAdjustments(credentials: Credentials, params: QueryParams): Promise<StockAdjustment[]> {
    const res = await this.client(credentials).get<PagedResponse<RawSumtrackerStockAdjustment>>(
      '/stock_adjustments',
      this.listParams(params),
    )
    return (res.data ?? res.stock_adjustments ?? []).map(transformStockAdjustment)
  }

  async getStockAdjustment(credentials: Credentials, id: string): Promise<StockAdjustment> {
    const res = await this.client(credentials).get<{ data?: RawSumtrackerStockAdjustment } & RawSumtrackerStockAdjustment>(
      `/stock_adjustments/${id}`,
    )
    const raw = (res as { data?: RawSumtrackerStockAdjustment }).data ?? (res as RawSumtrackerStockAdjustment)
    if (!raw?.id) throw new Error(`sumtracker stock adjustment ${id} not found`)
    return transformStockAdjustment(raw)
  }
}
