/**
 * Descartes Sellercloud adapter — inventory vertical.
 *
 * Sellercloud is an omnichannel e-commerce operations platform with warehouse,
 * catalog, vendor, and purchase-order management.
 *
 * Auth: username + password exchanged for a JWT Bearer token via
 *   POST {baseUrl}/api/token → { access_token, expires_in: 3600 }
 * The client transparently re-authenticates when the token nears expiry.
 *
 * Base URL is team-specific: https://{teamSubdomain}.api.sellercloud.com/rest
 *
 * Supported resources: products, stock-levels (per-warehouse), locations
 *   (warehouses), suppliers (vendors), purchase-orders, stock-transfers (WITR).
 * Not supported: stock-adjustments (write-only, no list endpoint), webhooks
 *   (no documented HMAC/JWT event signing).
 *
 * Docs: https://developer.sellercloud.com/
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
  credentialFields as sellercloudCredentialFields,
  exchangeCredentials as sellercloudExchangeCredentials,
  getAuthUrlUnsupported,
} from './auth'
import {SellercloudClient} from './client'
import {DEFAULT_PAGE_SIZE} from './constants'

import {transformProduct, type RawSellercloudProduct} from './transform/product'
import {transformStockLevel, type RawSellercloudStockLevel} from './transform/stock-level'
import {transformLocation, type RawSellercloudWarehouse} from './transform/location'
import {transformSupplier, type RawSellercloudVendor} from './transform/supplier'
import {
  transformPurchaseOrder,
  type RawSellercloudPurchaseOrder,
  type RawSellercloudPurchaseOrderItem,
} from './transform/purchase-order'
import {transformStockTransfer, type RawSellercloudWITR, type RawSellercloudWITRProduct} from './transform/stock-transfer'

export interface SellercloudAdapterConfig {
  // No OAuth config needed — credentials are username/password/teamSubdomain
  [key: string]: unknown
}

/** Paginated response wrapper used by most Sellercloud list endpoints. */
interface PagedResponse<T> {
  Items?: T[]
  TotalResults?: number
}

/** Sellercloud purchase-order items response. */
interface PurchaseOrderItemsResponse {
  Items?: RawSellercloudPurchaseOrderItem[]
  TotalResults?: number
  PoCaseQtyEnabled?: boolean
}

/** Sellercloud WITR products response. */
interface WITRProductsResponse {
  Items?: RawSellercloudWITRProduct[]
  TotalResults?: number
}

export class SellercloudAdapter implements InventoryAdapter {
  readonly platform = 'sellercloud'
  readonly version = '0.1.0'

  constructor(_config: SellercloudAdapterConfig = {}) {}

  credentialFields(): CredentialField[] {
    return sellercloudCredentialFields()
  }

  async exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
    return sellercloudExchangeCredentials(fields)
  }

  getAuthUrl(_state: string, _scopes?: string[]): string {
    return getAuthUrlUnsupported()
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    throw new Error(
      'sellercloud uses username + password credentials; use credentialFields() instead',
    )
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    // Credentials contain the username/password, so the client re-authenticates
    // on the next API call automatically.  Nothing to exchange here.
    return credentials
  }

  // ── Products ─────────────────────────────────────────────────────────────

  async listProducts(credentials: Credentials, params: QueryParams): Promise<Product[]> {
    const client = new SellercloudClient(credentials)
    const res = await client.get<PagedResponse<RawSellercloudProduct>>('/api/catalog', {
      pageNumber: params.page ?? 1,
      pageSize: params.limit ?? DEFAULT_PAGE_SIZE,
    })
    return (res.Items ?? []).map(transformProduct)
  }

  async getProduct(credentials: Credentials, id: string): Promise<Product> {
    const client = new SellercloudClient(credentials)
    const res = await client.get<PagedResponse<RawSellercloudProduct>>('/api/catalog', {
      SKU: id,
      pageNumber: 1,
      pageSize: 1,
    })
    const item = res.Items?.[0]
    if (!item) throw new Error(`sellercloud product ${id} not found`)
    return transformProduct(item)
  }

  // ── StockLevels ───────────────────────────────────────────────────────────
  //
  // The Sellercloud inventory-warehouse endpoint is per-product.  For a bulk
  // list we accept an optional productId filter via params.filter?.productId,
  // but the single-item lookup uses the composite "{productId}:{warehouseId}"
  // id format.

  async listStockLevels(credentials: Credentials, params: QueryParams): Promise<StockLevel[]> {
    const client = new SellercloudClient(credentials)
    // If a productId filter is supplied, use the Inventory/Warehouses endpoint.
    const productId = (params as Record<string, unknown>)['filter']
      ? (params as Record<string, unknown>)['filter'] as string
      : undefined

    if (!productId) {
      // Bulk: fetch catalog page and then warehouse levels per product.
      // For performance we return levels for the current catalog page.
      const catalogRes = await client.get<PagedResponse<RawSellercloudProduct>>('/api/catalog', {
        pageNumber: params.page ?? 1,
        pageSize: params.limit ?? DEFAULT_PAGE_SIZE,
      })
      const levels: StockLevel[] = []
      for (const product of catalogRes.Items ?? []) {
        try {
          const invRes = await client.get<RawSellercloudStockLevel[] | RawSellercloudStockLevel>(
            '/api/Inventory/Warehouses',
            { productID: String(product.ID) },
          )
          const rows = Array.isArray(invRes) ? invRes : [invRes]
          for (const row of rows) {
            if (row && row.ProductID != null) levels.push(transformStockLevel(row))
          }
        } catch {
          // skip products with no warehouse data
        }
      }
      return levels
    }

    const invRes = await client.get<RawSellercloudStockLevel[] | RawSellercloudStockLevel>(
      '/api/Inventory/Warehouses',
      { productID: productId },
    )
    const rows = Array.isArray(invRes) ? invRes : [invRes]
    return rows.filter((r) => r && r.ProductID != null).map(transformStockLevel)
  }

  async getStockLevel(credentials: Credentials, id: string): Promise<StockLevel> {
    // id is composite: "{productId}:{warehouseId}"
    const [productId, warehouseId] = id.split(':')
    if (!productId) throw new Error(`sellercloud getStockLevel: invalid id "${id}"`)
    const client = new SellercloudClient(credentials)
    const invRes = await client.get<RawSellercloudStockLevel[] | RawSellercloudStockLevel>(
      '/api/Inventory/Warehouses',
      {
        productID: productId,
        ...(warehouseId ? { warehouseID: Number(warehouseId) } : {}),
      },
    )
    const rows = Array.isArray(invRes) ? invRes : [invRes]
    const match = rows.find((r) => {
      if (!r || r.ProductID == null) return false
      if (!warehouseId) return true
      return String(r.WarehouseID) === warehouseId
    })
    if (!match) throw new Error(`sellercloud stock level ${id} not found`)
    return transformStockLevel(match)
  }

  // ── Locations ─────────────────────────────────────────────────────────────

  async listLocations(credentials: Credentials, params: QueryParams): Promise<Location[]> {
    const client = new SellercloudClient(credentials)
    const res = await client.get<PagedResponse<RawSellercloudWarehouse>>('/api/Warehouses', {
      pageNumber: params.page ?? 1,
      pageSize: params.limit ?? DEFAULT_PAGE_SIZE,
    })
    return (res.Items ?? []).map(transformLocation)
  }

  async getLocation(credentials: Credentials, id: string): Promise<Location> {
    const client = new SellercloudClient(credentials)
    const raw = await client.get<RawSellercloudWarehouse>(`/api/Warehouses/${id}`)
    if (!raw || raw.ID == null) throw new Error(`sellercloud warehouse ${id} not found`)
    return transformLocation(raw)
  }

  // ── Suppliers (Vendors) ───────────────────────────────────────────────────

  async listSuppliers(credentials: Credentials, params: QueryParams): Promise<Supplier[]> {
    const client = new SellercloudClient(credentials)
    const res = await client.get<PagedResponse<RawSellercloudVendor>>('/api/Vendors', {
      pageNumber: params.page ?? 1,
      pageSize: params.limit ?? DEFAULT_PAGE_SIZE,
    })
    return (res.Items ?? []).map(transformSupplier)
  }

  async getSupplier(credentials: Credentials, id: string): Promise<Supplier> {
    const client = new SellercloudClient(credentials)
    const raw = await client.get<RawSellercloudVendor>(`/api/Vendors/${id}`)
    if (!raw || raw.ID == null) throw new Error(`sellercloud vendor ${id} not found`)
    return transformSupplier(raw)
  }

  // ── PurchaseOrders ────────────────────────────────────────────────────────

  async listPurchaseOrders(credentials: Credentials, params: QueryParams): Promise<PurchaseOrder[]> {
    const client = new SellercloudClient(credentials)
    const res = await client.get<PagedResponse<RawSellercloudPurchaseOrder>>('/api/purchaseorders', {
      pageNumber: params.page ?? 1,
      pageSize: params.limit ?? DEFAULT_PAGE_SIZE,
    })
    // For list calls we return POs without line items (avoid N+1).
    return (res.Items ?? []).map(transformPurchaseOrder)
  }

  async getPurchaseOrder(credentials: Credentials, id: string): Promise<PurchaseOrder> {
    const client = new SellercloudClient(credentials)
    // Fetch PO header
    const headerRes = await client.get<PagedResponse<RawSellercloudPurchaseOrder>>(
      '/api/purchaseorders',
      { pOIDs: [Number(id)], pageNumber: 1, pageSize: 1 },
    )
    const header = headerRes.Items?.[0]
    if (!header) throw new Error(`sellercloud purchase order ${id} not found`)

    // Fetch line items and merge
    try {
      const itemsRes = await client.get<PurchaseOrderItemsResponse>(
        `/api/PurchaseOrders/${id}/Items`,
        { pageNumber: 1, pageSize: 200 },
      )
      header.Items = itemsRes.Items ?? []
    } catch {
      header.Items = []
    }

    return transformPurchaseOrder(header)
  }

  // ── StockTransfers (WITR) ─────────────────────────────────────────────────

  async listStockTransfers(credentials: Credentials, params: QueryParams): Promise<StockTransfer[]> {
    const client = new SellercloudClient(credentials)
    const res = await client.get<PagedResponse<RawSellercloudWITR>>(
      '/api/WarehouseInventoryTransfers',
      {
        pageNumber: params.page ?? 1,
        pageSize: params.limit ?? DEFAULT_PAGE_SIZE,
      },
    )
    // Return WITRs without line items for list calls.
    return (res.Items ?? []).map(transformStockTransfer)
  }

  async getStockTransfer(credentials: Credentials, id: string): Promise<StockTransfer> {
    const client = new SellercloudClient(credentials)
    const raw = await client.get<RawSellercloudWITR>(
      `/api/WarehouseInventoryTransfers/${id}`,
    )
    if (!raw || raw.ID == null) throw new Error(`sellercloud WITR ${id} not found`)

    // Fetch and merge product lines
    try {
      const productsRes = await client.get<WITRProductsResponse>(
        `/api/WarehouseInventoryTransfers/${id}/Products`,
        { pageNumber: 1, pageSize: 200 },
      )
      raw.Products = productsRes.Items ?? []
    } catch {
      raw.Products = []
    }

    return transformStockTransfer(raw)
  }
}
