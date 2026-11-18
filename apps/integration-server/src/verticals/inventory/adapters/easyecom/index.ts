/**
 * EasyEcom adapter — omnichannel inventory management for Indian e-commerce.
 *
 * Auth: x-api-key (static) + Authorization: Bearer <jwt_token> (90-day JWT).
 * Docs: https://api-docs.easyecom.io/
 * Schema-firewall: no product images, no supplier banking, no BOM/manufacturing.
 *
 * Supported resources: products, stock-levels, locations, suppliers,
 *   purchase-orders, stock-transfers, stock-adjustments.
 * No webhook signing documented — verifyWebhook / parseWebhookEvents omitted.
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
  credentialFields as easyecomCredentialFields,
  exchangeCredentials as easyecomExchangeCredentials,
  getAuthUrlUnsupported,
} from './auth'
import {EasyEcomClient} from './client'
import {DEFAULT_PAGE_SIZE} from './constants'

import {transformProduct, type RawEasyEcomProduct} from './transform/product'
import {transformStockLevel, type RawEasyEcomStockLevel} from './transform/stock-level'
import {transformLocation, type RawEasyEcomLocation} from './transform/location'
import {transformSupplier, type RawEasyEcomSupplier} from './transform/supplier'
import {transformPurchaseOrder, type RawEasyEcomPurchaseOrder} from './transform/purchase-order'
import {transformStockTransfer, type RawEasyEcomStockTransfer} from './transform/stock-transfer'
import {transformStockAdjustment, type RawEasyEcomStockAdjustment} from './transform/stock-adjustment'

export type EasyEcomAdapterConfig = Record<string, never>

/** EasyEcom paginated list envelope */
interface EasyEcomListEnvelope<T> {
  data?: T[]
  items?: T[]
  result?: T[]
  total?: number
  page?: number
}

export class EasyEcomAdapter implements InventoryAdapter {
  readonly platform = 'easyecom'
  readonly version = '0.1.0'

  constructor(_config: EasyEcomAdapterConfig) {}

  credentialFields(): CredentialField[] {
    return easyecomCredentialFields()
  }

  async exchangeCredentials(fields: Record<string, string>) {
    return easyecomExchangeCredentials(fields)
  }

  getAuthUrl(_state: string, _scopes?: string[]): string {
    return getAuthUrlUnsupported()
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    throw new Error('easyecom uses static API key + JWT token; use credentialFields() instead')
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    // JWT tokens are valid for 90 days; no automated refresh supported via API
    return credentials
  }

  private client(credentials: Credentials): EasyEcomClient {
    return new EasyEcomClient(credentials)
  }

  private listParams(params: QueryParams): Record<string, unknown> {
    return {
      limit: params.limit ?? DEFAULT_PAGE_SIZE,
      page: params.page ?? 1,
    }
  }

  private unwrapList<T>(res: EasyEcomListEnvelope<T>): T[] {
    return res.data ?? res.items ?? res.result ?? []
  }

  async listProducts(credentials: Credentials, params: QueryParams): Promise<Product[]> {
    const res = await this.client(credentials).get<EasyEcomListEnvelope<RawEasyEcomProduct>>(
      '/inventory/getProductMaster', this.listParams(params)
    )
    return this.unwrapList(res).map(transformProduct)
  }

  async getProduct(credentials: Credentials, id: string): Promise<Product> {
    const res = await this.client(credentials).get<EasyEcomListEnvelope<RawEasyEcomProduct>>(
      '/inventory/getProductMaster', { product_id: id, limit: 1, page: 1 }
    )
    const items = this.unwrapList(res)
    if (!items.length) throw new Error(`easyecom product ${id} not found`)
    return transformProduct(items[0])
  }

  async listStockLevels(credentials: Credentials, params: QueryParams): Promise<StockLevel[]> {
    const res = await this.client(credentials).get<EasyEcomListEnvelope<RawEasyEcomStockLevel>>(
      '/inventory/getInventoryDetails', this.listParams(params)
    )
    return this.unwrapList(res).map(transformStockLevel)
  }

  async getStockLevel(_credentials: Credentials, id: string): Promise<StockLevel> {
    throw new Error(`easyecom stock-level fetch is bulk-only; call listStockLevels. id=${id}`)
  }

  async listLocations(credentials: Credentials, params: QueryParams): Promise<Location[]> {
    const res = await this.client(credentials).get<EasyEcomListEnvelope<RawEasyEcomLocation>>(
      '/inventory/getWarehouses', this.listParams(params)
    )
    return this.unwrapList(res).map(transformLocation)
  }

  async getLocation(credentials: Credentials, id: string): Promise<Location> {
    const res = await this.client(credentials).get<EasyEcomListEnvelope<RawEasyEcomLocation>>(
      '/inventory/getWarehouses', { warehouse_id: id, limit: 1, page: 1 }
    )
    const items = this.unwrapList(res)
    if (!items.length) throw new Error(`easyecom warehouse ${id} not found`)
    return transformLocation(items[0])
  }

  async listSuppliers(credentials: Credentials, params: QueryParams): Promise<Supplier[]> {
    const res = await this.client(credentials).get<EasyEcomListEnvelope<RawEasyEcomSupplier>>(
      '/vendor/getVendors', this.listParams(params)
    )
    return this.unwrapList(res).map(transformSupplier)
  }

  async getSupplier(credentials: Credentials, id: string): Promise<Supplier> {
    const res = await this.client(credentials).get<EasyEcomListEnvelope<RawEasyEcomSupplier>>(
      '/vendor/getVendors', { vendor_id: id, limit: 1, page: 1 }
    )
    const items = this.unwrapList(res)
    if (!items.length) throw new Error(`easyecom vendor ${id} not found`)
    return transformSupplier(items[0])
  }

  async listPurchaseOrders(credentials: Credentials, params: QueryParams): Promise<PurchaseOrder[]> {
    const res = await this.client(credentials).get<EasyEcomListEnvelope<RawEasyEcomPurchaseOrder>>(
      '/purchase/getPurchaseOrders', this.listParams(params)
    )
    return this.unwrapList(res).map(transformPurchaseOrder)
  }

  async getPurchaseOrder(credentials: Credentials, id: string): Promise<PurchaseOrder> {
    const res = await this.client(credentials).get<EasyEcomListEnvelope<RawEasyEcomPurchaseOrder>>(
      '/purchase/getPurchaseOrders', { purchase_order_id: id, limit: 1, page: 1 }
    )
    const items = this.unwrapList(res)
    if (!items.length) throw new Error(`easyecom purchase order ${id} not found`)
    return transformPurchaseOrder(items[0])
  }

  async listStockTransfers(credentials: Credentials, params: QueryParams): Promise<StockTransfer[]> {
    const res = await this.client(credentials).get<EasyEcomListEnvelope<RawEasyEcomStockTransfer>>(
      '/inventory/getStockTransfers', this.listParams(params)
    )
    return this.unwrapList(res).map(transformStockTransfer)
  }

  async getStockTransfer(credentials: Credentials, id: string): Promise<StockTransfer> {
    const res = await this.client(credentials).get<EasyEcomListEnvelope<RawEasyEcomStockTransfer>>(
      '/inventory/getStockTransfers', { transfer_id: id, limit: 1, page: 1 }
    )
    const items = this.unwrapList(res)
    if (!items.length) throw new Error(`easyecom stock transfer ${id} not found`)
    return transformStockTransfer(items[0])
  }

  async listStockAdjustments(credentials: Credentials, params: QueryParams): Promise<StockAdjustment[]> {
    const res = await this.client(credentials).get<EasyEcomListEnvelope<RawEasyEcomStockAdjustment>>(
      '/inventory/getStockAdjustments', this.listParams(params)
    )
    return this.unwrapList(res).map(transformStockAdjustment)
  }

  async getStockAdjustment(credentials: Credentials, id: string): Promise<StockAdjustment> {
    const res = await this.client(credentials).get<EasyEcomListEnvelope<RawEasyEcomStockAdjustment>>(
      '/inventory/getStockAdjustments', { adjustment_id: id, limit: 1, page: 1 }
    )
    const items = this.unwrapList(res)
    if (!items.length) throw new Error(`easyecom stock adjustment ${id} not found`)
    return transformStockAdjustment(items[0])
  }
}
