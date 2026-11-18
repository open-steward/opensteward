/**
 * SKULabs adapter for the inventory vertical.
 *
 * Multi-channel order management + warehouse inventory.
 * Auth: static API key via Bearer token.
 * Pagination: skip/limit with MongoDB-style selector.
 * Schema-firewall: no product images, no supplier banking, BOM refused.
 */
import type { CredentialField, Credentials, QueryParams } from '@opensteward/shared'
import { pageLocally } from '@opensteward/shared'
import type { InventoryAdapter } from '../../adapter/interface'
import type { Product } from '../../schema/product'
import type { StockLevel } from '../../schema/stock-level'
import type { Location } from '../../schema/location'
import type { Supplier } from '../../schema/supplier'
import type { PurchaseOrder } from '../../schema/purchase-order'
import type { StockTransfer } from '../../schema/stock-transfer'
import type { StockAdjustment } from '../../schema/stock-adjustment'

import {
  credentialFields as skulabsCredentialFields,
  exchangeCredentials as skulabsExchangeCredentials,
  getAuthUrlUnsupported,
} from './auth'
import {SkulabsClient} from './client'
import {DEFAULT_PAGE_SIZE} from './constants'

import {transformProduct, type RawSkulabsItem} from './transform/product'
import {transformStockLevel, type RawSkulabsInventoryItem} from './transform/stock-level'
import {transformLocation, type RawSkulabsWarehouse} from './transform/location'
import {transformSupplier, type RawSkulabsDistributor} from './transform/supplier'
import {transformPurchaseOrder, type RawSkulabsPurchaseOrder} from './transform/purchase-order'
import {transformStockTransfer, type RawSkulabsTransferOrder} from './transform/stock-transfer'
import {transformStockAdjustment, type RawSkulabsInventoryHistoryRow} from './transform/stock-adjustment'

export interface SkulabsAdapterConfig {
  // No OAuth2 config needed — SKULabs uses static API keys.
  // Reserved for future extension (e.g. per-tenant base-URL overrides).
  _placeholder?: never
}

// Response shapes
interface ItemListResponse { items?: RawSkulabsItem[] }
interface InventoryItemsResponse { items?: RawSkulabsInventoryItem[] }
interface WarehouseListResponse { warehouses?: RawSkulabsWarehouse[] }
interface DistributorListResponse { distributors?: RawSkulabsDistributor[] }
interface PurchaseOrderListResponse { purchase_orders?: RawSkulabsPurchaseOrder[] }
interface SinglePurchaseOrderResponse { purchase_order?: RawSkulabsPurchaseOrder }
interface TransferOrderAllResponse { transfer_orders?: RawSkulabsTransferOrder[] }
interface InventoryHistoryResponse { rows?: RawSkulabsInventoryHistoryRow[] }

export class SkulabsAdapter implements InventoryAdapter {
  readonly platform = 'skulabs'
  readonly version = '0.1.0'

  constructor(_config: SkulabsAdapterConfig = {}) {}

  credentialFields(): CredentialField[] {
    return skulabsCredentialFields()
  }

  async exchangeCredentials(fields: Record<string, string>) {
    return skulabsExchangeCredentials(fields)
  }

  getAuthUrl(_state: string, _scopes?: string[]): string {
    return getAuthUrlUnsupported()
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    throw new Error('skulabs uses a static API key; use credentialFields() instead')
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return credentials
  }

  private client(credentials: Credentials): SkulabsClient {
    return new SkulabsClient(credentials)
  }

  private pageParams(params: QueryParams): { limit: number; skip: number } {
    const limit = params.limit ?? DEFAULT_PAGE_SIZE
    const skip = params.page ? (params.page - 1) * limit : 0
    return { limit, skip }
  }

  async listProducts(credentials: Credentials, params: QueryParams): Promise<Product[]> {
    const { limit, skip } = this.pageParams(params)
    const res = await this.client(credentials).get<RawSkulabsItem[]>('/item/get', {
      selector: JSON.stringify({}),
      limit,
      skip,
    })
    const items = Array.isArray(res) ? res : ((res as ItemListResponse).items ?? [])
    return items.map(transformProduct)
  }

  async getProduct(credentials: Credentials, id: string): Promise<Product> {
    const res = await this.client(credentials).get<RawSkulabsItem[]>('/item/get', {
      selector: JSON.stringify({ _id: id }),
      limit: 1,
      skip: 0,
    })
    const items = Array.isArray(res) ? res : ((res as ItemListResponse).items ?? [])
    if (!items.length) throw new Error(`skulabs product ${id} not found`)
    return transformProduct(items[0])
  }

  async listStockLevels(credentials: Credentials, params: QueryParams): Promise<StockLevel[]> {
    const { limit, skip } = this.pageParams(params)
    // Get items with inventory data via item/get — includes alias_locations with on_hand data
    const itemRes = await this.client(credentials).get<RawSkulabsItem[]>('/item/get', {
      selector: JSON.stringify({}),
      limit,
      skip,
    })
    const items = Array.isArray(itemRes) ? itemRes : ((itemRes as ItemListResponse).items ?? [])
    // Fetch inventory for these items from inventory/get_items
    const itemIds = items.map((i) => i._id).filter(Boolean)
    if (!itemIds.length) return []
    const invRes = await this.client(credentials).post<InventoryItemsResponse | RawSkulabsInventoryItem[]>(
      '/inventory/get_items',
      { item_ids: itemIds },
    )
    const invItems = Array.isArray(invRes) ? invRes : ((invRes as InventoryItemsResponse).items ?? [])
    return (invItems as RawSkulabsInventoryItem[]).map(transformStockLevel)
  }

  async getStockLevel(_credentials: Credentials, id: string): Promise<StockLevel> {
    throw new Error(`skulabs stock-level fetch is bulk-only; call listStockLevels. id=${id}`)
  }

  async listLocations(credentials: Credentials, params: QueryParams): Promise<Location[]> {
    const { limit, skip } = this.pageParams(params)
    const res = await this.client(credentials).get<RawSkulabsWarehouse[] | WarehouseListResponse>('/warehouse/get', {
      selector: JSON.stringify({}),
      limit,
      skip,
    })
    const warehouses = Array.isArray(res) ? res : ((res as WarehouseListResponse).warehouses ?? [])
    return (warehouses as RawSkulabsWarehouse[]).map(transformLocation)
  }

  async getLocation(credentials: Credentials, id: string): Promise<Location> {
    const res = await this.client(credentials).get<RawSkulabsWarehouse[] | WarehouseListResponse>('/warehouse/get', {
      selector: JSON.stringify({ _id: id }),
      limit: 1,
      skip: 0,
    })
    const warehouses = Array.isArray(res) ? res : ((res as WarehouseListResponse).warehouses ?? [])
    if (!(warehouses as RawSkulabsWarehouse[]).length) throw new Error(`skulabs warehouse ${id} not found`)
    return transformLocation((warehouses as RawSkulabsWarehouse[])[0])
  }

  async listSuppliers(credentials: Credentials, params: QueryParams): Promise<Supplier[]> {
    const { limit, skip } = this.pageParams(params)
    const res = await this.client(credentials).get<RawSkulabsDistributor[] | DistributorListResponse>('/distributor/get', {
      selector: JSON.stringify({}),
      limit,
      skip,
    })
    const distributors = Array.isArray(res) ? res : ((res as DistributorListResponse).distributors ?? [])
    return (distributors as RawSkulabsDistributor[]).map(transformSupplier)
  }

  async getSupplier(credentials: Credentials, id: string): Promise<Supplier> {
    const res = await this.client(credentials).get<RawSkulabsDistributor[] | DistributorListResponse>('/distributor/get', {
      selector: JSON.stringify({ _id: id }),
      limit: 1,
      skip: 0,
    })
    const distributors = Array.isArray(res) ? res : ((res as DistributorListResponse).distributors ?? [])
    if (!(distributors as RawSkulabsDistributor[]).length) throw new Error(`skulabs distributor ${id} not found`)
    return transformSupplier((distributors as RawSkulabsDistributor[])[0])
  }

  async listPurchaseOrders(credentials: Credentials, params: QueryParams): Promise<PurchaseOrder[]> {
    const { limit, skip } = this.pageParams(params)
    const res = await this.client(credentials).get<RawSkulabsPurchaseOrder[] | PurchaseOrderListResponse>('/purchase_order/get', {
      selector: JSON.stringify({}),
      limit,
      skip,
    })
    const orders = Array.isArray(res) ? res : ((res as PurchaseOrderListResponse).purchase_orders ?? [])
    return (orders as RawSkulabsPurchaseOrder[]).map(transformPurchaseOrder)
  }

  async getPurchaseOrder(credentials: Credentials, id: string): Promise<PurchaseOrder> {
    const res = await this.client(credentials).get<RawSkulabsPurchaseOrder | SinglePurchaseOrderResponse>('/purchase_order/get_single', {
      id,
    })
    const po = (res as SinglePurchaseOrderResponse).purchase_order ?? (res as RawSkulabsPurchaseOrder)
    if (!po || !po._id) throw new Error(`skulabs purchase order ${id} not found`)
    return transformPurchaseOrder(po)
  }

  async listStockTransfers(credentials: Credentials, params: QueryParams): Promise<StockTransfer[]> {
    // transfer_order/get_all requires start+end date range; use trailing 90-day window
    const end = new Date()
    const start = new Date(end.getTime() - 90 * 24 * 60 * 60 * 1000)
    const res = await this.client(credentials).get<TransferOrderAllResponse>('/transfer_order/get_all', {
      start: start.toISOString(),
      end: end.toISOString(),
    })
    // Documented parameters are start and end only, and the response is every
    // transfer in the window: no limit, skip, page or cursor. Slice it into the
    // caller's page and report the total.
    return pageLocally(res.transfer_orders ?? [], params).map(transformStockTransfer)
  }

  async getStockTransfer(credentials: Credentials, id: string): Promise<StockTransfer> {
    const res = await this.client(credentials).get<{ transfer_order?: RawSkulabsTransferOrder } | RawSkulabsTransferOrder>('/transfer_order/get', {
      selector: JSON.stringify({ _id: id }),
      limit: 1,
      skip: 0,
    })
    const transfer = (res as { transfer_order?: RawSkulabsTransferOrder }).transfer_order ?? (res as RawSkulabsTransferOrder)
    if (!transfer || !(transfer as RawSkulabsTransferOrder)._id) throw new Error(`skulabs transfer order ${id} not found`)
    return transformStockTransfer(transfer as RawSkulabsTransferOrder)
  }

  async listStockAdjustments(credentials: Credentials, params: QueryParams): Promise<StockAdjustment[]> {
    // inventory/get_history requires start+end; use trailing 30-day window
    const end = new Date()
    const start = new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000)
    const res = await this.client(credentials).get<InventoryHistoryResponse>('/inventory/get_history', {
      start: start.toISOString().slice(0, 10),
      end: end.toISOString().slice(0, 10),
    })
    // Documented parameters are start, end and notes, and the response is every
    // history row in the window: no limit, skip, page or cursor. Slice it into
    // the caller's page and report the total.
    return pageLocally(res.rows ?? [], params).map(transformStockAdjustment)
  }

  async getStockAdjustment(_credentials: Credentials, id: string): Promise<StockAdjustment> {
    throw new Error(`skulabs stock-adjustment fetch is history-bulk-only; call listStockAdjustments. id=${id}`)
  }
}
