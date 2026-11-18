/**
 * Wasp Barcode Technologies — InventoryCloud adapter.
 *
 * InventoryCloud is a cloud-based inventory management system for SMBs.
 * Auth: API key passed as Bearer token; tenant subdomain required.
 * Base URL: https://{tenant}.waspinventorycloud.com/public-api
 * All API endpoints are POST with JSON body.
 * Pagination: PageNumber + PageSize in request body;
 *   HasSuccessWithMoreDataRemaining in response indicates more pages.
 *
 * Supported resources:
 *   - Products    (ic/item advancedinfosearch + getinventoryitem)
 *   - StockLevels (ic/item advancedinventorysearch)
 *   - Locations   (sites/advancedinfosearch + locations/advancedinfosearch)
 *   - Suppliers   (vendors/advancedinfosearch + getvendorbynumber)
 *   - PurchaseOrders (ic/purchaseorder)
 *   - StockAdjustments (transaction-history-v2, type=Adjust)
 *   - StockTransfers   (transaction-history-v2, type=Move)
 *
 * No webhooks: InventoryCloud does not publish outbound webhook events.
 * Schema firewall: no product images, no customer orders, no BOM/manufacturing.
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
  credentialFields as waspCredentialFields,
  exchangeCredentials as waspExchangeCredentials,
  getAuthUrlUnsupported,
} from './auth'
import {WaspBarcodeClient} from './client'
import {DEFAULT_PAGE_SIZE} from './constants'
import {verifyWaspBarcodeWebhook, parseWaspBarcodeWebhookEvents} from './webhook'

import {transformProduct, type RawWaspBarcodeProduct} from './transform/product'
import {transformStockLevel, type RawWaspBarcodeStockLevel} from './transform/stock-level'
import {transformLocation, type RawWaspBarcodeLocation} from './transform/location'
import {transformSupplier, type RawWaspBarcodeSupplier} from './transform/supplier'
import {transformPurchaseOrder, type RawWaspBarcodePurchaseOrder} from './transform/purchase-order'
import {transformStockTransfer, type RawWaspBarcodeStockTransfer} from './transform/stock-transfer'
import {transformStockAdjustment, type RawWaspBarcodeStockAdjustment} from './transform/stock-adjustment'

// ── Response envelope types ────────────────────────────────────────────────

interface PagedResponse<T> {
  HasSuccessWithMoreDataRemaining?: boolean
  Data?: T[]
  Items?: T[]
  Results?: T[]
  ResultCode?: number
  Messages?: unknown[]
}

// ── Adapter config (no OAuth; only API key + tenant needed) ───────────────

export type WaspBarcodeAdapterConfig = Record<string, never>

export class WaspBarcodeAdapter implements InventoryAdapter {
  readonly platform = 'wasp-barcode'
  readonly version = '0.1.0'

  constructor(_config?: WaspBarcodeAdapterConfig) {}

  credentialFields(): CredentialField[] {
    return waspCredentialFields()
  }

  async exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
    return waspExchangeCredentials(fields)
  }

  getAuthUrl(_state: string, _scopes?: string[]): string {
    return getAuthUrlUnsupported()
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    throw new Error('wasp-barcode uses static API key; use credentialFields() instead')
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return credentials
  }

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return verifyWaspBarcodeWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parseWaspBarcodeWebhookEvents(payload)
  }

  private client(credentials: Credentials): WaspBarcodeClient {
    return new WaspBarcodeClient(credentials)
  }

  /** Standard AdvancedInfoSearch pagination body */
  private pageParams(params: QueryParams): Record<string, unknown> {
    return {
      PageSize: params.limit ?? DEFAULT_PAGE_SIZE,
      PageNumber: params.page ?? 1,
    }
  }

  /** Extract item array from various response envelope shapes */
  private items<T>(res: PagedResponse<T>): T[] {
    return res.Data ?? res.Items ?? res.Results ?? []
  }

  // ── Products ──────────────────────────────────────────────────────────────

  async listProducts(credentials: Credentials, params: QueryParams): Promise<Product[]> {
    const res = await this.client(credentials).post<PagedResponse<RawWaspBarcodeProduct>>(
      '/ic/item/advancedinfosearch',
      this.pageParams(params),
    )
    return this.items(res).map(transformProduct)
  }

  async getProduct(credentials: Credentials, id: string): Promise<Product> {
    const res = await this.client(credentials).post<PagedResponse<RawWaspBarcodeProduct>>(
      `/ic/item/getinventoryitem/${encodeURIComponent(id)}`,
      {},
    )
    const items = this.items(res)
    if (!items.length) throw new Error(`wasp-barcode: product ${id} not found`)
    return transformProduct(items[0]!)
  }

  // ── StockLevels ───────────────────────────────────────────────────────────

  async listStockLevels(credentials: Credentials, params: QueryParams): Promise<StockLevel[]> {
    const res = await this.client(credentials).post<PagedResponse<RawWaspBarcodeStockLevel>>(
      '/ic/item/advancedinventorysearch',
      this.pageParams(params),
    )
    return this.items(res).map(transformStockLevel)
  }

  async getStockLevel(_credentials: Credentials, id: string): Promise<StockLevel> {
    throw new Error(`wasp-barcode: stock-level fetch is bulk-only; call listStockLevels. id=${id}`)
  }

  // ── Locations ─────────────────────────────────────────────────────────────

  async listLocations(credentials: Credentials, params: QueryParams): Promise<Location[]> {
    const client = this.client(credentials)
    const pageBody = this.pageParams(params)

    // Fetch both Sites (top-level warehouses) and sub-Locations in parallel
    const [sitesRes, locationsRes] = await Promise.all([
      client.post<PagedResponse<RawWaspBarcodeLocation>>('/sites/advancedinfosearch', pageBody),
      client.post<PagedResponse<RawWaspBarcodeLocation>>('/locations/advancedinfosearch', pageBody),
    ])

    const sites = this.items(sitesRes).map((r) => transformLocation(r, true))
    const locations = this.items(locationsRes).map((r) => transformLocation(r, false))
    return [...sites, ...locations]
  }

  async getLocation(credentials: Credentials, id: string): Promise<Location> {
    // Try sub-location first (by code), then fall back to site (by name)
    const res = await this.client(credentials).post<PagedResponse<RawWaspBarcodeLocation>>(
      '/locations/getlocationsbycode',
      { LocationCode: id },
    )
    const items = this.items(res)
    if (items.length) return transformLocation(items[0]!, false)

    // Try site lookup
    const siteRes = await this.client(credentials).post<PagedResponse<RawWaspBarcodeLocation>>(
      '/sites/getsitesbyname',
      { SiteName: id },
    )
    const siteItems = this.items(siteRes)
    if (siteItems.length) return transformLocation(siteItems[0]!, true)

    throw new Error(`wasp-barcode: location ${id} not found`)
  }

  // ── Suppliers (Vendors) ───────────────────────────────────────────────────

  async listSuppliers(credentials: Credentials, params: QueryParams): Promise<Supplier[]> {
    const res = await this.client(credentials).post<PagedResponse<RawWaspBarcodeSupplier>>(
      '/vendors/advancedinfosearch',
      this.pageParams(params),
    )
    return this.items(res).map(transformSupplier)
  }

  async getSupplier(credentials: Credentials, id: string): Promise<Supplier> {
    const res = await this.client(credentials).post<PagedResponse<RawWaspBarcodeSupplier>>(
      '/vendors/getvendorbynumber',
      { VendorNumber: id },
    )
    const items = this.items(res)
    if (!items.length) throw new Error(`wasp-barcode: supplier ${id} not found`)
    return transformSupplier(items[0]!)
  }

  // ── PurchaseOrders ────────────────────────────────────────────────────────

  async listPurchaseOrders(credentials: Credentials, params: QueryParams): Promise<PurchaseOrder[]> {
    const res = await this.client(credentials).post<PagedResponse<RawWaspBarcodePurchaseOrder>>(
      '/ic/purchaseorder/purchaseordersearch',
      this.pageParams(params),
    )
    return this.items(res).map(transformPurchaseOrder)
  }

  async getPurchaseOrder(credentials: Credentials, id: string): Promise<PurchaseOrder> {
    const res = await this.client(credentials).post<PagedResponse<RawWaspBarcodePurchaseOrder>>(
      '/ic/purchaseorder/getordersbynumber',
      { OrderNumber: id },
    )
    const items = this.items(res)
    if (!items.length) throw new Error(`wasp-barcode: purchase order ${id} not found`)
    return transformPurchaseOrder(items[0]!)
  }

  // ── StockAdjustments ──────────────────────────────────────────────────────

  async listStockAdjustments(credentials: Credentials, params: QueryParams): Promise<StockAdjustment[]> {
    const res = await this.client(credentials).post<PagedResponse<RawWaspBarcodeStockAdjustment>>(
      '/transactions/grid-query/transaction-history-v2',
      {
        ...this.pageParams(params),
        TransactionType: 'Adjust',
      },
    )
    return this.items(res).map(transformStockAdjustment)
  }

  async getStockAdjustment(_credentials: Credentials, id: string): Promise<StockAdjustment> {
    throw new Error(
      `wasp-barcode: stock-adjustment fetch is bulk-only via transaction history; call listStockAdjustments. id=${id}`,
    )
  }

  // ── StockTransfers (Move transactions) ────────────────────────────────────

  async listStockTransfers(credentials: Credentials, params: QueryParams): Promise<StockTransfer[]> {
    const res = await this.client(credentials).post<PagedResponse<RawWaspBarcodeStockTransfer>>(
      '/transactions/grid-query/transaction-history-v2',
      {
        ...this.pageParams(params),
        TransactionType: 'Move',
      },
    )
    return this.items(res).map(transformStockTransfer)
  }

  async getStockTransfer(_credentials: Credentials, id: string): Promise<StockTransfer> {
    throw new Error(
      `wasp-barcode: stock-transfer fetch is bulk-only via transaction history; call listStockTransfers. id=${id}`,
    )
  }
}
