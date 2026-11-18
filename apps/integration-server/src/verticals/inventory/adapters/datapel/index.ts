/**
 * Datapel WMS adapter.
 *
 * Datapel is an Australian warehouse management system built on the Breeze
 * DataServer. The API is tenant-hosted (or Datapel Cloud at
 * *.datapelwms.net). Auth is token-based: exchange Basic credentials for a
 * 24-hour session token; every request carries both the Basic authorisation
 * code and the session token as custom headers.
 *
 * Supported resources:
 *   - Products     (/items)
 *   - StockLevels  (/inventorylist)
 *   - Locations    (/locations)
 *   - Suppliers    (/contacts?contacttype=Supplier)
 *   - PurchaseOrders (/inwardorderlist)
 *   - StockTransfers (/transferorderlist)
 *   - StockAdjustments (/adjustmentlist)
 *
 * Webhooks: Datapel does not publish an outbound-webhook signing specification.
 * verifyWebhook / parseWebhookEvents are intentionally omitted (auto-501).
 *
 * Schema-firewall: no product images, no supplier banking, no BOM.
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

import {credentialFields as datapelCredentialFields, exchangeCredentials as datapelExchangeCredentials, getAuthUrlUnsupported} from './auth'
import {DatapelClient} from './client'
import {DEFAULT_PAGE_SIZE} from './constants'

import {transformProduct, type RawDatapelProduct} from './transform/product'
import {transformStockLevel, type RawDatapelInventory} from './transform/stock-level'
import {transformLocation, type RawDatapelLocation} from './transform/location'
import {transformSupplier, type RawDatapelContact} from './transform/supplier'
import {transformPurchaseOrder, type RawDatapelInwardOrder} from './transform/purchase-order'
import {transformStockTransfer, type RawDatapelTransferOrder} from './transform/stock-transfer'
import {transformStockAdjustment, type RawDatapelStockAdjustment} from './transform/stock-adjustment'
export type DatapelAdapterConfig = Record<string, never>

// Breeze list envelope shapes ─────────────────────────────────────────────────

interface ItemsResponse { items?: RawDatapelProduct[]; [key: string]: unknown }
interface InventoryListResponse { inventorylist?: RawDatapelInventory[]; [key: string]: unknown }
interface LocationsResponse { locations?: RawDatapelLocation[]; location?: RawDatapelLocation; [key: string]: unknown }
interface ContactsResponse { contacts?: RawDatapelContact[]; contact?: RawDatapelContact; [key: string]: unknown }
interface InwardOrderListResponse { inwardorderlist?: RawDatapelInwardOrder[]; inwardorder?: RawDatapelInwardOrder; [key: string]: unknown }
interface TransferOrderListResponse { transferorderlist?: RawDatapelTransferOrder[]; transferorder?: RawDatapelTransferOrder; [key: string]: unknown }
interface AdjustmentListResponse { adjustmentlist?: RawDatapelStockAdjustment[]; adjustment?: RawDatapelStockAdjustment; [key: string]: unknown }

export class DatapelAdapter implements InventoryAdapter {
  readonly platform = 'datapel'
  readonly version = '0.1.0'

  constructor(_config?: DatapelAdapterConfig) {}

  credentialFields(): CredentialField[] {
    return datapelCredentialFields()
  }

  async exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
    return datapelExchangeCredentials(fields)
  }

  getAuthUrl(_state: string, _scopes?: string[]): string {
    return getAuthUrlUnsupported()
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    throw new Error('datapel uses Basic credentials; use credentialFields() instead')
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    // Session tokens are refreshed lazily by the client; no explicit refresh needed.
    return credentials
  }

  private client(credentials: Credentials): DatapelClient {
    return new DatapelClient(credentials)
  }

  private pageParams(params: QueryParams): Record<string, unknown> {
    return {
      pagesize: params.limit ?? DEFAULT_PAGE_SIZE,
      ...(params.page ? { page: params.page } : { page: 1 }),
    }
  }

  // ── Products ───────────────────────────────────────────────────────────────

  async listProducts(credentials: Credentials, params: QueryParams): Promise<Product[]> {
    const res = await this.client(credentials).get<ItemsResponse>('/items', this.pageParams(params))
    return (res.items ?? []).map(transformProduct)
  }

  async getProduct(credentials: Credentials, id: string): Promise<Product> {
    const res = await this.client(credentials).get<ItemsResponse>('/items', {
      BaseStockID: id,
      pagesize: 1,
    })
    const item = (res.items ?? [])[0]
    if (!item) throw new Error(`datapel product ${id} not found`)
    return transformProduct(item)
  }

  // ── Stock Levels ───────────────────────────────────────────────────────────

  async listStockLevels(credentials: Credentials, params: QueryParams): Promise<StockLevel[]> {
    const res = await this.client(credentials).get<InventoryListResponse>('/inventorylist', this.pageParams(params))
    return (res.inventorylist ?? []).map(transformStockLevel)
  }

  async getStockLevel(_credentials: Credentials, id: string): Promise<StockLevel> {
    // Datapel inventory is bulk-fetched by location; composite id = productId:locationId
    throw new Error(`datapel stock-level fetch is bulk-only; call listStockLevels. id=${id}`)
  }

  // ── Locations ──────────────────────────────────────────────────────────────

  async listLocations(credentials: Credentials, params: QueryParams): Promise<Location[]> {
    const res = await this.client(credentials).get<LocationsResponse>('/locations', this.pageParams(params))
    return (res.locations ?? []).map(transformLocation)
  }

  async getLocation(credentials: Credentials, id: string): Promise<Location> {
    const res = await this.client(credentials).get<LocationsResponse>('/locations', {
      locationsid: id,
      pagesize: 1,
    })
    const loc = (res.locations ?? [])[0] ?? res.location
    if (!loc) throw new Error(`datapel location ${id} not found`)
    return transformLocation(loc)
  }

  // ── Suppliers ──────────────────────────────────────────────────────────────

  async listSuppliers(credentials: Credentials, params: QueryParams): Promise<Supplier[]> {
    const res = await this.client(credentials).get<ContactsResponse>('/contacts', {
      ...this.pageParams(params),
      contacttype: 'Supplier',
    })
    return (res.contacts ?? []).map(transformSupplier)
  }

  async getSupplier(credentials: Credentials, id: string): Promise<Supplier> {
    const res = await this.client(credentials).get<ContactsResponse>('/contacts', {
      contactid: id,
      pagesize: 1,
    })
    const contact = (res.contacts ?? [])[0] ?? res.contact
    if (!contact) throw new Error(`datapel supplier ${id} not found`)
    return transformSupplier(contact)
  }

  // ── Purchase Orders ────────────────────────────────────────────────────────

  async listPurchaseOrders(credentials: Credentials, params: QueryParams): Promise<PurchaseOrder[]> {
    const res = await this.client(credentials).get<InwardOrderListResponse>('/inwardorderlist', this.pageParams(params))
    return (res.inwardorderlist ?? []).map(transformPurchaseOrder)
  }

  async getPurchaseOrder(credentials: Credentials, id: string): Promise<PurchaseOrder> {
    const res = await this.client(credentials).get<InwardOrderListResponse>('/inwardorderlist', {
      inwardorderid: id,
      pagesize: 1,
    })
    const order = (res.inwardorderlist ?? [])[0] ?? res.inwardorder
    if (!order) throw new Error(`datapel purchase order ${id} not found`)
    return transformPurchaseOrder(order)
  }

  // ── Stock Transfers ────────────────────────────────────────────────────────

  async listStockTransfers(credentials: Credentials, params: QueryParams): Promise<StockTransfer[]> {
    const res = await this.client(credentials).get<TransferOrderListResponse>('/transferorderlist', this.pageParams(params))
    return (res.transferorderlist ?? []).map(transformStockTransfer)
  }

  async getStockTransfer(credentials: Credentials, id: string): Promise<StockTransfer> {
    const res = await this.client(credentials).get<TransferOrderListResponse>('/transferorderlist', {
      transferid: id,
      pagesize: 1,
    })
    const transfer = (res.transferorderlist ?? [])[0] ?? res.transferorder
    if (!transfer) throw new Error(`datapel stock transfer ${id} not found`)
    return transformStockTransfer(transfer)
  }

  // ── Stock Adjustments ──────────────────────────────────────────────────────

  async listStockAdjustments(credentials: Credentials, params: QueryParams): Promise<StockAdjustment[]> {
    const res = await this.client(credentials).get<AdjustmentListResponse>('/adjustmentlist', this.pageParams(params))
    return (res.adjustmentlist ?? []).map(transformStockAdjustment)
  }

  async getStockAdjustment(credentials: Credentials, id: string): Promise<StockAdjustment> {
    const res = await this.client(credentials).get<AdjustmentListResponse>('/adjustmentlist', {
      adjustmentid: id,
      pagesize: 1,
    })
    const adj = (res.adjustmentlist ?? [])[0] ?? res.adjustment
    if (!adj) throw new Error(`datapel stock adjustment ${id} not found`)
    return transformStockAdjustment(adj)
  }
}
