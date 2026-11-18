/**
 * MRPeasy adapter for the inventory vertical.
 *
 * MRPeasy is a cloud ERP / MRP system for small manufacturers.
 * Auth: HTTP Basic (apiKey:apiSecret), pre-encoded as base64 in accessToken.
 * Pagination: Range request header — "items=<offset>-<end>".
 * Supported resources: products (items), stock levels (inventory), suppliers (vendors),
 *   purchase orders.
 * Not supported by MRPeasy v1 API: locations (sites are embedded, no list endpoint),
 *   stock transfers, stock adjustments.
 * Schema-firewall: no product images, no supplier banking, no manufacturing BOM/work orders.
 */
import type { CredentialField, Credentials, QueryParams } from '@opensteward/shared'
import type { InventoryAdapter } from '../../adapter/interface'
import type { Product } from '../../schema/product'
import type { StockLevel } from '../../schema/stock-level'
import type { Supplier } from '../../schema/supplier'
import type { PurchaseOrder } from '../../schema/purchase-order'

import {
  credentialFields as mrpeasyCredentialFields,
  exchangeCredentials as mrpeasyExchangeCredentials,
  getAuthUrlUnsupported,
} from './auth'
import {MrpeasyClient} from './client'
import {DEFAULT_PAGE_SIZE} from './constants'

import {transformProduct, type RawMrpeasyProduct} from './transform/product'
import {transformStockLevel, type RawMrpeasyStockLevel} from './transform/stock-level'
import {transformSupplier, type RawMrpeasySupplier} from './transform/supplier'
import {transformPurchaseOrder, type RawMrpeasyPurchaseOrder} from './transform/purchase-order'

export type MrpeasyAdapterConfig = Record<string, never>

export class MrpeasyAdapter implements InventoryAdapter {
  readonly platform = 'mrpeasy'
  readonly version = '0.1.0'

  constructor(_config?: MrpeasyAdapterConfig) {}

  credentialFields(): CredentialField[] {
    return mrpeasyCredentialFields()
  }

  async exchangeCredentials(fields: Record<string, string>) {
    return mrpeasyExchangeCredentials(fields)
  }

  getAuthUrl(_state: string, _scopes?: string[]): string {
    return getAuthUrlUnsupported()
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    throw new Error('mrpeasy uses static API key + secret; use credentialFields() instead')
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return credentials
  }

  private client(credentials: Credentials): MrpeasyClient {
    return new MrpeasyClient(credentials)
  }

  private offset(params: QueryParams): number {
    const page = params.page ?? 1
    const limit = params.limit ?? DEFAULT_PAGE_SIZE
    return (page - 1) * limit
  }

  // ── Products (Items) ──────────────────────────────────────────────────────

  async listProducts(credentials: Credentials, params: QueryParams): Promise<Product[]> {
    const limit = params.limit ?? DEFAULT_PAGE_SIZE
    const items = await this.client(credentials).getList<RawMrpeasyProduct>(
      '/items',
      this.offset(params),
      limit,
    )
    return items.map(transformProduct)
  }

  async getProduct(credentials: Credentials, id: string): Promise<Product> {
    const raw = await this.client(credentials).get<RawMrpeasyProduct>(`/items/${id}`)
    return transformProduct(raw)
  }

  // ── Stock Levels (Inventory) ──────────────────────────────────────────────

  async listStockLevels(credentials: Credentials, params: QueryParams): Promise<StockLevel[]> {
    const limit = params.limit ?? DEFAULT_PAGE_SIZE
    const items = await this.client(credentials).getList<RawMrpeasyStockLevel>(
      '/stock/inventory',
      this.offset(params),
      limit,
    )
    return items.map(transformStockLevel)
  }

  async getStockLevel(credentials: Credentials, id: string): Promise<StockLevel> {
    // MRPeasy supports per-item inventory lookup: /stock/inventory/{article_id}
    const raw = await this.client(credentials).get<RawMrpeasyStockLevel>(`/stock/inventory/${id}`)
    return transformStockLevel(raw)
  }

  // ── Suppliers (Vendors) ───────────────────────────────────────────────────

  async listSuppliers(credentials: Credentials, params: QueryParams): Promise<Supplier[]> {
    const limit = params.limit ?? DEFAULT_PAGE_SIZE
    const items = await this.client(credentials).getList<RawMrpeasySupplier>(
      '/vendors',
      this.offset(params),
      limit,
    )
    return items.map(transformSupplier)
  }

  async getSupplier(credentials: Credentials, id: string): Promise<Supplier> {
    const raw = await this.client(credentials).get<RawMrpeasySupplier>(`/vendors/${id}`)
    return transformSupplier(raw)
  }

  // ── Purchase Orders ───────────────────────────────────────────────────────

  async listPurchaseOrders(credentials: Credentials, params: QueryParams): Promise<PurchaseOrder[]> {
    const limit = params.limit ?? DEFAULT_PAGE_SIZE
    const items = await this.client(credentials).getList<RawMrpeasyPurchaseOrder>(
      '/purchase-orders',
      this.offset(params),
      limit,
    )
    return items.map(transformPurchaseOrder)
  }

  async getPurchaseOrder(credentials: Credentials, id: string): Promise<PurchaseOrder> {
    const raw = await this.client(credentials).get<RawMrpeasyPurchaseOrder>(`/purchase-orders/${id}`)
    return transformPurchaseOrder(raw)
  }
}
