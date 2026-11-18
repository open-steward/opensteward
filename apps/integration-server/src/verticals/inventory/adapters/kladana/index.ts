/**
 * Kladana inventory adapter.
 *
 * Russian cloud ERP / inventory management system.
 * Auth: Bearer token (api_key) via Authorization header.
 * Base URL: https://api.kladana.com/api/remap/1.2
 * Docs: https://dev.kladana.com/doc/api/remap/1.2/
 *
 * Schema-firewall: no product images, no supplier banking, no BOM/manufacturing.
 *
 * Pagination: limit + offset (default limit 100, max 1000).
 * Amounts: all monetary values are in integer minor units (kopecks) — stored as-is.
 * Webhooks: Kladana does not document HMAC signing for webhooks — webhook support omitted.
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
  credentialFields as kladanaCredentialFields,
  exchangeCredentials as kladanaExchangeCredentials,
  getAuthUrlUnsupported,
} from './auth'
import {KladanaClient} from './client'
import {DEFAULT_PAGE_SIZE} from './constants'

import {transformProduct, type RawKladanaProduct} from './transform/product'
import {transformStockLevel, type RawKladanaStockLevel} from './transform/stock-level'
import {transformLocation, type RawKladanaLocation} from './transform/location'
import {transformSupplier, type RawKladanaSupplier} from './transform/supplier'
import {transformPurchaseOrder, type RawKladanaPurchaseOrder} from './transform/purchase-order'
import {transformStockTransfer, type RawKladanaStockTransfer} from './transform/stock-transfer'
import {transformStockAdjustment, type RawKladanaStockAdjustment} from './transform/stock-adjustment'

export interface KladanaAdapterConfig {
  // No OAuth client needed — Bearer token auth only.
  [key: string]: unknown
}

/** Standard Kladana list envelope: { meta: { ...pagination }, rows: T[] } */
interface KladanaListResponse<T> {
  meta?: { size?: number; limit?: number; offset?: number }
  rows?: T[]
}

/** Kladana stock report envelope: flat array (no rows wrapper) */
type KladanaStockResponse = RawKladanaStockLevel[]

export class KladanaAdapter implements InventoryAdapter {
  readonly platform = 'kladana'
  readonly version = '0.1.0'

  constructor(_config?: KladanaAdapterConfig) {}

  credentialFields(): CredentialField[] {
    return kladanaCredentialFields()
  }

  async exchangeCredentials(fields: Record<string, string>) {
    return kladanaExchangeCredentials(fields)
  }

  getAuthUrl(_state: string, _scopes?: string[]): string {
    return getAuthUrlUnsupported()
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    throw new Error('kladana uses static API key (Bearer token); use credentialFields() instead')
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return credentials
  }

  private client(credentials: Credentials): KladanaClient {
    return new KladanaClient(credentials)
  }

  private listParams(params: QueryParams): Record<string, unknown> {
    const limit = params.limit ?? DEFAULT_PAGE_SIZE
    const offset = params.page !== undefined ? (params.page - 1) * limit : 0
    return { limit, offset }
  }

  async listProducts(credentials: Credentials, params: QueryParams): Promise<Product[]> {
    const res = await this.client(credentials).get<KladanaListResponse<RawKladanaProduct>>('/entity/product', this.listParams(params))
    return (res.rows ?? []).map(transformProduct)
  }

  async getProduct(credentials: Credentials, id: string): Promise<Product> {
    const raw = await this.client(credentials).get<RawKladanaProduct>(`/entity/product/${id}`)
    return transformProduct(raw)
  }

  async listStockLevels(credentials: Credentials, params: QueryParams): Promise<StockLevel[]> {
    const res = await this.client(credentials).get<KladanaStockResponse>('/report/stock/bystore/current', this.listParams(params))
    // The current stock report returns a flat array, not a rows-wrapped object
    const rows = Array.isArray(res) ? res : []
    return rows.map(transformStockLevel)
  }

  async getStockLevel(_credentials: Credentials, id: string): Promise<StockLevel> {
    throw new Error(`kladana stock-level fetch is bulk-only via /report/stock/bystore/current; call listStockLevels. id=${id}`)
  }

  async listLocations(credentials: Credentials, params: QueryParams): Promise<Location[]> {
    const res = await this.client(credentials).get<KladanaListResponse<RawKladanaLocation>>('/entity/store', this.listParams(params))
    return (res.rows ?? []).map(transformLocation)
  }

  async getLocation(credentials: Credentials, id: string): Promise<Location> {
    const raw = await this.client(credentials).get<RawKladanaLocation>(`/entity/store/${id}`)
    return transformLocation(raw)
  }

  async listSuppliers(credentials: Credentials, params: QueryParams): Promise<Supplier[]> {
    // Filter to suppliers/vendors using the companyType filter; omit filter to get all counterparties
    const res = await this.client(credentials).get<KladanaListResponse<RawKladanaSupplier>>('/entity/counterparty', {
      ...this.listParams(params),
      supplier: true,
    })
    return (res.rows ?? []).map(transformSupplier)
  }

  async getSupplier(credentials: Credentials, id: string): Promise<Supplier> {
    const raw = await this.client(credentials).get<RawKladanaSupplier>(`/entity/counterparty/${id}`)
    return transformSupplier(raw)
  }

  async listPurchaseOrders(credentials: Credentials, params: QueryParams): Promise<PurchaseOrder[]> {
    const res = await this.client(credentials).get<KladanaListResponse<RawKladanaPurchaseOrder>>('/entity/purchaseorder', {
      ...this.listParams(params),
      expand: 'positions',
    })
    return (res.rows ?? []).map(transformPurchaseOrder)
  }

  async getPurchaseOrder(credentials: Credentials, id: string): Promise<PurchaseOrder> {
    const raw = await this.client(credentials).get<RawKladanaPurchaseOrder>(`/entity/purchaseorder/${id}`, { expand: 'positions' })
    return transformPurchaseOrder(raw)
  }

  async listStockTransfers(credentials: Credentials, params: QueryParams): Promise<StockTransfer[]> {
    const res = await this.client(credentials).get<KladanaListResponse<RawKladanaStockTransfer>>('/entity/move', {
      ...this.listParams(params),
      expand: 'positions',
    })
    return (res.rows ?? []).map(transformStockTransfer)
  }

  async getStockTransfer(credentials: Credentials, id: string): Promise<StockTransfer> {
    const raw = await this.client(credentials).get<RawKladanaStockTransfer>(`/entity/move/${id}`, { expand: 'positions' })
    return transformStockTransfer(raw)
  }

  async listStockAdjustments(credentials: Credentials, params: QueryParams): Promise<StockAdjustment[]> {
    const res = await this.client(credentials).get<KladanaListResponse<RawKladanaStockAdjustment>>('/entity/inventory', {
      ...this.listParams(params),
      expand: 'positions',
    })
    return (res.rows ?? []).map(transformStockAdjustment)
  }

  async getStockAdjustment(credentials: Credentials, id: string): Promise<StockAdjustment> {
    const raw = await this.client(credentials).get<RawKladanaStockAdjustment>(`/entity/inventory/${id}`, { expand: 'positions' })
    return transformStockAdjustment(raw)
  }
}
