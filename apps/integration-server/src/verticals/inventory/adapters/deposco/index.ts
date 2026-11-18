/**
 * Deposco adapter for the inventory vertical.
 *
 * Auth: API key via Authorization header.
 * Base URL: https://api.deposco.com/api/v1
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
  credentialFields as deposcoCredentialFields,
  exchangeCredentials as deposcoExchangeCredentials,
  getAuthUrlUnsupported,
} from './auth'
import {DeposcoClient} from './client'
import {DEFAULT_PAGE_SIZE} from './constants'

import {transformProduct, type RawDeposcoItem} from './transform/product'
import {transformStockLevel, type RawDeposcoInventory} from './transform/stock-level'
import {transformLocation, type RawDeposcoFacility} from './transform/location'
import {transformSupplier, type RawDeposcoVendor} from './transform/supplier'
import {transformPurchaseOrder, type RawDeposcoPurchaseOrder} from './transform/purchase-order'
import {transformStockTransfer, type RawDeposcoTransferOrder} from './transform/stock-transfer'
import {transformStockAdjustment, type RawDeposcoAdjustment} from './transform/stock-adjustment'

export interface DeposcoAdapterConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
  scopes?: string[]
}

interface ListResponse<T> { Total?: number; Page?: number; ProductList?: T[]; LocationList?: T[]; SupplierList?: T[]; PurchaseList?: T[]; StockTransferList?: T[]; StockAdjustmentList?: T[]; StockOnHand?: T[] }
interface SingleResponse<T> { Product?: T; Location?: T; Supplier?: T; PurchaseOrder?: T; StockTransfer?: T; StockAdjustment?: T }

export class DeposcoAdapter implements InventoryAdapter {
  readonly platform = 'deposco'
  readonly version = '0.1.0'

  constructor(_config: DeposcoAdapterConfig) {}

  credentialFields(): CredentialField[] {
    return deposcoCredentialFields()
  }

  async exchangeCredentials(fields: Record<string, string>) {
    return deposcoExchangeCredentials(fields)
  }

  getAuthUrl(_state: string, _scopes?: string[]): string {
    return getAuthUrlUnsupported()
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    throw new Error('deposco uses HTTP Basic Auth; use credentialFields() instead')
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return credentials
  }

  private client(credentials: Credentials): DeposcoClient {
    return new DeposcoClient(credentials)
  }

  private listParams(params: QueryParams): Record<string, unknown> {
    return {
      Limit: params.limit ?? DEFAULT_PAGE_SIZE,
      ...(params.page ? { Page: params.page } : {}),
    }
  }

  async listProducts(credentials: Credentials, params: QueryParams): Promise<Product[]> {
    const res = await this.client(credentials).get<ListResponse<RawDeposcoItem>>('/productList', this.listParams(params))
    return (res.ProductList ?? []).map(transformProduct)
  }

  async getProduct(credentials: Credentials, id: string): Promise<Product> {
    const res = await this.client(credentials).get<SingleResponse<RawDeposcoItem>>(`/product?ID=${id}`)
    if (!res.Product) throw new Error(`deposco product ${id} not found`)
    return transformProduct(res.Product)
  }

  async listStockLevels(credentials: Credentials, params: QueryParams): Promise<StockLevel[]> {
    const res = await this.client(credentials).get<ListResponse<RawDeposcoInventory>>('/ref/stockonhand', this.listParams(params))
    return (res.StockOnHand ?? []).map(transformStockLevel)
  }

  async getStockLevel(_credentials: Credentials, id: string): Promise<StockLevel> {
    throw new Error(`deposco stock-level fetch is bulk-only; call listStockLevels. id=${id}`)
  }

  async listLocations(credentials: Credentials, params: QueryParams): Promise<Location[]> {
    const res = await this.client(credentials).get<ListResponse<RawDeposcoFacility>>('/ref/location', this.listParams(params))
    return (res.LocationList ?? []).map(transformLocation)
  }

  async getLocation(credentials: Credentials, id: string): Promise<Location> {
    const res = await this.client(credentials).get<SingleResponse<RawDeposcoFacility>>(`/ref/location?ID=${id}`)
    if (!res.Location) throw new Error(`deposco location ${id} not found`)
    return transformLocation(res.Location)
  }

  async listSuppliers(credentials: Credentials, params: QueryParams): Promise<Supplier[]> {
    const res = await this.client(credentials).get<ListResponse<RawDeposcoVendor>>('/supplierList', this.listParams(params))
    return (res.SupplierList ?? []).map(transformSupplier)
  }

  async getSupplier(credentials: Credentials, id: string): Promise<Supplier> {
    const res = await this.client(credentials).get<SingleResponse<RawDeposcoVendor>>(`/supplier?ID=${id}`)
    if (!res.Supplier) throw new Error(`deposco supplier ${id} not found`)
    return transformSupplier(res.Supplier)
  }

  async listPurchaseOrders(credentials: Credentials, params: QueryParams): Promise<PurchaseOrder[]> {
    const res = await this.client(credentials).get<ListResponse<RawDeposcoPurchaseOrder>>('/purchaseList', this.listParams(params))
    return (res.PurchaseList ?? []).map(transformPurchaseOrder)
  }

  async getPurchaseOrder(credentials: Credentials, id: string): Promise<PurchaseOrder> {
    const res = await this.client(credentials).get<SingleResponse<RawDeposcoPurchaseOrder>>(`/purchase?ID=${id}`)
    if (!res.PurchaseOrder) throw new Error(`deposco purchase order ${id} not found`)
    return transformPurchaseOrder(res.PurchaseOrder)
  }

  async listStockTransfers(credentials: Credentials, params: QueryParams): Promise<StockTransfer[]> {
    const res = await this.client(credentials).get<ListResponse<RawDeposcoTransferOrder>>('/stockTransferList', this.listParams(params))
    return (res.StockTransferList ?? []).map(transformStockTransfer)
  }

  async getStockTransfer(credentials: Credentials, id: string): Promise<StockTransfer> {
    const res = await this.client(credentials).get<SingleResponse<RawDeposcoTransferOrder>>(`/stockTransfer?ID=${id}`)
    if (!res.StockTransfer) throw new Error(`deposco stock transfer ${id} not found`)
    return transformStockTransfer(res.StockTransfer)
  }

  async listStockAdjustments(credentials: Credentials, params: QueryParams): Promise<StockAdjustment[]> {
    const res = await this.client(credentials).get<ListResponse<RawDeposcoAdjustment>>('/stockAdjustmentList', this.listParams(params))
    return (res.StockAdjustmentList ?? []).map(transformStockAdjustment)
  }

  async getStockAdjustment(credentials: Credentials, id: string): Promise<StockAdjustment> {
    const res = await this.client(credentials).get<SingleResponse<RawDeposcoAdjustment>>(`/stockAdjustment?ID=${id}`)
    if (!res.StockAdjustment) throw new Error(`deposco stock adjustment ${id} not found`)
    return transformStockAdjustment(res.StockAdjustment)
  }
}
