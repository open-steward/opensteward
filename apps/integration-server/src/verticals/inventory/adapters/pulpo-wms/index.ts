/**
 * PULPO WMS adapter for the inventory vertical.
 *
 * Cloud-native WMS for e-commerce, targeting SMB/mid-market warehouses.
 * Base URL: https://eu.pulpo.co/api/v1
 * Auth: static API key sent as `Authorization: Bearer <key>`.
 * Rate limits: 60 req/min, 60 concurrent, 1 MB per request.
 *
 * Supported resources: products, stock levels, locations (warehouses),
 * suppliers, purchase orders, stock transfers, stock adjustments.
 *
 * No webhook signing scheme is publicly documented; webhook methods are
 * therefore not implemented.
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
  credentialFields as pulpoCredentialFields,
  exchangeCredentials as pulpoExchangeCredentials,
  getAuthUrlUnsupported,
} from './auth'
import {PulpoWmsClient} from './client'
import {DEFAULT_PAGE_SIZE} from './constants'

import {transformProduct, type RawPulpoWmsProduct} from './transform/product'
import {transformStockLevel, type RawPulpoWmsStockLevel} from './transform/stock-level'
import {transformLocation, type RawPulpoWmsLocation} from './transform/location'
import {transformSupplier, type RawPulpoWmsSupplier} from './transform/supplier'
import {transformPurchaseOrder, type RawPulpoWmsPurchaseOrder} from './transform/purchase-order'
import {transformStockTransfer, type RawPulpoWmsStockTransfer} from './transform/stock-transfer'
import {transformStockAdjustment, type RawPulpoWmsStockAdjustment} from './transform/stock-adjustment'

export type PulpoWmsAdapterConfig = Record<string, never>

/** Paginated list envelope used by PULPO WMS list endpoints. */
interface PulpoPage<T> {
  data?: T[]
  items?: T[]
  results?: T[]
  total?: number
  page?: number
  per_page?: number
}

function items<T>(res: PulpoPage<T>): T[] {
  return res.data ?? res.items ?? res.results ?? []
}

export class PulpoWmsAdapter implements InventoryAdapter {
  readonly platform = 'pulpo-wms'
  readonly version = '0.1.0'

  constructor(_config?: PulpoWmsAdapterConfig) {}

  credentialFields(): CredentialField[] {
    return pulpoCredentialFields()
  }

  async exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
    return pulpoExchangeCredentials(fields)
  }

  getAuthUrl(_state: string, _scopes?: string[]): string {
    return getAuthUrlUnsupported()
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    throw new Error('pulpo-wms uses a static API key; use credentialFields() instead')
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return credentials
  }

  private client(credentials: Credentials): PulpoWmsClient {
    return new PulpoWmsClient(credentials)
  }

  private pageParams(params: QueryParams): Record<string, unknown> {
    return {
      limit: params.limit ?? DEFAULT_PAGE_SIZE,
      ...(params.page !== undefined ? { page: params.page } : {}),
    }
  }

  // ── Products ──────────────────────────────────────────────────────────────

  async listProducts(credentials: Credentials, params: QueryParams): Promise<Product[]> {
    const res = await this.client(credentials).get<PulpoPage<RawPulpoWmsProduct>>(
      '/products',
      this.pageParams(params),
    )
    return items(res).map(transformProduct)
  }

  async getProduct(credentials: Credentials, id: string): Promise<Product> {
    const raw = await this.client(credentials).get<RawPulpoWmsProduct>(`/products/${id}`)
    return transformProduct(raw)
  }

  // ── Stock Levels ──────────────────────────────────────────────────────────

  async listStockLevels(credentials: Credentials, params: QueryParams): Promise<StockLevel[]> {
    const res = await this.client(credentials).get<PulpoPage<RawPulpoWmsStockLevel>>(
      '/stock',
      this.pageParams(params),
    )
    return items(res).map(transformStockLevel)
  }

  async getStockLevel(_credentials: Credentials, id: string): Promise<StockLevel> {
    throw new Error(`pulpo-wms stock levels are returned bulk-only; call listStockLevels. id=${id}`)
  }

  // ── Locations (Warehouses) ────────────────────────────────────────────────

  async listLocations(credentials: Credentials, params: QueryParams): Promise<Location[]> {
    const res = await this.client(credentials).get<PulpoPage<RawPulpoWmsLocation>>(
      '/warehouses',
      this.pageParams(params),
    )
    return items(res).map(transformLocation)
  }

  async getLocation(credentials: Credentials, id: string): Promise<Location> {
    const raw = await this.client(credentials).get<RawPulpoWmsLocation>(`/warehouses/${id}`)
    return transformLocation(raw)
  }

  // ── Suppliers ─────────────────────────────────────────────────────────────

  async listSuppliers(credentials: Credentials, params: QueryParams): Promise<Supplier[]> {
    const res = await this.client(credentials).get<PulpoPage<RawPulpoWmsSupplier>>(
      '/suppliers',
      this.pageParams(params),
    )
    return items(res).map(transformSupplier)
  }

  async getSupplier(credentials: Credentials, id: string): Promise<Supplier> {
    const raw = await this.client(credentials).get<RawPulpoWmsSupplier>(`/suppliers/${id}`)
    return transformSupplier(raw)
  }

  // ── Purchase Orders ───────────────────────────────────────────────────────

  async listPurchaseOrders(credentials: Credentials, params: QueryParams): Promise<PurchaseOrder[]> {
    const res = await this.client(credentials).get<PulpoPage<RawPulpoWmsPurchaseOrder>>(
      '/purchase-orders',
      this.pageParams(params),
    )
    return items(res).map(transformPurchaseOrder)
  }

  async getPurchaseOrder(credentials: Credentials, id: string): Promise<PurchaseOrder> {
    const raw = await this.client(credentials).get<RawPulpoWmsPurchaseOrder>(`/purchase-orders/${id}`)
    return transformPurchaseOrder(raw)
  }

  // ── Stock Transfers ───────────────────────────────────────────────────────

  async listStockTransfers(credentials: Credentials, params: QueryParams): Promise<StockTransfer[]> {
    const res = await this.client(credentials).get<PulpoPage<RawPulpoWmsStockTransfer>>(
      '/transfers',
      this.pageParams(params),
    )
    return items(res).map(transformStockTransfer)
  }

  async getStockTransfer(credentials: Credentials, id: string): Promise<StockTransfer> {
    const raw = await this.client(credentials).get<RawPulpoWmsStockTransfer>(`/transfers/${id}`)
    return transformStockTransfer(raw)
  }

  // ── Stock Adjustments ─────────────────────────────────────────────────────

  async listStockAdjustments(credentials: Credentials, params: QueryParams): Promise<StockAdjustment[]> {
    const res = await this.client(credentials).get<PulpoPage<RawPulpoWmsStockAdjustment>>(
      '/adjustments',
      this.pageParams(params),
    )
    return items(res).map(transformStockAdjustment)
  }

  async getStockAdjustment(credentials: Credentials, id: string): Promise<StockAdjustment> {
    const raw = await this.client(credentials).get<RawPulpoWmsStockAdjustment>(`/adjustments/${id}`)
    return transformStockAdjustment(raw)
  }
}
