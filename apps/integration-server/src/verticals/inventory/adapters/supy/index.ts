/**
 * Supy adapter — multi-branch F&B inventory and procurement.
 *
 * Supy is a restaurant operations platform that provides inventory, wastage,
 * procurement, and analytics for multi-branch F&B operators.
 * Auth: single API key sent as `x-api-key` header.
 * Docs: https://supy.io/product-features/open-api-integrations
 *
 * Supported resources: products (items), locations (branches), suppliers,
 * purchase-orders, stock-levels, stock-transfers, stock-adjustments.
 * Webhooks: not implemented — Supy does not publish HMAC/JWT webhook signing
 * documentation in its public-facing API reference.
 * Schema-firewall: no product images, no supplier banking, no recipes/BOM.
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
  credentialFields as supyCredentialFields,
  exchangeCredentials as supyExchangeCredentials,
  getAuthUrlUnsupported,
} from './auth'
import {SupyClient} from './client'
import {DEFAULT_PAGE_SIZE} from './constants'

import {transformProduct, type RawSupyItem} from './transform/product'
import {transformStockLevel, type RawSupyStockBalance} from './transform/stock-level'
import {transformLocation, type RawSupyBranch} from './transform/location'
import {transformSupplier, type RawSupySupplier} from './transform/supplier'
import {transformPurchaseOrder, type RawSupyPurchaseOrder} from './transform/purchase-order'
import {transformStockTransfer, type RawSupyTransfer} from './transform/stock-transfer'
import {transformStockAdjustment, type RawSupyStockAdjustment} from './transform/stock-adjustment'
export type SupyAdapterConfig = Record<string, never>

/** Supy paginated list envelope */
interface SupyListEnvelope<T> {
  data?: T[]
  items?: T[]
  results?: T[]
  total?: number
  page?: number
  limit?: number
}

function unwrapList<T>(res: SupyListEnvelope<T>): T[] {
  return res.data ?? res.items ?? res.results ?? []
}

export class SupyAdapter implements InventoryAdapter {
  readonly platform = 'supy'
  readonly version = '0.1.0'

  constructor(_config: SupyAdapterConfig) {}

  credentialFields(): CredentialField[] {
    return supyCredentialFields()
  }

  async exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
    return supyExchangeCredentials(fields)
  }

  getAuthUrl(_state: string, _scopes?: string[]): string {
    return getAuthUrlUnsupported()
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    throw new Error('supy uses a static API key; use credentialFields() instead')
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return credentials
  }

  private client(credentials: Credentials): SupyClient {
    return new SupyClient(credentials)
  }

  private pageParams(params: QueryParams): Record<string, unknown> {
    return {
      limit: params.limit ?? DEFAULT_PAGE_SIZE,
      ...(params.page !== undefined ? { page: params.page } : {}),
    }
  }

  // ── Products (items) ───────────────────────────────────────────────────────

  async listProducts(credentials: Credentials, params: QueryParams): Promise<Product[]> {
    const res = await this.client(credentials).get<SupyListEnvelope<RawSupyItem>>('/items', this.pageParams(params))
    return unwrapList(res).map(transformProduct)
  }

  async getProduct(credentials: Credentials, id: string): Promise<Product> {
    const raw = await this.client(credentials).get<RawSupyItem>(`/items/${id}`)
    return transformProduct(raw)
  }

  // ── Stock Levels ───────────────────────────────────────────────────────────

  async listStockLevels(credentials: Credentials, params: QueryParams): Promise<StockLevel[]> {
    const res = await this.client(credentials).get<SupyListEnvelope<RawSupyStockBalance>>('/inventory/balances', this.pageParams(params))
    return unwrapList(res).map(transformStockLevel)
  }

  async getStockLevel(_credentials: Credentials, id: string): Promise<StockLevel> {
    throw new Error(`supy stock-level fetch is bulk-only; call listStockLevels. id=${id}`)
  }

  // ── Locations (branches) ───────────────────────────────────────────────────

  async listLocations(credentials: Credentials, params: QueryParams): Promise<Location[]> {
    const res = await this.client(credentials).get<SupyListEnvelope<RawSupyBranch>>('/branches', this.pageParams(params))
    return unwrapList(res).map(transformLocation)
  }

  async getLocation(credentials: Credentials, id: string): Promise<Location> {
    const raw = await this.client(credentials).get<RawSupyBranch>(`/branches/${id}`)
    return transformLocation(raw)
  }

  // ── Suppliers ──────────────────────────────────────────────────────────────

  async listSuppliers(credentials: Credentials, params: QueryParams): Promise<Supplier[]> {
    const res = await this.client(credentials).get<SupyListEnvelope<RawSupySupplier>>('/suppliers', this.pageParams(params))
    return unwrapList(res).map(transformSupplier)
  }

  async getSupplier(credentials: Credentials, id: string): Promise<Supplier> {
    const raw = await this.client(credentials).get<RawSupySupplier>(`/suppliers/${id}`)
    return transformSupplier(raw)
  }

  // ── Purchase Orders ────────────────────────────────────────────────────────

  async listPurchaseOrders(credentials: Credentials, params: QueryParams): Promise<PurchaseOrder[]> {
    const res = await this.client(credentials).get<SupyListEnvelope<RawSupyPurchaseOrder>>('/purchase-orders', this.pageParams(params))
    return unwrapList(res).map(transformPurchaseOrder)
  }

  async getPurchaseOrder(credentials: Credentials, id: string): Promise<PurchaseOrder> {
    const raw = await this.client(credentials).get<RawSupyPurchaseOrder>(`/purchase-orders/${id}`)
    return transformPurchaseOrder(raw)
  }

  // ── Stock Transfers ────────────────────────────────────────────────────────

  async listStockTransfers(credentials: Credentials, params: QueryParams): Promise<StockTransfer[]> {
    const res = await this.client(credentials).get<SupyListEnvelope<RawSupyTransfer>>('/transfers', this.pageParams(params))
    return unwrapList(res).map(transformStockTransfer)
  }

  async getStockTransfer(credentials: Credentials, id: string): Promise<StockTransfer> {
    const raw = await this.client(credentials).get<RawSupyTransfer>(`/transfers/${id}`)
    return transformStockTransfer(raw)
  }

  // ── Stock Adjustments (stock takes + wastage) ──────────────────────────────

  async listStockAdjustments(credentials: Credentials, params: QueryParams): Promise<StockAdjustment[]> {
    const res = await this.client(credentials).get<SupyListEnvelope<RawSupyStockAdjustment>>('/stock-adjustments', this.pageParams(params))
    return unwrapList(res).map(transformStockAdjustment)
  }

  async getStockAdjustment(credentials: Credentials, id: string): Promise<StockAdjustment> {
    const raw = await this.client(credentials).get<RawSupyStockAdjustment>(`/stock-adjustments/${id}`)
    return transformStockAdjustment(raw)
  }
}
