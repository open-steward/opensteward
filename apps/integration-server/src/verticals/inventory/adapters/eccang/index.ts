/**
 * ECCANG (易仓科技) adapter for the inventory vertical.
 *
 * ECCANG is a cross-border e-commerce ERP/WMS platform popular in China.
 * The Open API uses a single unified POST gateway (/openApi/api/appUnity)
 * where `interface_method` in the body selects the operation.
 *
 * Auth: api_key (appKey header) + per-request token + subject_code (tenant).
 * No webhook HMAC signing is documented; verifyWebhook/parseWebhookEvents
 * are not implemented.
 *
 * Schema-firewall: no product images, no supplier banking, no BOM/manufacturing.
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
  credentialFields as eccangCredentialFields,
  exchangeCredentials as eccangExchangeCredentials,
  getAuthUrlUnsupported,
} from './auth'
import {EccangClient} from './client'
import {DEFAULT_PAGE_SIZE} from './constants'

import {transformProduct, type RawEccangProduct} from './transform/product'
import {transformStockLevel, type RawEccangStockLevel} from './transform/stock-level'
import {transformLocation, type RawEccangLocation} from './transform/location'
import {transformSupplier, type RawEccangSupplier} from './transform/supplier'
import {transformPurchaseOrder, type RawEccangPurchaseOrder} from './transform/purchase-order'
import {transformStockTransfer, type RawEccangStockTransfer} from './transform/stock-transfer'
import {transformStockAdjustment, type RawEccangStockAdjustment} from './transform/stock-adjustment'
export type EccangAdapterConfig = Record<string, never>

export class EccangAdapter implements InventoryAdapter {
  readonly platform = 'eccang'
  readonly version = '0.1.0'

  constructor(_config: EccangAdapterConfig = {}) {}

  credentialFields(): CredentialField[] {
    return eccangCredentialFields()
  }

  async exchangeCredentials(fields: Record<string, string>) {
    return eccangExchangeCredentials(fields)
  }

  getAuthUrl(_state: string, _scopes?: string[]): string {
    return getAuthUrlUnsupported()
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    throw new Error('eccang uses static API key credentials; use credentialFields() instead')
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return credentials
  }

  private client(credentials: Credentials): EccangClient {
    return new EccangClient(credentials)
  }

  private pageParams(params: QueryParams): Record<string, unknown> {
    return {
      page: params.page ?? 1,
      page_size: params.limit ?? DEFAULT_PAGE_SIZE,
    }
  }

  // ── Products ────────────────────────────────────────────────────────────────

  async listProducts(credentials: Credentials, params: QueryParams): Promise<Product[]> {
    const res = await this.client(credentials).call<RawEccangProduct[]>('getGoodsList', this.pageParams(params))
    return (res.data ?? []).map(transformProduct)
  }

  async getProduct(credentials: Credentials, id: string): Promise<Product> {
    const res = await this.client(credentials).call<RawEccangProduct>('getGoodsDetail', { goods_id: id })
    if (!res.data) throw new Error(`eccang product ${id} not found`)
    return transformProduct(Array.isArray(res.data) ? res.data[0]! : res.data)
  }

  // ── Stock Levels ─────────────────────────────────────────────────────────────

  async listStockLevels(credentials: Credentials, params: QueryParams): Promise<StockLevel[]> {
    const res = await this.client(credentials).call<RawEccangStockLevel[]>('getStockList', this.pageParams(params))
    return (res.data ?? []).map(transformStockLevel)
  }

  async getStockLevel(_credentials: Credentials, id: string): Promise<StockLevel> {
    throw new Error(`eccang stock-level fetch is bulk-only; call listStockLevels. id=${id}`)
  }

  // ── Locations ────────────────────────────────────────────────────────────────

  async listLocations(credentials: Credentials, params: QueryParams): Promise<Location[]> {
    const res = await this.client(credentials).call<RawEccangLocation[]>('getWarehouseList', this.pageParams(params))
    return (res.data ?? []).map(transformLocation)
  }

  async getLocation(credentials: Credentials, id: string): Promise<Location> {
    const res = await this.client(credentials).call<RawEccangLocation[]>('getWarehouseDetail', { warehouse_id: id })
    const item = (res.data ?? [])[0]
    if (!item) throw new Error(`eccang location ${id} not found`)
    return transformLocation(item)
  }

  // ── Suppliers ────────────────────────────────────────────────────────────────

  async listSuppliers(credentials: Credentials, params: QueryParams): Promise<Supplier[]> {
    const res = await this.client(credentials).call<RawEccangSupplier[]>('getSupplierList', this.pageParams(params))
    return (res.data ?? []).map(transformSupplier)
  }

  async getSupplier(credentials: Credentials, id: string): Promise<Supplier> {
    const res = await this.client(credentials).call<RawEccangSupplier[]>('getSupplierDetail', { supplier_id: id })
    const item = (res.data ?? [])[0]
    if (!item) throw new Error(`eccang supplier ${id} not found`)
    return transformSupplier(item)
  }

  // ── Purchase Orders ───────────────────────────────────────────────────────────

  async listPurchaseOrders(credentials: Credentials, params: QueryParams): Promise<PurchaseOrder[]> {
    const res = await this.client(credentials).call<RawEccangPurchaseOrder[]>('getPurchaseOrderList', this.pageParams(params))
    return (res.data ?? []).map(transformPurchaseOrder)
  }

  async getPurchaseOrder(credentials: Credentials, id: string): Promise<PurchaseOrder> {
    const res = await this.client(credentials).call<RawEccangPurchaseOrder[]>('getPurchaseOrderDetail', { purchase_order_id: id })
    const item = (res.data ?? [])[0]
    if (!item) throw new Error(`eccang purchase order ${id} not found`)
    return transformPurchaseOrder(item)
  }

  // ── Stock Transfers ───────────────────────────────────────────────────────────

  async listStockTransfers(credentials: Credentials, params: QueryParams): Promise<StockTransfer[]> {
    const res = await this.client(credentials).call<RawEccangStockTransfer[]>('getTransferOrderList', this.pageParams(params))
    return (res.data ?? []).map(transformStockTransfer)
  }

  async getStockTransfer(credentials: Credentials, id: string): Promise<StockTransfer> {
    const res = await this.client(credentials).call<RawEccangStockTransfer[]>('getTransferOrderDetail', { transfer_order_id: id })
    const item = (res.data ?? [])[0]
    if (!item) throw new Error(`eccang stock transfer ${id} not found`)
    return transformStockTransfer(item)
  }

  // ── Stock Adjustments ─────────────────────────────────────────────────────────

  async listStockAdjustments(credentials: Credentials, params: QueryParams): Promise<StockAdjustment[]> {
    const res = await this.client(credentials).call<RawEccangStockAdjustment[]>('getAdjustOrderList', this.pageParams(params))
    return (res.data ?? []).map(transformStockAdjustment)
  }

  async getStockAdjustment(credentials: Credentials, id: string): Promise<StockAdjustment> {
    const res = await this.client(credentials).call<RawEccangStockAdjustment[]>('getAdjustOrderDetail', { adjust_order_id: id })
    const item = (res.data ?? [])[0]
    if (!item) throw new Error(`eccang stock adjustment ${id} not found`)
    return transformStockAdjustment(item)
  }
}
