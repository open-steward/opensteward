/**
 * Restaurant365 (R365) inventory adapter.
 *
 * Restaurant365 is a restaurant-focused ERP providing accounting, inventory,
 * scheduling, and purchasing management for multi-unit restaurant operators.
 *
 * API surfaces used:
 *   OData read API  — https://odata.restaurant365.net/api/v2/views/
 *   Entities: Item, Location, Company (vendors), Transaction, TransactionDetail
 *   Pagination: OData $top / $skip
 *
 * Auth: api_key — bearer token issued by R365 Support to integration partners.
 *   accessToken = bearer token
 *   extra.subdomain = tenant subdomain (e.g. "mycompany" from mycompany.restaurant365.com)
 *
 * Supported resources:
 *   - products     (Item entity)
 *   - locations    (Location entity)
 *   - suppliers    (Company entity)
 *   - stock-levels (TransactionDetail where rowType=InventoryCount)
 *   - purchase-orders (Transaction where type=AP Invoice)
 *   - stock-adjustments (Transaction where type=Inventory Adjustment)
 *   - stock-transfers (Transaction where type=Item Transfer)
 *
 * Not supported / not documented:
 *   - Webhooks: R365 does not publish HMAC/JWT webhook signing documentation
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
  credentialFields as r365CredentialFields,
  exchangeCredentials as r365ExchangeCredentials,
  getAuthUrlUnsupported,
} from './auth'
import {Restaurant365Client} from './client'
import {DEFAULT_PAGE_SIZE} from './constants'

import {transformProduct, type RawR365Item} from './transform/product'
import {transformStockLevel, type RawR365TransactionDetail} from './transform/stock-level'
import {transformLocation, type RawR365Location} from './transform/location'
import {transformSupplier, type RawR365Company} from './transform/supplier'
import {transformPurchaseOrder, type RawR365PurchaseTransaction} from './transform/purchase-order'
import {transformStockTransfer, type RawR365TransferTransaction} from './transform/stock-transfer'
import {transformStockAdjustment, type RawR365AdjustmentTransaction} from './transform/stock-adjustment'

export interface Restaurant365AdapterConfig {
  /** No OAuth config needed — R365 uses static bearer tokens. */
  [key: string]: unknown
}

/** OData collection envelope: { value: T[] } */
interface ODataList<T> { value: T[] }

export class Restaurant365Adapter implements InventoryAdapter {
  readonly platform = 'restaurant365'
  readonly version = '0.1.0'

  constructor(_config: Restaurant365AdapterConfig) {}

  credentialFields(): CredentialField[] {
    return r365CredentialFields()
  }

  async exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
    return r365ExchangeCredentials(fields)
  }

  getAuthUrl(_state: string, _scopes?: string[]): string {
    return getAuthUrlUnsupported()
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    throw new Error('restaurant365 uses static bearer token; use credentialFields() instead')
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return credentials
  }

  private client(credentials: Credentials): Restaurant365Client {
    return new Restaurant365Client(credentials)
  }

  /** Build OData $top / $skip params from QueryParams. */
  private odataParams(params: QueryParams): Record<string, unknown> {
    const top = params.limit ?? DEFAULT_PAGE_SIZE
    const skip = params.page != null ? (params.page - 1) * top : undefined
    return {
      $top: top,
      ...(skip != null ? { $skip: skip } : {}),
    }
  }

  // ── Products (Item entity) ─────────────────────────────────────────────────

  async listProducts(credentials: Credentials, params: QueryParams): Promise<Product[]> {
    const res = await this.client(credentials).get<ODataList<RawR365Item>>('/Item', this.odataParams(params))
    return (res.value ?? []).map(transformProduct)
  }

  async getProduct(credentials: Credentials, id: string): Promise<Product> {
    const res = await this.client(credentials).get<ODataList<RawR365Item>>('/Item', {
      $filter: `itemId eq ${id}`,
      $top: 1,
    })
    const item = (res.value ?? [])[0]
    if (!item) throw new Error(`restaurant365 item ${id} not found`)
    return transformProduct(item)
  }

  // ── Locations ──────────────────────────────────────────────────────────────

  async listLocations(credentials: Credentials, params: QueryParams): Promise<Location[]> {
    const res = await this.client(credentials).get<ODataList<RawR365Location>>('/Location', this.odataParams(params))
    return (res.value ?? []).map(transformLocation)
  }

  async getLocation(credentials: Credentials, id: string): Promise<Location> {
    const res = await this.client(credentials).get<ODataList<RawR365Location>>('/Location', {
      $filter: `locationId eq ${id}`,
      $top: 1,
    })
    const loc = (res.value ?? [])[0]
    if (!loc) throw new Error(`restaurant365 location ${id} not found`)
    return transformLocation(loc)
  }

  // ── Suppliers (Company entity) ─────────────────────────────────────────────

  async listSuppliers(credentials: Credentials, params: QueryParams): Promise<Supplier[]> {
    const res = await this.client(credentials).get<ODataList<RawR365Company>>('/Company', this.odataParams(params))
    return (res.value ?? []).map(transformSupplier)
  }

  async getSupplier(credentials: Credentials, id: string): Promise<Supplier> {
    const res = await this.client(credentials).get<ODataList<RawR365Company>>('/Company', {
      $filter: `companyId eq ${id}`,
      $top: 1,
    })
    const company = (res.value ?? [])[0]
    if (!company) throw new Error(`restaurant365 company/supplier ${id} not found`)
    return transformSupplier(company)
  }

  // ── StockLevels (TransactionDetail, rowType=Inventory Count) ───────────────

  async listStockLevels(credentials: Credentials, params: QueryParams): Promise<StockLevel[]> {
    const odataParams = {
      ...this.odataParams(params),
      $filter: "rowType eq 'Inventory Count'",
    }
    const res = await this.client(credentials).get<ODataList<RawR365TransactionDetail>>('/TransactionDetail', odataParams)
    return (res.value ?? []).map(transformStockLevel)
  }

  async getStockLevel(_credentials: Credentials, id: string): Promise<StockLevel> {
    throw new Error(`restaurant365 stock-levels are bulk-only via TransactionDetail; call listStockLevels. id=${id}`)
  }

  // ── PurchaseOrders (Transaction, type=AP Invoice) ──────────────────────────

  async listPurchaseOrders(credentials: Credentials, params: QueryParams): Promise<PurchaseOrder[]> {
    const odataParams = {
      ...this.odataParams(params),
      $filter: "type eq 'AP Invoice'",
    }
    const res = await this.client(credentials).get<ODataList<RawR365PurchaseTransaction>>('/Transaction', odataParams)
    return (res.value ?? []).map(transformPurchaseOrder)
  }

  async getPurchaseOrder(credentials: Credentials, id: string): Promise<PurchaseOrder> {
    const res = await this.client(credentials).get<ODataList<RawR365PurchaseTransaction>>('/Transaction', {
      $filter: `transactionId eq ${id} and type eq 'AP Invoice'`,
      $top: 1,
    })
    const tx = (res.value ?? [])[0]
    if (!tx) throw new Error(`restaurant365 AP Invoice transaction ${id} not found`)
    return transformPurchaseOrder(tx)
  }

  // ── StockTransfers (Transaction, type=Item Transfer) ───────────────────────

  async listStockTransfers(credentials: Credentials, params: QueryParams): Promise<StockTransfer[]> {
    const odataParams = {
      ...this.odataParams(params),
      $filter: "type eq 'Item Transfer'",
    }
    const res = await this.client(credentials).get<ODataList<RawR365TransferTransaction>>('/Transaction', odataParams)
    return (res.value ?? []).map(transformStockTransfer)
  }

  async getStockTransfer(credentials: Credentials, id: string): Promise<StockTransfer> {
    const res = await this.client(credentials).get<ODataList<RawR365TransferTransaction>>('/Transaction', {
      $filter: `transactionId eq ${id} and type eq 'Item Transfer'`,
      $top: 1,
    })
    const tx = (res.value ?? [])[0]
    if (!tx) throw new Error(`restaurant365 Item Transfer transaction ${id} not found`)
    return transformStockTransfer(tx)
  }

  // ── StockAdjustments (Transaction, type=Inventory Adjustment) ─────────────

  async listStockAdjustments(credentials: Credentials, params: QueryParams): Promise<StockAdjustment[]> {
    const odataParams = {
      ...this.odataParams(params),
      $filter: "type eq 'Inventory Adjustment' or type eq 'Inventory Count'",
    }
    const res = await this.client(credentials).get<ODataList<RawR365AdjustmentTransaction>>('/Transaction', odataParams)
    return (res.value ?? []).map(transformStockAdjustment)
  }

  async getStockAdjustment(credentials: Credentials, id: string): Promise<StockAdjustment> {
    const res = await this.client(credentials).get<ODataList<RawR365AdjustmentTransaction>>('/Transaction', {
      $filter: `transactionId eq ${id}`,
      $top: 1,
    })
    const tx = (res.value ?? [])[0]
    if (!tx) throw new Error(`restaurant365 inventory adjustment/count transaction ${id} not found`)
    return transformStockAdjustment(tx)
  }
}
