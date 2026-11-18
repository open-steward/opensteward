/**
 * SphereWMS inventory adapter.
 *
 * SphereWMS is a cloud-based warehouse management system (WMS).
 * Auth: API key passed as the `key` query parameter; environment name
 * forms the tenant segment of the base URL.
 *
 * Supported resources: products, stock levels (inventory), locations (invaccts),
 * suppliers, purchase orders (receipts), stock transfers (transfer-history),
 * stock adjustments (adjustment-history).
 *
 * SphereWMS does not publish documented webhook signing — verifyWebhook /
 * parseWebhookEvents are not implemented.
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
  credentialFields as sphereWmsCredentialFields,
  exchangeCredentials as sphereWmsExchangeCredentials,
  getAuthUrlUnsupported,
} from './auth'
import {SphereWmsClient} from './client'
import {DEFAULT_PAGE_SIZE} from './constants'

import {transformProduct, type RawSphereWmsProduct} from './transform/product'
import {transformStockLevel, type RawSphereWmsInventory} from './transform/stock-level'
import {transformLocation, type RawSphereWmsLocation} from './transform/location'
import {transformSupplier, type RawSphereWmsSupplier} from './transform/supplier'
import {transformPurchaseOrder, type RawSphereWmsReceipt} from './transform/purchase-order'
import {transformStockTransfer, type RawSphereWmsTransfer} from './transform/stock-transfer'
import {transformStockAdjustment, type RawSphereWmsAdjustment} from './transform/stock-adjustment'

export type SpherewmsAdapterConfig = Record<string, never>

export class SpherewmsAdapter implements InventoryAdapter {
  readonly platform = 'spherewms'
  readonly version = '0.1.0'

  constructor(_config?: SpherewmsAdapterConfig) {}

  credentialFields(): CredentialField[] {
    return sphereWmsCredentialFields()
  }

  async exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
    return sphereWmsExchangeCredentials(fields)
  }

  getAuthUrl(_state: string, _scopes?: string[]): string {
    return getAuthUrlUnsupported()
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    throw new Error('spherewms uses static API key + environment name; use credentialFields() instead')
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return credentials
  }

  private client(credentials: Credentials): SphereWmsClient {
    return new SphereWmsClient(credentials)
  }

  private listParams(params: QueryParams): Record<string, unknown> {
    return {
      limit: params.limit ?? DEFAULT_PAGE_SIZE,
      ...(params.page ? { page: params.page } : {}),
    }
  }

  // ── Products ───────────────────────────────────────────────────────────────

  async listProducts(credentials: Credentials, params: QueryParams): Promise<Product[]> {
    const res = await this.client(credentials).get<RawSphereWmsProduct[]>('/products', this.listParams(params))
    return (Array.isArray(res) ? res : []).map(transformProduct)
  }

  async getProduct(credentials: Credentials, id: string): Promise<Product> {
    const res = await this.client(credentials).get<RawSphereWmsProduct>(`/product/${id}`)
    return transformProduct(res)
  }

  // ── Stock Levels ───────────────────────────────────────────────────────────

  async listStockLevels(credentials: Credentials, params: QueryParams): Promise<StockLevel[]> {
    const res = await this.client(credentials).get<RawSphereWmsInventory[]>('/inventory', this.listParams(params))
    return (Array.isArray(res) ? res : []).map(transformStockLevel)
  }

  async getStockLevel(_credentials: Credentials, id: string): Promise<StockLevel> {
    throw new Error(`spherewms stock-level fetch is bulk-only via /inventory; call listStockLevels. id=${id}`)
  }

  // ── Locations ──────────────────────────────────────────────────────────────

  async listLocations(credentials: Credentials, params: QueryParams): Promise<Location[]> {
    const res = await this.client(credentials).get<RawSphereWmsLocation[]>('/invaccts', this.listParams(params))
    return (Array.isArray(res) ? res : []).map(transformLocation)
  }

  async getLocation(credentials: Credentials, id: string): Promise<Location> {
    const res = await this.client(credentials).get<RawSphereWmsLocation>(`/invacct/${id}`)
    return transformLocation(res)
  }

  // ── Suppliers ──────────────────────────────────────────────────────────────

  async listSuppliers(credentials: Credentials, params: QueryParams): Promise<Supplier[]> {
    const res = await this.client(credentials).get<RawSphereWmsSupplier[]>('/suppliers', this.listParams(params))
    return (Array.isArray(res) ? res : []).map(transformSupplier)
  }

  async getSupplier(credentials: Credentials, id: string): Promise<Supplier> {
    const res = await this.client(credentials).get<RawSphereWmsSupplier>(`/supplier/${id}`)
    return transformSupplier(res)
  }

  // ── Purchase Orders (Receipts) ─────────────────────────────────────────────

  async listPurchaseOrders(credentials: Credentials, params: QueryParams): Promise<PurchaseOrder[]> {
    const res = await this.client(credentials).get<RawSphereWmsReceipt[]>('/receipts', this.listParams(params))
    return (Array.isArray(res) ? res : []).map(transformPurchaseOrder)
  }

  async getPurchaseOrder(credentials: Credentials, id: string): Promise<PurchaseOrder> {
    const res = await this.client(credentials).get<RawSphereWmsReceipt>(`/receipt/${id}`)
    return transformPurchaseOrder(res)
  }

  // ── Stock Transfers ────────────────────────────────────────────────────────

  async listStockTransfers(credentials: Credentials, params: QueryParams): Promise<StockTransfer[]> {
    const res = await this.client(credentials).get<RawSphereWmsTransfer[]>('/transfer-history', this.listParams(params))
    return (Array.isArray(res) ? res : []).map(transformStockTransfer)
  }

  async getStockTransfer(credentials: Credentials, id: string): Promise<StockTransfer> {
    const res = await this.client(credentials).get<RawSphereWmsTransfer>(`/transfer-history/${id}`)
    return transformStockTransfer(res)
  }

  // ── Stock Adjustments ──────────────────────────────────────────────────────

  async listStockAdjustments(credentials: Credentials, params: QueryParams): Promise<StockAdjustment[]> {
    const res = await this.client(credentials).get<RawSphereWmsAdjustment[]>('/adjustment-history', this.listParams(params))
    return (Array.isArray(res) ? res : []).map(transformStockAdjustment)
  }

  async getStockAdjustment(credentials: Credentials, id: string): Promise<StockAdjustment> {
    const res = await this.client(credentials).get<RawSphereWmsAdjustment>(`/adjustment-history/${id}`)
    return transformStockAdjustment(res)
  }
}
