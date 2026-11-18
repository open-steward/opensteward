/**
 * SKUSavvy inventory adapter.
 *
 * SKUSavvy is a GraphQL-native WMS focused on Shopify / ecommerce warehouses.
 * Auth: single API token sent as X-Token header.
 * Transport: single POST endpoint at https://app.skusavvy.com/graphql.
 * Pagination: limit + offset on all list queries.
 * Webhooks: not documented — verifyWebhook / parseWebhookEvents not implemented.
 *
 * Supported resources: products, stock levels (bin levels), locations,
 * suppliers (vendors), purchase orders, stock transfers, stock adjustments.
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
  credentialFields as skusavvyCredentialFields,
  exchangeCredentials as skusavvyExchangeCredentials,
  getAuthUrlUnsupported,
} from './auth'
import {SkusavvyClient} from './client'
import {DEFAULT_PAGE_SIZE} from './constants'

import {transformProduct, type RawSkusavvyProduct} from './transform/product'
import {transformStockLevel, type RawSkusavvyStockLevel} from './transform/stock-level'
import {transformLocation, type RawSkusavvyLocation} from './transform/location'
import {transformSupplier, type RawSkusavvyVendor} from './transform/supplier'
import {transformPurchaseOrder, type RawSkusavvyPurchaseOrder} from './transform/purchase-order'
import {transformStockTransfer, type RawSkusavvyStockTransfer} from './transform/stock-transfer'
import {transformStockAdjustment, type RawSkusavvyStockAdjustment} from './transform/stock-adjustment'

// No OAuth client credentials needed — token-based only.
export type SkusavvyAdapterConfig = Record<string, never>

// ── GraphQL query strings ────────────────────────────────────────────────────

const PRODUCTS_QUERY = `
  query Products($limit: Int, $offset: Int) {
    products(limit: $limit, offset: $offset) {
      id sku name description barcode brand productType
      weight weightUnit price compareAtPrice active
      parentId vendorId createdAt updatedAt
    }
  }
`

const PRODUCT_QUERY = `
  query Product($id: ID!) {
    product(id: $id) {
      id sku name description barcode brand productType
      weight weightUnit price compareAtPrice active
      parentId vendorId createdAt updatedAt
    }
  }
`

const BIN_LEVELS_QUERY = `
  query BinLevels($limit: Int, $offset: Int) {
    binLevels(limit: $limit, offset: $offset) {
      id productId locationId binId
      quantity available committed incoming
      reorderPoint reorderQuantity lastCountedAt updatedAt
    }
  }
`

const LOCATIONS_QUERY = `
  query Locations($limit: Int, $offset: Int) {
    locations(limit: $limit, offset: $offset) {
      id name code locationType isDefault active parentId
      address { address1 address2 city province country zip }
    }
  }
`

const LOCATION_QUERY = `
  query Location($id: ID!) {
    location(id: $id) {
      id name code locationType isDefault active parentId
      address { address1 address2 city province country zip }
    }
  }
`

const VENDORS_QUERY = `
  query Vendors($limit: Int, $offset: Int) {
    vendors(limit: $limit, offset: $offset) {
      id name email phone currency leadTime status
    }
  }
`

const VENDOR_QUERY = `
  query Vendor($id: ID!) {
    vendor(id: $id) {
      id name email phone currency leadTime status
    }
  }
`

const PURCHASE_ORDERS_QUERY = `
  query PurchaseOrders($limit: Int, $offset: Int) {
    purchaseOrders(limit: $limit, offset: $offset) {
      id number vendorId status currency subtotal total locationId
      lineItems { id productId quantity quantityReceived unitCost lineTotal }
      orderedAt expectedAt receivedAt
    }
  }
`

const PURCHASE_ORDER_QUERY = `
  query PurchaseOrder($id: ID!) {
    purchaseOrder(id: $id) {
      id number vendorId status currency subtotal total locationId
      lineItems { id productId quantity quantityReceived unitCost lineTotal }
      orderedAt expectedAt receivedAt
    }
  }
`

const STOCK_TRANSFERS_QUERY = `
  query StockTransfers($limit: Int, $offset: Int) {
    stockTransfers(limit: $limit, offset: $offset) {
      id transferNumber fromLocationId toLocationId status
      lineItems { productId quantity quantityReceived }
      shippedAt completedAt
    }
  }
`

const STOCK_TRANSFER_QUERY = `
  query StockTransfer($id: ID!) {
    stockTransfer(id: $id) {
      id transferNumber fromLocationId toLocationId status
      lineItems { productId quantity quantityReceived }
      shippedAt completedAt
    }
  }
`

const STOCK_ADJUSTMENTS_QUERY = `
  query StockAdjustments($limit: Int, $offset: Int) {
    stockAdjustments(limit: $limit, offset: $offset) {
      id locationId reason status
      lineItems { productId adjustmentQty countedQty notes }
      adjustedAt adjustedBy
    }
  }
`

const STOCK_ADJUSTMENT_QUERY = `
  query StockAdjustment($id: ID!) {
    stockAdjustment(id: $id) {
      id locationId reason status
      lineItems { productId adjustmentQty countedQty notes }
      adjustedAt adjustedBy
    }
  }
`

// ── Adapter ──────────────────────────────────────────────────────────────────

export class SkusavvyAdapter implements InventoryAdapter {
  readonly platform = 'skusavvy'
  readonly version = '0.1.0'

  constructor(_config: SkusavvyAdapterConfig = {}) {}

  credentialFields(): CredentialField[] {
    return skusavvyCredentialFields()
  }

  async exchangeCredentials(fields: Record<string, string>) {
    return skusavvyExchangeCredentials(fields)
  }

  getAuthUrl(_state: string, _scopes?: string[]): string {
    return getAuthUrlUnsupported()
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    throw new Error('skusavvy uses a static API token; use credentialFields() instead')
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return credentials
  }

  private client(credentials: Credentials): SkusavvyClient {
    return new SkusavvyClient(credentials)
  }

  private pageVars(params: QueryParams): { limit: number; offset: number } {
    const limit = params.limit ?? DEFAULT_PAGE_SIZE
    const offset = params.page !== undefined ? (params.page - 1) * limit : 0
    return { limit, offset }
  }

  // ── Products ───────────────────────────────────────────────────────────────

  async listProducts(credentials: Credentials, params: QueryParams): Promise<Product[]> {
    const res = await this.client(credentials).query<{ products: RawSkusavvyProduct[] }>(
      PRODUCTS_QUERY, this.pageVars(params),
    )
    return (res.products ?? []).map(transformProduct)
  }

  async getProduct(credentials: Credentials, id: string): Promise<Product> {
    const res = await this.client(credentials).query<{ product: RawSkusavvyProduct | null }>(
      PRODUCT_QUERY, { id },
    )
    if (!res.product) throw new Error(`skusavvy product ${id} not found`)
    return transformProduct(res.product)
  }

  // ── Stock Levels ───────────────────────────────────────────────────────────

  async listStockLevels(credentials: Credentials, params: QueryParams): Promise<StockLevel[]> {
    const res = await this.client(credentials).query<{ binLevels: RawSkusavvyStockLevel[] }>(
      BIN_LEVELS_QUERY, this.pageVars(params),
    )
    return (res.binLevels ?? []).map(transformStockLevel)
  }

  async getStockLevel(_credentials: Credentials, id: string): Promise<StockLevel> {
    throw new Error(`skusavvy stock-level fetch is bulk-only; call listStockLevels. id=${id}`)
  }

  // ── Locations ──────────────────────────────────────────────────────────────

  async listLocations(credentials: Credentials, params: QueryParams): Promise<Location[]> {
    const res = await this.client(credentials).query<{ locations: RawSkusavvyLocation[] }>(
      LOCATIONS_QUERY, this.pageVars(params),
    )
    return (res.locations ?? []).map(transformLocation)
  }

  async getLocation(credentials: Credentials, id: string): Promise<Location> {
    const res = await this.client(credentials).query<{ location: RawSkusavvyLocation | null }>(
      LOCATION_QUERY, { id },
    )
    if (!res.location) throw new Error(`skusavvy location ${id} not found`)
    return transformLocation(res.location)
  }

  // ── Suppliers (Vendors) ────────────────────────────────────────────────────

  async listSuppliers(credentials: Credentials, params: QueryParams): Promise<Supplier[]> {
    const res = await this.client(credentials).query<{ vendors: RawSkusavvyVendor[] }>(
      VENDORS_QUERY, this.pageVars(params),
    )
    return (res.vendors ?? []).map(transformSupplier)
  }

  async getSupplier(credentials: Credentials, id: string): Promise<Supplier> {
    const res = await this.client(credentials).query<{ vendor: RawSkusavvyVendor | null }>(
      VENDOR_QUERY, { id },
    )
    if (!res.vendor) throw new Error(`skusavvy vendor ${id} not found`)
    return transformSupplier(res.vendor)
  }

  // ── Purchase Orders ────────────────────────────────────────────────────────

  async listPurchaseOrders(credentials: Credentials, params: QueryParams): Promise<PurchaseOrder[]> {
    const res = await this.client(credentials).query<{ purchaseOrders: RawSkusavvyPurchaseOrder[] }>(
      PURCHASE_ORDERS_QUERY, this.pageVars(params),
    )
    return (res.purchaseOrders ?? []).map(transformPurchaseOrder)
  }

  async getPurchaseOrder(credentials: Credentials, id: string): Promise<PurchaseOrder> {
    const res = await this.client(credentials).query<{ purchaseOrder: RawSkusavvyPurchaseOrder | null }>(
      PURCHASE_ORDER_QUERY, { id },
    )
    if (!res.purchaseOrder) throw new Error(`skusavvy purchase order ${id} not found`)
    return transformPurchaseOrder(res.purchaseOrder)
  }

  // ── Stock Transfers ────────────────────────────────────────────────────────

  async listStockTransfers(credentials: Credentials, params: QueryParams): Promise<StockTransfer[]> {
    const res = await this.client(credentials).query<{ stockTransfers: RawSkusavvyStockTransfer[] }>(
      STOCK_TRANSFERS_QUERY, this.pageVars(params),
    )
    return (res.stockTransfers ?? []).map(transformStockTransfer)
  }

  async getStockTransfer(credentials: Credentials, id: string): Promise<StockTransfer> {
    const res = await this.client(credentials).query<{ stockTransfer: RawSkusavvyStockTransfer | null }>(
      STOCK_TRANSFER_QUERY, { id },
    )
    if (!res.stockTransfer) throw new Error(`skusavvy stock transfer ${id} not found`)
    return transformStockTransfer(res.stockTransfer)
  }

  // ── Stock Adjustments ──────────────────────────────────────────────────────

  async listStockAdjustments(credentials: Credentials, params: QueryParams): Promise<StockAdjustment[]> {
    const res = await this.client(credentials).query<{ stockAdjustments: RawSkusavvyStockAdjustment[] }>(
      STOCK_ADJUSTMENTS_QUERY, this.pageVars(params),
    )
    return (res.stockAdjustments ?? []).map(transformStockAdjustment)
  }

  async getStockAdjustment(credentials: Credentials, id: string): Promise<StockAdjustment> {
    const res = await this.client(credentials).query<{ stockAdjustment: RawSkusavvyStockAdjustment | null }>(
      STOCK_ADJUSTMENT_QUERY, { id },
    )
    if (!res.stockAdjustment) throw new Error(`skusavvy stock adjustment ${id} not found`)
    return transformStockAdjustment(res.stockAdjustment)
  }
}
