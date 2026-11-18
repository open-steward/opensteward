/**
 * OpenBoxes adapter — inventory vertical.
 *
 * OpenBoxes is an open-source, self-hosted supply chain management system
 * widely used in humanitarian and healthcare logistics.
 *
 * Base URL: {instanceUrl}/openboxes/api  (user-provided, self-hosted)
 * Auth: username + password → JSESSIONID session cookie.
 * Pagination: max (page size) + offset (0-based).
 * Response envelope: { data: T | T[] }
 *
 * Supported resources: products, locations, stock-levels (inventoryItems),
 *   stock-transfers (outbound stockMovements), purchase-orders (inbound
 *   stockMovements), stock-adjustments (transactions).
 *
 * Not supported: suppliers (no dedicated endpoint; modeled as locations with
 *   locationTypeCode=SUPPLIER), webhooks (no HMAC-signed webhook mechanism
 *   documented in the public API).
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
  credentialFields as openboxesCredentialFields,
  exchangeCredentials as openboxesExchangeCredentials,
  getAuthUrlUnsupported,
} from './auth'
import {OpenboxesClient} from './client'
import {DEFAULT_PAGE_SIZE} from './constants'

import {transformProduct, type RawOpenboxesProduct} from './transform/product'
import {transformStockLevel, type RawOpenboxesStockLevel} from './transform/stock-level'
import {transformLocation, type RawOpenboxesLocation} from './transform/location'
import {transformSupplier, type RawOpenboxesSupplier} from './transform/supplier'
import {transformPurchaseOrder, type RawOpenboxesPurchaseOrder} from './transform/purchase-order'
import {transformStockTransfer, type RawOpenboxesStockTransfer} from './transform/stock-transfer'
import {transformStockAdjustment, type RawOpenboxesStockAdjustment} from './transform/stock-adjustment'
export type OpenboxesAdapterConfig = Record<string, never>

/** Generic response envelope used by all OpenBoxes API endpoints */
interface DataEnvelope<T> { data: T }

export class OpenboxesAdapter implements InventoryAdapter {
  readonly platform = 'openboxes'
  readonly version = '0.1.0'

  constructor(_config: OpenboxesAdapterConfig) {}

  credentialFields(): CredentialField[] {
    return openboxesCredentialFields()
  }

  async exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
    return openboxesExchangeCredentials(fields)
  }

  getAuthUrl(_state: string, _scopes?: string[]): string {
    return getAuthUrlUnsupported()
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    throw new Error('openboxes uses username + password; use credentialFields() instead')
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    // Session cookies expire server-side; callers must re-authenticate via
    // exchangeCredentials when they receive a 401.
    return credentials
  }

  private client(credentials: Credentials): OpenboxesClient {
    return new OpenboxesClient(credentials)
  }

  private pageParams(params: QueryParams): Record<string, unknown> {
    const max = params.limit ?? DEFAULT_PAGE_SIZE
    const offset = params.page ? (params.page - 1) * max : 0
    return { max, offset }
  }

  // ── Products ───────────────────────────────────────────────────────────────

  async listProducts(credentials: Credentials, params: QueryParams): Promise<Product[]> {
    const res = await this.client(credentials).get<DataEnvelope<RawOpenboxesProduct[]>>(
      '/products',
      this.pageParams(params),
    )
    return (res.data ?? []).map(transformProduct)
  }

  async getProduct(credentials: Credentials, id: string): Promise<Product> {
    const res = await this.client(credentials).get<DataEnvelope<RawOpenboxesProduct>>(`/products/${id}`)
    if (!res.data) throw new Error(`openboxes product ${id} not found`)
    return transformProduct(res.data)
  }

  // ── Stock Levels (inventory items) ────────────────────────────────────────

  async listStockLevels(credentials: Credentials, params: QueryParams): Promise<StockLevel[]> {
    const res = await this.client(credentials).get<DataEnvelope<RawOpenboxesStockLevel[]>>(
      '/generic/inventoryItem',
      this.pageParams(params),
    )
    return (res.data ?? []).map(transformStockLevel)
  }

  async getStockLevel(credentials: Credentials, id: string): Promise<StockLevel> {
    const res = await this.client(credentials).get<DataEnvelope<RawOpenboxesStockLevel>>(`/generic/inventoryItem/${id}`)
    if (!res.data) throw new Error(`openboxes inventoryItem ${id} not found`)
    return transformStockLevel(res.data)
  }

  // ── Locations ─────────────────────────────────────────────────────────────

  async listLocations(credentials: Credentials, params: QueryParams): Promise<Location[]> {
    const res = await this.client(credentials).get<DataEnvelope<RawOpenboxesLocation[]>>(
      '/locations',
      this.pageParams(params),
    )
    return (res.data ?? []).map(transformLocation)
  }

  async getLocation(credentials: Credentials, id: string): Promise<Location> {
    const res = await this.client(credentials).get<DataEnvelope<RawOpenboxesLocation>>(`/locations/${id}`)
    if (!res.data) throw new Error(`openboxes location ${id} not found`)
    return transformLocation(res.data)
  }

  // ── Suppliers (locations with locationTypeCode=SUPPLIER) ──────────────────

  async listSuppliers(credentials: Credentials, params: QueryParams): Promise<Supplier[]> {
    const res = await this.client(credentials).get<DataEnvelope<RawOpenboxesSupplier[]>>(
      '/locations',
      { ...this.pageParams(params), 'locationTypeCode': 'SUPPLIER' },
    )
    return (res.data ?? []).map(transformSupplier)
  }

  async getSupplier(credentials: Credentials, id: string): Promise<Supplier> {
    const res = await this.client(credentials).get<DataEnvelope<RawOpenboxesSupplier>>(`/locations/${id}`)
    if (!res.data) throw new Error(`openboxes supplier/location ${id} not found`)
    return transformSupplier(res.data)
  }

  // ── Purchase Orders (inbound stock movements) ─────────────────────────────

  async listPurchaseOrders(credentials: Credentials, params: QueryParams): Promise<PurchaseOrder[]> {
    const res = await this.client(credentials).get<DataEnvelope<RawOpenboxesPurchaseOrder[]>>(
      '/stockMovements',
      { ...this.pageParams(params), direction: 'INBOUND' },
    )
    return (res.data ?? []).map(transformPurchaseOrder)
  }

  async getPurchaseOrder(credentials: Credentials, id: string): Promise<PurchaseOrder> {
    const res = await this.client(credentials).get<DataEnvelope<RawOpenboxesPurchaseOrder>>(`/stockMovements/${id}`)
    if (!res.data) throw new Error(`openboxes stockMovement ${id} not found`)
    return transformPurchaseOrder(res.data)
  }

  // ── Stock Transfers (outbound stock movements) ────────────────────────────

  async listStockTransfers(credentials: Credentials, params: QueryParams): Promise<StockTransfer[]> {
    const res = await this.client(credentials).get<DataEnvelope<RawOpenboxesStockTransfer[]>>(
      '/stockMovements',
      { ...this.pageParams(params), direction: 'OUTBOUND' },
    )
    return (res.data ?? []).map(transformStockTransfer)
  }

  async getStockTransfer(credentials: Credentials, id: string): Promise<StockTransfer> {
    const res = await this.client(credentials).get<DataEnvelope<RawOpenboxesStockTransfer>>(`/stockMovements/${id}`)
    if (!res.data) throw new Error(`openboxes stockMovement ${id} not found`)
    return transformStockTransfer(res.data)
  }

  // ── Stock Adjustments (transactions) ─────────────────────────────────────

  async listStockAdjustments(credentials: Credentials, params: QueryParams): Promise<StockAdjustment[]> {
    const res = await this.client(credentials).get<DataEnvelope<RawOpenboxesStockAdjustment[]>>(
      '/generic/transaction',
      this.pageParams(params),
    )
    return (res.data ?? []).map(transformStockAdjustment)
  }

  async getStockAdjustment(credentials: Credentials, id: string): Promise<StockAdjustment> {
    const res = await this.client(credentials).get<DataEnvelope<RawOpenboxesStockAdjustment>>(`/generic/transaction/${id}`)
    if (!res.data) throw new Error(`openboxes transaction ${id} not found`)
    return transformStockAdjustment(res.data)
  }
}
