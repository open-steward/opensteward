/**
 * Agiliron inventory adapter.
 *
 * Agiliron is a multi-channel inventory + ERP platform.
 * Auth: API key passed as the `key` query param + `apiKey` header.
 * Base URL: https://{company}.agiliron.net/agiliron/api-40/{Resource}
 *
 * Supported resources: products, stock-levels, suppliers (vendors),
 * purchase orders, stock transfers (inventory transfers).
 *
 * Locations are derived from the StockLocation strings on inventory records
 * (no dedicated locations endpoint in API v4.0).
 *
 * Webhooks: Agiliron does not document HMAC/JWT signing for webhooks;
 * verifyWebhook and parseWebhookEvents are therefore not implemented.
 *
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

import {
  credentialFields as agilironCredentialFields,
  exchangeCredentials as agilironExchangeCredentials,
  getAuthUrlUnsupported,
} from './auth'
import {AgilironClient} from './client'
import {DEFAULT_PAGE_SIZE} from './constants'

import {transformProduct, type AgilironProductsEnvelope} from './transform/product'
import {transformStockLevel, type RawAgilironStockLevel, type AgilironInventoryEnvelope} from './transform/stock-level'
import {transformLocation, type RawAgilironLocation} from './transform/location'
import {transformVendor, type AgilironVendorEnvelope} from './transform/supplier'
import {transformPurchaseOrder, type AgilironPurchaseOrderEnvelope} from './transform/purchase-order'
import {transformStockTransfer, type AgilironTransferEnvelope} from './transform/stock-transfer'
export type AgilironAdapterConfig = Record<string, never>

export class AgilironAdapter implements InventoryAdapter {
  readonly platform = 'agiliron'
  readonly version = '0.1.0'

  constructor(_config: AgilironAdapterConfig) {}

  credentialFields(): CredentialField[] {
    return agilironCredentialFields()
  }

  async exchangeCredentials(fields: Record<string, string>) {
    return agilironExchangeCredentials(fields)
  }

  getAuthUrl(_state: string, _scopes?: string[]): string {
    return getAuthUrlUnsupported()
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    throw new Error('agiliron uses static API key; use credentialFields() instead')
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return credentials
  }

  private client(credentials: Credentials): AgilironClient {
    return new AgilironClient(credentials)
  }

  private pageParams(params: QueryParams): Record<string, unknown> {
    return {
      pageSize: params.limit ?? DEFAULT_PAGE_SIZE,
      ...(params.page !== undefined ? { page: params.page } : {}),
    }
  }

  // ── Products ───────────────────────────────────────────────────────────────

  async listProducts(credentials: Credentials, params: QueryParams): Promise<Product[]> {
    const res = await this.client(credentials).get<AgilironProductsEnvelope>(
      '/Products',
      this.pageParams(params),
    )
    const items = res.Products?.Product ?? []
    return items.map(transformProduct)
  }

  async getProduct(credentials: Credentials, id: string): Promise<Product> {
    // Agiliron GET /Products/{productCode} — id is the ProductCode
    const res = await this.client(credentials).get<AgilironProductsEnvelope>(`/Products/${encodeURIComponent(id)}`)
    const item = res.Products?.Product?.[0]
    if (!item) throw new Error(`agiliron product ${id} not found`)
    return transformProduct(item)
  }

  // ── Stock Levels ───────────────────────────────────────────────────────────

  async listStockLevels(credentials: Credentials, params: QueryParams): Promise<StockLevel[]> {
    const res = await this.client(credentials).get<AgilironInventoryEnvelope>(
      '/ProductsInventory',
      this.pageParams(params),
    )
    const items = res.ProductsInventory?.StockLocationInventory ?? []
    return items.map(transformStockLevel)
  }

  async getStockLevel(credentials: Credentials, id: string): Promise<StockLevel> {
    // id is expected to be "ProductCode:StockLocation"
    const [productCode, ...locParts] = id.split(':')
    const stockLocation = locParts.join(':')
    const res = await this.client(credentials).get<AgilironInventoryEnvelope>(
      '/ProductsInventory',
      { filter: `ProductCode,eq,${productCode}`, pageSize: DEFAULT_PAGE_SIZE },
    )
    const items = res.ProductsInventory?.StockLocationInventory ?? []
    const match = stockLocation
      ? items.find((i: RawAgilironStockLevel) => i.StockLocation === stockLocation)
      : items[0]
    if (!match) throw new Error(`agiliron stock-level ${id} not found`)
    return transformStockLevel(match)
  }

  // ── Locations (derived from StockLocation strings) ─────────────────────────

  async listLocations(credentials: Credentials, params: QueryParams): Promise<Location[]> {
    // Pull a page of inventory records and deduplicate by StockLocation name
    const res = await this.client(credentials).get<AgilironInventoryEnvelope>(
      '/ProductsInventory',
      this.pageParams(params),
    )
    const items = res.ProductsInventory?.StockLocationInventory ?? []
    const seen = new Set<string>()
    const locations: Location[] = []
    for (const item of items) {
      const loc = item.StockLocation ?? ''
      if (!loc || seen.has(loc)) continue
      seen.add(loc)
      locations.push(transformLocation({ StockLocation: loc } as RawAgilironLocation))
    }
    return locations
  }

  async getLocation(credentials: Credentials, id: string): Promise<Location> {
    const res = await this.client(credentials).get<AgilironInventoryEnvelope>(
      '/ProductsInventory',
      { filter: `StockLocation,eq,${id}`, pageSize: 1 },
    )
    const item = res.ProductsInventory?.StockLocationInventory?.[0]
    if (!item) throw new Error(`agiliron location ${id} not found`)
    return transformLocation({ StockLocation: item.StockLocation ?? id } as RawAgilironLocation)
  }

  // ── Suppliers (Vendors) ───────────────────────────────────────────────────

  async listSuppliers(credentials: Credentials, params: QueryParams): Promise<Supplier[]> {
    const res = await this.client(credentials).get<AgilironVendorEnvelope>(
      '/Vendor',
      this.pageParams(params),
    )
    const items = res.Vendors?.Vendor ?? []
    return items.map(transformVendor)
  }

  async getSupplier(credentials: Credentials, id: string): Promise<Supplier> {
    const res = await this.client(credentials).get<AgilironVendorEnvelope>(
      '/Vendor',
      { filter: `VendorId,eq,${id}` },
    )
    const item = res.Vendors?.Vendor?.[0]
    if (!item) throw new Error(`agiliron vendor ${id} not found`)
    return transformVendor(item)
  }

  // ── Purchase Orders ───────────────────────────────────────────────────────

  async listPurchaseOrders(credentials: Credentials, params: QueryParams): Promise<PurchaseOrder[]> {
    const res = await this.client(credentials).get<AgilironPurchaseOrderEnvelope>(
      '/PurchaseOrders',
      this.pageParams(params),
    )
    const items = res.PurchaseOrders?.PurchaseOrder ?? []
    return items.map(transformPurchaseOrder)
  }

  async getPurchaseOrder(credentials: Credentials, id: string): Promise<PurchaseOrder> {
    const res = await this.client(credentials).get<AgilironPurchaseOrderEnvelope>(
      '/PurchaseOrders',
      { filter: `PurchaseOrderId,eq,${id}` },
    )
    const item = res.PurchaseOrders?.PurchaseOrder?.[0]
    if (!item) throw new Error(`agiliron purchase order ${id} not found`)
    return transformPurchaseOrder(item)
  }

  // ── Stock Transfers (Inventory Transfers) ─────────────────────────────────

  async listStockTransfers(credentials: Credentials, params: QueryParams): Promise<StockTransfer[]> {
    const res = await this.client(credentials).get<AgilironTransferEnvelope>(
      '/InventoryTransfer',
      this.pageParams(params),
    )
    const items = res.Orders?.Order ?? []
    return items.map(transformStockTransfer)
  }

  async getStockTransfer(credentials: Credentials, id: string): Promise<StockTransfer> {
    const res = await this.client(credentials).get<AgilironTransferEnvelope>(
      '/InventoryTransfer',
      { filter: `OrdersId,eq,${id}` },
    )
    const item = res.Orders?.Order?.[0]
    if (!item) throw new Error(`agiliron inventory transfer ${id} not found`)
    return transformStockTransfer(item)
  }
}
