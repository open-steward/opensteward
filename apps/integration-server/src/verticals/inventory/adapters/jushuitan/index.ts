/**
 * Jushuitan (聚水潭) adapter for the inventory vertical.
 *
 * Jushuitan is a Chinese SaaS ERP/WMS platform. Auth: app_key + app_secret +
 * access_token. All API calls are POST with form-encoded body; business params
 * go into the `biz` JSON field; requests are signed with MD5.
 *
 * Supported resources: products, stock-levels, locations, suppliers,
 *   purchase-orders, stock-adjustments.
 * Not supported: stock-transfers (no public API endpoint documented).
 * Webhooks: not implemented (no HMAC/JWT signing documented).
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
  credentialFields as jushuitanCredentialFields,
  exchangeCredentials as jushuitanExchangeCredentials,
  getAuthUrlUnsupported,
} from './auth'
import {JushuitanClient} from './client'
import {DEFAULT_PAGE_SIZE} from './constants'

import {transformProduct, type RawJushuitanProduct} from './transform/product'
import {transformStockLevel, type RawJushuitanStockLevel} from './transform/stock-level'
import {transformLocation, type RawJushuitanLocation} from './transform/location'
import {transformSupplier, type RawJushuitanSupplier} from './transform/supplier'
import {transformPurchaseOrder, type RawJushuitanPurchaseOrder} from './transform/purchase-order'
import {transformStockAdjustment, type RawJushuitanStockAdjustment} from './transform/stock-adjustment'

export type JushuitanAdapterConfig = Record<string, never>

/** Shape returned by Jushuitan list endpoints — items in `datas` array. */
interface JushuitanListData<T> {
  datas?: T[]
  total?: number
  page_index?: number
}

export class JushuitanAdapter implements InventoryAdapter {
  readonly platform = 'jushuitan'
  readonly version = '0.1.0'

  constructor(_config: JushuitanAdapterConfig = {}) {}

  credentialFields(): CredentialField[] {
    return jushuitanCredentialFields()
  }

  async exchangeCredentials(fields: Record<string, string>) {
    return jushuitanExchangeCredentials(fields)
  }

  getAuthUrl(_state: string, _scopes?: string[]): string {
    return getAuthUrlUnsupported()
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    throw new Error('jushuitan uses app_key + app_secret + access_token; use credentialFields() instead')
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    // Access tokens do not auto-refresh via this adapter; return as-is.
    return credentials
  }

  private client(credentials: Credentials): JushuitanClient {
    return new JushuitanClient(credentials)
  }

  private bizPageParams(params: QueryParams): Record<string, unknown> {
    return {
      page_index: params.page ?? 1,
      page_size: params.limit ?? DEFAULT_PAGE_SIZE,
    }
  }

  // ── Products ────────────────────────────────────────────────────────────────

  async listProducts(credentials: Credentials, params: QueryParams): Promise<Product[]> {
    const res = await this.client(credentials).post<JushuitanListData<RawJushuitanProduct>>(
      '/open/sku/query',
      this.bizPageParams(params),
    )
    return (res?.datas ?? []).map(transformProduct)
  }

  async getProduct(credentials: Credentials, id: string): Promise<Product> {
    const res = await this.client(credentials).post<JushuitanListData<RawJushuitanProduct>>(
      '/open/sku/query',
      { sku_ids: [Number(id)], page_index: 1, page_size: 1 },
    )
    const item = (res?.datas ?? [])[0]
    if (!item) throw new Error(`jushuitan product ${id} not found`)
    return transformProduct(item)
  }

  // ── StockLevels ─────────────────────────────────────────────────────────────

  async listStockLevels(credentials: Credentials, params: QueryParams): Promise<StockLevel[]> {
    const res = await this.client(credentials).post<JushuitanListData<RawJushuitanStockLevel>>(
      '/open/inventory/query',
      this.bizPageParams(params),
    )
    return (res?.datas ?? []).map(transformStockLevel)
  }

  async getStockLevel(_credentials: Credentials, id: string): Promise<StockLevel> {
    throw new Error(`jushuitan stock-level fetch is bulk-only; call listStockLevels. id=${id}`)
  }

  // ── Locations ───────────────────────────────────────────────────────────────

  async listLocations(credentials: Credentials, params: QueryParams): Promise<Location[]> {
    const res = await this.client(credentials).post<JushuitanListData<RawJushuitanLocation>>(
      '/open/wms/partner/query',
      this.bizPageParams(params),
    )
    return (res?.datas ?? []).map(transformLocation)
  }

  async getLocation(credentials: Credentials, id: string): Promise<Location> {
    const res = await this.client(credentials).post<JushuitanListData<RawJushuitanLocation>>(
      '/open/wms/partner/query',
      { wms_co_id: Number(id), page_index: 1, page_size: 1 },
    )
    const item = (res?.datas ?? [])[0]
    if (!item) throw new Error(`jushuitan location ${id} not found`)
    return transformLocation(item)
  }

  // ── Suppliers ───────────────────────────────────────────────────────────────

  async listSuppliers(credentials: Credentials, params: QueryParams): Promise<Supplier[]> {
    const res = await this.client(credentials).post<JushuitanListData<RawJushuitanSupplier>>(
      '/open/supplier/query',
      this.bizPageParams(params),
    )
    return (res?.datas ?? []).map(transformSupplier)
  }

  async getSupplier(credentials: Credentials, id: string): Promise<Supplier> {
    const res = await this.client(credentials).post<JushuitanListData<RawJushuitanSupplier>>(
      '/open/supplier/query',
      { supplier_id: Number(id), page_index: 1, page_size: 1 },
    )
    const item = (res?.datas ?? [])[0]
    if (!item) throw new Error(`jushuitan supplier ${id} not found`)
    return transformSupplier(item)
  }

  // ── PurchaseOrders ──────────────────────────────────────────────────────────

  async listPurchaseOrders(credentials: Credentials, params: QueryParams): Promise<PurchaseOrder[]> {
    const res = await this.client(credentials).post<JushuitanListData<RawJushuitanPurchaseOrder>>(
      '/open/purchase/query',
      this.bizPageParams(params),
    )
    return (res?.datas ?? []).map(transformPurchaseOrder)
  }

  async getPurchaseOrder(credentials: Credentials, id: string): Promise<PurchaseOrder> {
    const res = await this.client(credentials).post<JushuitanListData<RawJushuitanPurchaseOrder>>(
      '/open/purchase/query',
      { po_id: Number(id), page_index: 1, page_size: 1 },
    )
    const item = (res?.datas ?? [])[0]
    if (!item) throw new Error(`jushuitan purchase order ${id} not found`)
    return transformPurchaseOrder(item)
  }

  // ── StockAdjustments ────────────────────────────────────────────────────────

  async listStockAdjustments(credentials: Credentials, params: QueryParams): Promise<StockAdjustment[]> {
    const res = await this.client(credentials).post<JushuitanListData<RawJushuitanStockAdjustment>>(
      '/open/inventory/count/query',
      this.bizPageParams(params),
    )
    return (res?.datas ?? []).map(transformStockAdjustment)
  }

  async getStockAdjustment(credentials: Credentials, id: string): Promise<StockAdjustment> {
    const res = await this.client(credentials).post<JushuitanListData<RawJushuitanStockAdjustment>>(
      '/open/inventory/count/query',
      { check_id: Number(id), page_index: 1, page_size: 1 },
    )
    const item = (res?.datas ?? [])[0]
    if (!item) throw new Error(`jushuitan stock adjustment ${id} not found`)
    return transformStockAdjustment(item)
  }
}
