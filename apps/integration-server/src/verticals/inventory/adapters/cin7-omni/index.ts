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
  credentialFields as cin7_omniCredentialFields,
  exchangeCredentials as cin7_omniExchangeCredentials,
  getAuthUrlUnsupported,
} from './auth'
import {Cin7OmniClient} from './client'
import {DEFAULT_PAGE_SIZE} from './constants'
import {verifyCin7OmniWebhook, parseCin7OmniWebhookEvents} from './webhook'

import {transformProduct, type RawCin7OmniProduct} from './transform/product'
import {transformStockLevel, type RawCin7OmniStockLevel} from './transform/stock-level'
import {transformLocation, type RawCin7OmniLocation} from './transform/location'
import {transformSupplier, type RawCin7OmniSupplier} from './transform/supplier'
import {transformPurchaseOrder, type RawCin7OmniPurchaseOrder} from './transform/purchase-order'
import {transformStockTransfer, type RawCin7OmniStockTransfer} from './transform/stock-transfer'
import {transformStockAdjustment, type RawCin7OmniStockAdjustment} from './transform/stock-adjustment'

export interface Cin7OmniAdapterConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
  scopes?: string[]
}

interface ListResponse<T> { Total?: number; Page?: number; ProductList?: T[]; LocationList?: T[]; SupplierList?: T[]; PurchaseList?: T[]; StockTransferList?: T[]; StockAdjustmentList?: T[]; StockOnHand?: T[] }
interface SingleResponse<T> { Product?: T; Location?: T; Supplier?: T; PurchaseOrder?: T; StockTransfer?: T; StockAdjustment?: T }

export class Cin7OmniAdapter implements InventoryAdapter {
  readonly platform = 'cin7-omni'
  readonly version = '0.1.0'

  constructor(_config: Cin7OmniAdapterConfig) {}

  credentialFields(): CredentialField[] {
    return cin7_omniCredentialFields()
  }

  async exchangeCredentials(fields: Record<string, string>) {
    return cin7_omniExchangeCredentials(fields)
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
    return verifyCin7OmniWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parseCin7OmniWebhookEvents(payload)
  }

  private client(credentials: Credentials): Cin7OmniClient {
    return new Cin7OmniClient(credentials)
  }

  private listParams(params: QueryParams): Record<string, unknown> {
    return {
      Limit: params.limit ?? DEFAULT_PAGE_SIZE,
      ...(params.page ? { Page: params.page } : {}),
    }
  }

  async listProducts(credentials: Credentials, params: QueryParams): Promise<Product[]> {
    const res = await this.client(credentials).get<ListResponse<RawCin7OmniProduct>>('/productList', this.listParams(params))
    return (res.ProductList ?? []).map(transformProduct)
  }

  async getProduct(credentials: Credentials, id: string): Promise<Product> {
    const res = await this.client(credentials).get<SingleResponse<RawCin7OmniProduct>>(`/product?ID=${id}`)
    if (!res.Product) throw new Error(`cin7-core product ${id} not found`)
    return transformProduct(res.Product)
  }

  async listStockLevels(credentials: Credentials, params: QueryParams): Promise<StockLevel[]> {
    const res = await this.client(credentials).get<ListResponse<RawCin7OmniStockLevel>>('/ref/stockonhand', this.listParams(params))
    return (res.StockOnHand ?? []).map(transformStockLevel)
  }

  async getStockLevel(_credentials: Credentials, id: string): Promise<StockLevel> {
    throw new Error(`cin7-core stock-level fetch is bulk-only; call listStockLevels. id=${id}`)
  }

  async listLocations(credentials: Credentials, params: QueryParams): Promise<Location[]> {
    const res = await this.client(credentials).get<ListResponse<RawCin7OmniLocation>>('/ref/location', this.listParams(params))
    return (res.LocationList ?? []).map(transformLocation)
  }

  async getLocation(credentials: Credentials, id: string): Promise<Location> {
    const res = await this.client(credentials).get<SingleResponse<RawCin7OmniLocation>>(`/ref/location?ID=${id}`)
    if (!res.Location) throw new Error(`cin7-core location ${id} not found`)
    return transformLocation(res.Location)
  }

  async listSuppliers(credentials: Credentials, params: QueryParams): Promise<Supplier[]> {
    const res = await this.client(credentials).get<ListResponse<RawCin7OmniSupplier>>('/supplierList', this.listParams(params))
    return (res.SupplierList ?? []).map(transformSupplier)
  }

  async getSupplier(credentials: Credentials, id: string): Promise<Supplier> {
    const res = await this.client(credentials).get<SingleResponse<RawCin7OmniSupplier>>(`/supplier?ID=${id}`)
    if (!res.Supplier) throw new Error(`cin7-core supplier ${id} not found`)
    return transformSupplier(res.Supplier)
  }

  async listPurchaseOrders(credentials: Credentials, params: QueryParams): Promise<PurchaseOrder[]> {
    const res = await this.client(credentials).get<ListResponse<RawCin7OmniPurchaseOrder>>('/purchaseList', this.listParams(params))
    return (res.PurchaseList ?? []).map(transformPurchaseOrder)
  }

  async getPurchaseOrder(credentials: Credentials, id: string): Promise<PurchaseOrder> {
    const res = await this.client(credentials).get<SingleResponse<RawCin7OmniPurchaseOrder>>(`/purchase?ID=${id}`)
    if (!res.PurchaseOrder) throw new Error(`cin7-core purchase order ${id} not found`)
    return transformPurchaseOrder(res.PurchaseOrder)
  }

  async listStockTransfers(credentials: Credentials, params: QueryParams): Promise<StockTransfer[]> {
    const res = await this.client(credentials).get<ListResponse<RawCin7OmniStockTransfer>>('/stockTransferList', this.listParams(params))
    return (res.StockTransferList ?? []).map(transformStockTransfer)
  }

  async getStockTransfer(credentials: Credentials, id: string): Promise<StockTransfer> {
    const res = await this.client(credentials).get<SingleResponse<RawCin7OmniStockTransfer>>(`/stockTransfer?ID=${id}`)
    if (!res.StockTransfer) throw new Error(`cin7-core stock transfer ${id} not found`)
    return transformStockTransfer(res.StockTransfer)
  }

  async listStockAdjustments(credentials: Credentials, params: QueryParams): Promise<StockAdjustment[]> {
    const res = await this.client(credentials).get<ListResponse<RawCin7OmniStockAdjustment>>('/stockAdjustmentList', this.listParams(params))
    return (res.StockAdjustmentList ?? []).map(transformStockAdjustment)
  }

  async getStockAdjustment(credentials: Credentials, id: string): Promise<StockAdjustment> {
    const res = await this.client(credentials).get<SingleResponse<RawCin7OmniStockAdjustment>>(`/stockAdjustment?ID=${id}`)
    if (!res.StockAdjustment) throw new Error(`cin7-core stock adjustment ${id} not found`)
    return transformStockAdjustment(res.StockAdjustment)
  }
}
