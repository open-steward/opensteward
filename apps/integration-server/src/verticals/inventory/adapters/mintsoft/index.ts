/**
 * Mintsoft WMS adapter for the inventory vertical.
 *
 * Mintsoft is a cloud WMS/OMS used by UK 3PLs and fulfilment operations.
 * Auth: static or 24-hour API key sent in the `ms-apikey` request header.
 * Base URL: https://api.mintsoft.co.uk
 *
 * Supported resources:
 *   - Products         GET /api/Product/List, GET /api/Product/{id}
 *   - StockLevels      GET /api/Product/Inventory/Bulk, GET /api/Product/StockLevels
 *   - Locations        GET /api/Warehouse (one unpaged array, paged locally)
 *   - Suppliers        GET /api/Product/Suppliers
 *   - PurchaseOrders   GET /api/ASN/List, GET /api/ASN/{id}
 *   - StockTransfers   GET /api/WarehouseTransfer/List
 *   - StockAdjustments refused (501): no documented adjustment list
 *
 * No webhook HMAC signing is documented by Mintsoft; webhook methods omitted.
 */
import {
  pageLocally,
  pageOffset,
  reportUpstreamPage,
  type CredentialField,
  type Credentials,
  type QueryParams,
} from '@opensteward/shared'
import type { InventoryAdapter } from '../../adapter/interface'
import type { Product } from '../../schema/product'
import type { StockLevel } from '../../schema/stock-level'
import type { Location } from '../../schema/location'
import type { Supplier } from '../../schema/supplier'
import type { PurchaseOrder } from '../../schema/purchase-order'
import type { StockTransfer } from '../../schema/stock-transfer'
import type { StockAdjustment } from '../../schema/stock-adjustment'

import {
  credentialFields as mintsoftCredentialFields,
  exchangeCredentials as mintsoftExchangeCredentials,
  getAuthUrlUnsupported,
} from './auth'
import { MintsoftClient } from './client'
import { ASN_LIST_MAX_PAGE_SIZE, DEFAULT_PAGE_SIZE } from './constants'

import { transformProduct, type RawMintsoftProduct } from './transform/product'
import { transformStockLevel, type RawMintsoftStockLevel } from './transform/stock-level'
import { transformLocation, type RawMintsoftWarehouse } from './transform/location'
import { transformSupplier, type RawMintsoftSupplier } from './transform/supplier'
import { transformPurchaseOrder, type RawMintsoftASN } from './transform/purchase-order'
import {
  transformStockTransfer,
  type RawMintsoftWarehouseTransfer,
} from './transform/stock-transfer'

export type MintsoftAdapterConfig = Record<string, never>

export class MintsoftAdapter implements InventoryAdapter {
  readonly platform = 'mintsoft'
  readonly version = '0.1.0'

  constructor(_config?: MintsoftAdapterConfig) {}

  credentialFields(): CredentialField[] {
    return mintsoftCredentialFields()
  }

  async exchangeCredentials(fields: Record<string, string>) {
    return mintsoftExchangeCredentials(fields)
  }

  getAuthUrl(_state: string, _scopes?: string[]): string {
    return getAuthUrlUnsupported()
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    throw new Error('mintsoft uses a static API key; use credentialFields() instead')
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return credentials
  }

  private client(credentials: Credentials): MintsoftClient {
    return new MintsoftClient(credentials)
  }

  private pageParams(params: QueryParams): Record<string, unknown> {
    return {
      Limit: params.limit ?? DEFAULT_PAGE_SIZE,
      PageNo: params.page ?? 1,
    }
  }

  // ── Products ────────────────────────────────────────────────────────────────

  async listProducts(credentials: Credentials, params: QueryParams): Promise<Product[]> {
    const items = await this.client(credentials).get<RawMintsoftProduct[]>(
      '/api/Product/List',
      this.pageParams(params),
    )
    return (items ?? []).map(transformProduct)
  }

  async getProduct(credentials: Credentials, id: string): Promise<Product> {
    const item = await this.client(credentials).get<RawMintsoftProduct>(`/api/Product/${id}`)
    if (!item || !item.ID) throw new Error(`mintsoft product ${id} not found`)
    return transformProduct(item)
  }

  // ── StockLevels ─────────────────────────────────────────────────────────────

  async listStockLevels(credentials: Credentials, params: QueryParams): Promise<StockLevel[]> {
    const items = await this.client(credentials).get<RawMintsoftStockLevel[]>(
      '/api/Product/Inventory/Bulk',
      this.pageParams(params),
    )
    return (items ?? []).map(transformStockLevel)
  }

  async getStockLevel(credentials: Credentials, id: string): Promise<StockLevel> {
    // `id` is expected in the form `productId:warehouseId`
    const [productId, warehouseId] = id.split(':')
    const items = await this.client(credentials).get<RawMintsoftStockLevel[]>(
      '/api/Product/StockLevels',
      { ProductId: productId, WarehouseId: warehouseId },
    )
    const match = (items ?? []).find(
      (r) => String(r.ProductId) === productId && String(r.WarehouseId) === warehouseId,
    )
    if (!match) throw new Error(`mintsoft stock level ${id} not found`)
    return transformStockLevel(match)
  }

  // ── Locations (Warehouses) ───────────────────────────────────────────────────

  /**
   * GET /api/Warehouse (operationId Warehouse_GetWarehouses) documents no
   * parameters and a bare array response, so every call returns every
   * warehouse and the caller's page is cut here.
   */
  private async allWarehouses(credentials: Credentials): Promise<Location[]> {
    const warehouses = await this.client(credentials).get<RawMintsoftWarehouse[]>('/api/Warehouse')
    return warehouses.map(transformLocation)
  }

  async listLocations(credentials: Credentials, params: QueryParams): Promise<Location[]> {
    return pageLocally(await this.allWarehouses(credentials), params)
  }

  async getLocation(credentials: Credentials, id: string): Promise<Location> {
    const all = await this.allWarehouses(credentials)
    const match = all.find((l) => l.id === id)
    if (!match) throw new Error(`mintsoft location ${id} not found`)
    return match
  }

  // ── Suppliers ───────────────────────────────────────────────────────────────

  async listSuppliers(credentials: Credentials, params: QueryParams): Promise<Supplier[]> {
    const items = await this.client(credentials).get<RawMintsoftSupplier[]>(
      '/api/Product/Suppliers',
      this.pageParams(params),
    )
    return (items ?? []).map(transformSupplier)
  }

  async getSupplier(credentials: Credentials, id: string): Promise<Supplier> {
    // No single-supplier endpoint; filter from full list
    const all = await this.listSuppliers(credentials, {})
    const match = all.find((s) => s.id === id)
    if (!match) throw new Error(`mintsoft supplier ${id} not found`)
    return match
  }

  // ── PurchaseOrders (ASNs) ────────────────────────────────────────────────────

  /**
   * GET /api/ASN/List (operationId ASN_ListASNs). `/api/ASN` itself is only
   * PUT (create). Documented query parameters used here:
   *   PageNo           "Page No - Default 1"
   *   Limit            "Number of Result to be returned - Default 100 - Max 100"
   *   IncludeASNItems  "Request the ASN items" (the list excludes them otherwise)
   *   SinceLastUpdated "Filter by any ASNs that have been Updated Since supplied Timestamp"
   * The response is a bare array with no total, so the only end signal is a
   * short page, which the router reads from the size reported here.
   */
  async listPurchaseOrders(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<PurchaseOrder[]> {
    const size = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, ASN_LIST_MAX_PAGE_SIZE)
    const pageNo = pageOffset(params, 1) + 1
    const query: Record<string, unknown> = {
      PageNo: pageNo,
      Limit: size,
      IncludeASNItems: true,
    }
    if (params.updatedAfter) query.SinceLastUpdated = params.updatedAfter.toISOString()
    const items = await this.client(credentials).get<RawMintsoftASN[]>('/api/ASN/List', query)
    reportUpstreamPage(params, { pageSize: size })
    return items.map(transformPurchaseOrder)
  }

  async getPurchaseOrder(credentials: Credentials, id: string): Promise<PurchaseOrder> {
    const item = await this.client(credentials).get<RawMintsoftASN>(`/api/ASN/${id}`)
    if (!item || !item.ID) throw new Error(`mintsoft ASN/purchase-order ${id} not found`)
    return transformPurchaseOrder(item)
  }

  // ── StockTransfers (WarehouseTransfer) ───────────────────────────────────────

  async listStockTransfers(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<StockTransfer[]> {
    const items = await this.client(credentials).get<RawMintsoftWarehouseTransfer[]>(
      '/api/WarehouseTransfer/List',
      {
        ...this.pageParams(params),
        IncludeWarehouseTransferItems: true,
      },
    )
    return (items ?? []).map(transformStockTransfer)
  }

  async getStockTransfer(credentials: Credentials, id: string): Promise<StockTransfer> {
    const item = await this.client(credentials).get<RawMintsoftWarehouseTransfer>(
      `/api/WarehouseTransfer/${id}`,
    )
    if (!item || !item.ID) throw new Error(`mintsoft warehouse transfer ${id} not found`)
    return transformStockTransfer(item)
  }

  // ── StockAdjustments ─────────────────────────────────────────────────────

  /**
   * Refused before any request. The spec (https://api.mintsoft.co.uk/swagger/docs/v1)
   * has no adjustment or stocktake list. The nearest endpoint,
   * GET /api/Product/{id}/StockFlow ("Get StockFlow Items by SKU, and Date"),
   * is per product, requires FromDate and ToDate and takes no paging
   * parameters, and its Flow types are documented only as
   * "ALL,IN, OUT, ALLOCATE, UNALLOCATE,TRANSFER, SCRAP", none of which names an
   * adjustment.
   */
  async listStockAdjustments(
    _credentials: Credentials,
    _params: QueryParams,
  ): Promise<StockAdjustment[]> {
    throw notSupported(
      'Mintsoft cannot list stock adjustments: the API documents no adjustment list, and StockFlow Types are "ALL,IN, OUT, ALLOCATE, UNALLOCATE,TRANSFER, SCRAP"',
    )
  }

  async getStockAdjustment(_credentials: Credentials, _id: string): Promise<StockAdjustment> {
    throw notSupported(
      'Mintsoft cannot fetch a stock adjustment: the API documents no stock adjustment resource',
    )
  }
}

function notSupported(message: string): Error {
  return Object.assign(new Error(message), { statusCode: 501, code: 'NOT_SUPPORTED' })
}
