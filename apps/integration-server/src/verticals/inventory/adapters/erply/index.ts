/**
 * Cin7 Core adapter — reference implementation for the inventory vertical.
 *
 * Formerly DEAR Systems. Multi-channel inventory + light manufacturing.
 * Auth: api-key + account-id pair via custom headers.
 * Schema-firewall: no product images, no supplier banking, BOM refused.
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
import type { WebhookEvent } from '../../schema/webhook'

import {
  credentialFields as erplyCredentialFields,
  exchangeCredentials as erplyExchangeCredentials,
  getAuthUrlUnsupported,
} from './auth'
import {ErplyClient} from './client'
import {DEFAULT_PAGE_SIZE} from './constants'
import {verifyErplyWebhook, parseErplyWebhookEvents} from './webhook'

import {transformProduct, type RawErplyProduct} from './transform/product'
import {transformStockLevel, type RawErplyStockLevel} from './transform/stock-level'
import {transformLocation, type RawErplyLocation} from './transform/location'
import {transformSupplier, type RawErplySupplier} from './transform/supplier'
import {transformPurchaseOrder, type RawErplyPurchaseOrder} from './transform/purchase-order'
import {transformStockTransfer, type RawErplyStockTransfer} from './transform/stock-transfer'
import {transformStockAdjustment, type RawErplyStockAdjustment} from './transform/stock-adjustment'

export interface ErplyAdapterConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
  scopes?: string[]
}

interface ListResponse<T> { Total?: number; Page?: number; ProductList?: T[]; LocationList?: T[]; SupplierList?: T[]; PurchaseList?: T[]; StockTransferList?: T[]; StockAdjustmentList?: T[]; StockOnHand?: T[] }
interface SingleResponse<T> { Product?: T; Location?: T; Supplier?: T; PurchaseOrder?: T; StockTransfer?: T; StockAdjustment?: T }

export class ErplyAdapter implements InventoryAdapter {
  readonly platform = 'erply'
  readonly version = '0.1.0'

  constructor(_config: ErplyAdapterConfig) {}

  credentialFields(): CredentialField[] {
    return erplyCredentialFields()
  }

  async exchangeCredentials(fields: Record<string, string>) {
    return erplyExchangeCredentials(fields)
  }

  getAuthUrl(_state: string, _scopes?: string[]): string {
    return getAuthUrlUnsupported()
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    throw new Error('cin7-core uses static API key + account-id; use credentialFields() instead')
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return credentials
  }

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return verifyErplyWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parseErplyWebhookEvents(payload)
  }

  private client(credentials: Credentials): ErplyClient {
    return new ErplyClient(credentials)
  }

  private listParams(params: QueryParams): Record<string, unknown> {
    return {
      Limit: params.limit ?? DEFAULT_PAGE_SIZE,
      ...(params.page ? { Page: params.page } : {}),
    }
  }

  async listProducts(credentials: Credentials, params: QueryParams): Promise<Product[]> {
    const res = await this.client(credentials).get<ListResponse<RawErplyProduct>>('/productList', this.listParams(params))
    return (res.ProductList ?? []).map(transformProduct)
  }

  async getProduct(credentials: Credentials, id: string): Promise<Product> {
    const res = await this.client(credentials).get<SingleResponse<RawErplyProduct>>(`/product?ID=${id}`)
    if (!res.Product) throw new Error(`cin7-core product ${id} not found`)
    return transformProduct(res.Product)
  }

  async listStockLevels(credentials: Credentials, params: QueryParams): Promise<StockLevel[]> {
    const res = await this.client(credentials).get<ListResponse<RawErplyStockLevel>>('/ref/stockonhand', this.listParams(params))
    return (res.StockOnHand ?? []).map(transformStockLevel)
  }

  async getStockLevel(_credentials: Credentials, id: string): Promise<StockLevel> {
    throw new Error(`cin7-core stock-level fetch is bulk-only; call listStockLevels. id=${id}`)
  }

  async listLocations(credentials: Credentials, params: QueryParams): Promise<Location[]> {
    const res = await this.client(credentials).get<ListResponse<RawErplyLocation>>('/ref/location', this.listParams(params))
    return (res.LocationList ?? []).map(transformLocation)
  }

  async getLocation(credentials: Credentials, id: string): Promise<Location> {
    const res = await this.client(credentials).get<SingleResponse<RawErplyLocation>>(`/ref/location?ID=${id}`)
    if (!res.Location) throw new Error(`cin7-core location ${id} not found`)
    return transformLocation(res.Location)
  }

  async listSuppliers(credentials: Credentials, params: QueryParams): Promise<Supplier[]> {
    const res = await this.client(credentials).get<ListResponse<RawErplySupplier>>('/supplierList', this.listParams(params))
    return (res.SupplierList ?? []).map(transformSupplier)
  }

  async getSupplier(credentials: Credentials, id: string): Promise<Supplier> {
    const res = await this.client(credentials).get<SingleResponse<RawErplySupplier>>(`/supplier?ID=${id}`)
    if (!res.Supplier) throw new Error(`cin7-core supplier ${id} not found`)
    return transformSupplier(res.Supplier)
  }

  async listPurchaseOrders(credentials: Credentials, params: QueryParams): Promise<PurchaseOrder[]> {
    const res = await this.client(credentials).get<ListResponse<RawErplyPurchaseOrder>>('/purchaseList', this.listParams(params))
    return (res.PurchaseList ?? []).map(transformPurchaseOrder)
  }

  async getPurchaseOrder(credentials: Credentials, id: string): Promise<PurchaseOrder> {
    const res = await this.client(credentials).get<SingleResponse<RawErplyPurchaseOrder>>(`/purchase?ID=${id}`)
    if (!res.PurchaseOrder) throw new Error(`cin7-core purchase order ${id} not found`)
    return transformPurchaseOrder(res.PurchaseOrder)
  }

  async listStockTransfers(credentials: Credentials, params: QueryParams): Promise<StockTransfer[]> {
    const res = await this.client(credentials).get<ListResponse<RawErplyStockTransfer>>('/stockTransferList', this.listParams(params))
    return (res.StockTransferList ?? []).map(transformStockTransfer)
  }

  async getStockTransfer(credentials: Credentials, id: string): Promise<StockTransfer> {
    const res = await this.client(credentials).get<SingleResponse<RawErplyStockTransfer>>(`/stockTransfer?ID=${id}`)
    if (!res.StockTransfer) throw new Error(`cin7-core stock transfer ${id} not found`)
    return transformStockTransfer(res.StockTransfer)
  }

  async listStockAdjustments(credentials: Credentials, params: QueryParams): Promise<StockAdjustment[]> {
    const res = await this.client(credentials).get<ListResponse<RawErplyStockAdjustment>>('/stockAdjustmentList', this.listParams(params))
    return (res.StockAdjustmentList ?? []).map(transformStockAdjustment)
  }

  async getStockAdjustment(credentials: Credentials, id: string): Promise<StockAdjustment> {
    const res = await this.client(credentials).get<SingleResponse<RawErplyStockAdjustment>>(`/stockAdjustment?ID=${id}`)
    if (!res.StockAdjustment) throw new Error(`cin7-core stock adjustment ${id} not found`)
    return transformStockAdjustment(res.StockAdjustment)
  }
}
