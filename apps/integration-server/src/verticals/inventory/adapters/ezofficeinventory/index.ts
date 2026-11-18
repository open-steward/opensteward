/**
 * EZOfficeInventory (EZO) adapter for the inventory vertical.
 *
 * EZO is an asset-tracking and inventory platform for physical equipment.
 * Auth: Bearer API token + company subdomain.
 * Base URL: https://<subdomain>.ezofficeinventory.com/api/v2
 *
 * Supported resources:
 *   - Products  → EZO "inventory" (volatile assets / consumables)
 *   - StockLevels → per-location quantity from /inventory/:id/get_quantity_by_location
 *   - Locations → /locations
 *   - Suppliers → /vendors
 *   - PurchaseOrders → /purchase_orders
 *   - StockTransfers  → /inventory/:id/history (action=Transfer Stock)
 *   - StockAdjustments → /inventory/:id/history (action=Add/Remove Stock)
 *
 * Not supported (EZO does not document HMAC/JWT webhook signing):
 *   - verifyWebhook / parseWebhookEvents
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

import {
  credentialFields as ezoCredentialFields,
  exchangeCredentials as ezoExchangeCredentials,
  getAuthUrlUnsupported,
} from './auth'
import {EZOClient} from './client'
import {DEFAULT_PAGE_SIZE} from './constants'

import {transformProduct, type RawEZOInventory} from './transform/product'
import {transformStockLevel, type RawEZOStockLevel} from './transform/stock-level'
import {transformLocation, type RawEZOLocation} from './transform/location'
import {transformSupplier, type RawEZOVendor} from './transform/supplier'
import {transformPurchaseOrder, type RawEZOPurchaseOrder} from './transform/purchase-order'
import {transformStockTransfer, type RawEZOStockTransfer} from './transform/stock-transfer'
import {transformStockAdjustment, type RawEZOStockAdjustment} from './transform/stock-adjustment'

// No OAuth client creds needed — adapter only requires user API token + subdomain
export type EZOAdapterConfig = Record<string, never>

// ── EZO paginated list wrappers ────────────────────────────────────────────

interface EZOPagedResponse {
  metadata?: { next_page?: string | null }
}

interface InventoryListResp extends EZOPagedResponse { inventory?: RawEZOInventory[] }
interface InventorySingleResp { inventory?: RawEZOInventory }
interface LocationListResp extends EZOPagedResponse { locations?: RawEZOLocation[] }
interface LocationSingleResp { location?: RawEZOLocation }
interface VendorListResp extends EZOPagedResponse { vendors?: RawEZOVendor[] }
interface VendorSingleResp { vendor?: RawEZOVendor }
interface PurchaseOrderListResp extends EZOPagedResponse { purchase_orders?: RawEZOPurchaseOrder[] }
interface PurchaseOrderSingleResp { purchase_order?: RawEZOPurchaseOrder }

interface QuantityByLocationResp {
  quantity?: Array<{
    location_id?: number | string
    location_name?: string
    quantity?: number | string
    minimum_quantity?: number | string
    optimal_quantity?: number | string
    updated_at?: string
  }>
}

interface HistoryResp extends EZOPagedResponse {
  stock_history?: Array<Record<string, unknown>>
}

export class EZOfficeInventoryAdapter implements InventoryAdapter {
  readonly platform = 'ezofficeinventory'
  readonly version = '0.1.0'

  constructor(_config?: EZOAdapterConfig) {}

  credentialFields(): CredentialField[] {
    return ezoCredentialFields()
  }

  async exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
    return ezoExchangeCredentials(fields)
  }

  getAuthUrl(_state: string, _scopes?: string[]): string {
    return getAuthUrlUnsupported()
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    throw new Error('ezofficeinventory uses a static API token; use credentialFields() instead')
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return credentials
  }

  private client(credentials: Credentials): EZOClient {
    return new EZOClient(credentials)
  }

  private pageParams(params: QueryParams): Record<string, unknown> {
    return {
      per_page: params.limit ?? DEFAULT_PAGE_SIZE,
      ...(params.page != null ? { page: params.page } : {}),
    }
  }

  // ── Products (EZO Inventory items) ──────────────────────────────────────

  async listProducts(credentials: Credentials, params: QueryParams): Promise<Product[]> {
    const res = await this.client(credentials).get<InventoryListResp>('/inventory', this.pageParams(params))
    return (res.inventory ?? []).map(transformProduct)
  }

  async getProduct(credentials: Credentials, id: string): Promise<Product> {
    const res = await this.client(credentials).get<InventorySingleResp>(`/inventory/${id}`)
    if (!res.inventory) throw new Error(`ezofficeinventory inventory item ${id} not found`)
    return transformProduct(res.inventory)
  }

  // ── StockLevels ──────────────────────────────────────────────────────────
  // EZO provides per-location quantity under each inventory item.

  async listStockLevels(credentials: Credentials, params: QueryParams): Promise<StockLevel[]> {
    // Fetch a page of inventory items, then expand quantity-by-location for each.
    const itemsRes = await this.client(credentials).get<InventoryListResp>('/inventory', this.pageParams(params))
    const items = itemsRes.inventory ?? []
    const results: StockLevel[] = []
    for (const item of items) {
      try {
        const qtyRes = await this.client(credentials).get<QuantityByLocationResp>(
          `/inventory/${item.id}/get_quantity_by_location`,
        )
        for (const loc of qtyRes.quantity ?? []) {
          const raw: RawEZOStockLevel = { inventory_id: item.id, ...loc }
          results.push(transformStockLevel(raw))
        }
      } catch {
        // If per-location data unavailable, fall back to root-level quantity
        const raw: RawEZOStockLevel = {
          inventory_id: item.id,
          quantity: item.available_quantity,
          location_id: item.location_id,
          location_name: item.location_name,
        }
        results.push(transformStockLevel(raw))
      }
    }
    return results
  }

  async getStockLevel(_credentials: Credentials, id: string): Promise<StockLevel> {
    throw new Error(
      `ezofficeinventory stock-level fetch is bulk-only; call listStockLevels. id=${id}`,
    )
  }

  // ── Locations ────────────────────────────────────────────────────────────

  async listLocations(credentials: Credentials, params: QueryParams): Promise<Location[]> {
    const res = await this.client(credentials).get<LocationListResp>('/locations', this.pageParams(params))
    return (res.locations ?? []).map(transformLocation)
  }

  async getLocation(credentials: Credentials, id: string): Promise<Location> {
    const res = await this.client(credentials).get<LocationSingleResp>(`/locations/${id}`)
    if (!res.location) throw new Error(`ezofficeinventory location ${id} not found`)
    return transformLocation(res.location)
  }

  // ── Suppliers (EZO Vendors) ──────────────────────────────────────────────

  async listSuppliers(credentials: Credentials, params: QueryParams): Promise<Supplier[]> {
    const res = await this.client(credentials).get<VendorListResp>('/vendors', this.pageParams(params))
    return (res.vendors ?? []).map(transformSupplier)
  }

  async getSupplier(credentials: Credentials, id: string): Promise<Supplier> {
    const res = await this.client(credentials).get<VendorSingleResp>(`/vendors/${id}`)
    if (!res.vendor) throw new Error(`ezofficeinventory vendor ${id} not found`)
    return transformSupplier(res.vendor)
  }

  // ── PurchaseOrders ───────────────────────────────────────────────────────

  async listPurchaseOrders(credentials: Credentials, params: QueryParams): Promise<PurchaseOrder[]> {
    const res = await this.client(credentials).get<PurchaseOrderListResp>('/purchase_orders', this.pageParams(params))
    return (res.purchase_orders ?? []).map(transformPurchaseOrder)
  }

  async getPurchaseOrder(credentials: Credentials, id: string): Promise<PurchaseOrder> {
    const res = await this.client(credentials).get<PurchaseOrderSingleResp>(`/purchase_orders/${id}`)
    if (!res.purchase_order) throw new Error(`ezofficeinventory purchase order ${id} not found`)
    return transformPurchaseOrder(res.purchase_order)
  }

  // ── StockTransfers ───────────────────────────────────────────────────────
  // EZO does not have a dedicated transfer list endpoint; transfers live in
  // per-item history. We iterate inventory items and collect transfer events.

  async listStockTransfers(credentials: Credentials, params: QueryParams): Promise<StockTransfer[]> {
    const itemsRes = await this.client(credentials).get<InventoryListResp>('/inventory', this.pageParams(params))
    const items = itemsRes.inventory ?? []
    const results: StockTransfer[] = []
    for (const item of items) {
      try {
        const hist = await this.client(credentials).get<HistoryResp>(`/inventory/${item.id}/history`)
        for (const event of hist.stock_history ?? []) {
          const isTransfer = event['is_transfer'] === true || event['is_transfer'] === 1
          if (!isTransfer) continue
          const raw: RawEZOStockTransfer = { inventory_id: item.id, ...event }
          results.push(transformStockTransfer(raw))
        }
      } catch {
        // silently skip items whose history is inaccessible
      }
    }
    return results
  }

  async getStockTransfer(_credentials: Credentials, id: string): Promise<StockTransfer> {
    throw new Error(
      `ezofficeinventory stock-transfer fetch is history-only; call listStockTransfers. id=${id}`,
    )
  }

  // ── StockAdjustments ─────────────────────────────────────────────────────

  async listStockAdjustments(credentials: Credentials, params: QueryParams): Promise<StockAdjustment[]> {
    const itemsRes = await this.client(credentials).get<InventoryListResp>('/inventory', this.pageParams(params))
    const items = itemsRes.inventory ?? []
    const results: StockAdjustment[] = []
    for (const item of items) {
      try {
        const hist = await this.client(credentials).get<HistoryResp>(`/inventory/${item.id}/history`)
        for (const event of hist.stock_history ?? []) {
          const isTransfer = event['is_transfer'] === true || event['is_transfer'] === 1
          if (isTransfer) continue
          const orderType = String(event['order_type'] ?? '').toLowerCase()
          if (!orderType.includes('stock') && !orderType.includes('audit') && !orderType.includes('adjust')) {
            continue
          }
          const raw: RawEZOStockAdjustment = { inventory_id: item.id, ...event }
          results.push(transformStockAdjustment(raw))
        }
      } catch {
        // silently skip items whose history is inaccessible
      }
    }
    return results
  }

  async getStockAdjustment(_credentials: Credentials, id: string): Promise<StockAdjustment> {
    throw new Error(
      `ezofficeinventory stock-adjustment fetch is history-only; call listStockAdjustments. id=${id}`,
    )
  }
}
