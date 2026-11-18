/**
 * Inventory Planner adapter for the inventory vertical.
 *
 * Inventory Planner (by Sage) is a demand-forecasting and replenishment tool
 * that sits above an e-commerce platform (Shopify, WooCommerce, etc.) and
 * provides purchase-order management and stock analytics.
 *
 * Auth: API key + Account ID — both supplied as plain HTTP headers:
 *   Authorization: <api_key>
 *   Account: <account_id>
 * Keys are generated in Account → Settings → API.
 *
 * Supported resources (via the Stock Orders API + Reports API):
 *   - Products        → /api/v1/variants   (Reports API)
 *   - StockLevels     → derived from variant.warehouses map
 *   - Locations       → derived from unique warehouse keys in variant.warehouses map
 *   - Suppliers       → /api/v1/vendors
 *   - PurchaseOrders  → /api/v1/purchase-orders
 *
 * Schema-firewall: no product images, no supplier banking details.
 *
 * ── Resource coverage ──────────────────────────────────────────────
 * Unavailable: stock-adjustment — Inventory Planner has no stock-adjustment concept or endpoint; adjustments are managed in the connected e-commerce/WMS platform
 * Unavailable: stock-transfer   — Inventory Planner has no stock-transfer endpoint; transfers are managed in the connected e-commerce/WMS platform
 */
import type { CredentialField, Credentials, QueryParams } from '@opensteward/shared'
import type { InventoryAdapter } from '../../adapter/interface'
import type { Product } from '../../schema/product'
import type { StockLevel } from '../../schema/stock-level'
import type { Location } from '../../schema/location'
import type { Supplier } from '../../schema/supplier'
import type { PurchaseOrder } from '../../schema/purchase-order'

import {
  credentialFields as ipCredentialFields,
  exchangeCredentials as ipExchangeCredentials,
  getAuthUrlUnsupported,
} from './auth'
import {InventoryPlannerClient} from './client'
import {DEFAULT_PAGE_SIZE, API_V1} from './constants'

import {transformProduct, type RawInventoryPlannerVariant} from './transform/product'
import {transformStockLevelsFromVariant} from './transform/stock-level'
import {deriveLocationsFromVariants, deriveLocation} from './transform/location'
import {transformSupplier, type RawInventoryPlannerVendor} from './transform/supplier'
import {transformPurchaseOrder, type RawInventoryPlannerPurchaseOrder} from './transform/purchase-order'

// ── Response envelopes ────────────────────────────────────────────────────────

interface VariantsResponse {
  variants?: RawInventoryPlannerVariant[]
  result?: { message?: string; status?: string }
  [key: string]: unknown
}

interface VariantResponse {
  variant?: RawInventoryPlannerVariant
  result?: { message?: string; status?: string }
  [key: string]: unknown
}

interface VendorsResponse {
  vendors?: RawInventoryPlannerVendor[]
  result?: { message?: string; status?: string }
  [key: string]: unknown
}

interface VendorResponse {
  vendor?: RawInventoryPlannerVendor
  result?: { message?: string; status?: string }
  [key: string]: unknown
}

interface PurchaseOrdersResponse {
  'purchase-orders'?: RawInventoryPlannerPurchaseOrder[]
  purchase_orders?: RawInventoryPlannerPurchaseOrder[]
  result?: { message?: string; status?: string }
  [key: string]: unknown
}

interface PurchaseOrderResponse {
  'purchase-order'?: RawInventoryPlannerPurchaseOrder
  purchase_order?: RawInventoryPlannerPurchaseOrder
  result?: { message?: string; status?: string }
  [key: string]: unknown
}

// ── Adapter config (no OAuth needed) ─────────────────────────────────────────

export type InventoryPlannerAdapterConfig = Record<string, never>

// ── Adapter ───────────────────────────────────────────────────────────────────

export class InventoryPlannerAdapter implements InventoryAdapter {
  readonly platform = 'inventory-planner'
  readonly version = '0.1.0'

  constructor(_config?: InventoryPlannerAdapterConfig) {}

  credentialFields(): CredentialField[] {
    return ipCredentialFields()
  }

  async exchangeCredentials(fields: Record<string, string>) {
    return ipExchangeCredentials(fields)
  }

  getAuthUrl(_state: string, _scopes?: string[]): string {
    return getAuthUrlUnsupported()
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    throw new Error('inventory-planner uses static API key + Account ID; use credentialFields() instead')
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return credentials
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  private client(credentials: Credentials): InventoryPlannerClient {
    return new InventoryPlannerClient(credentials)
  }

  private listParams(params: QueryParams): Record<string, unknown> {
    return {
      limit: params.limit ?? DEFAULT_PAGE_SIZE,
      ...(params.page ? { page: params.page } : {}),
    }
  }

  // ── Products (via /api/v1/variants) ─────────────────────────────────────────

  async listProducts(credentials: Credentials, params: QueryParams): Promise<Product[]> {
    const res = await this.client(credentials).get<VariantsResponse>(
      `${API_V1}/variants`,
      this.listParams(params),
    )
    return (res.variants ?? []).map(transformProduct)
  }

  async getProduct(credentials: Credentials, id: string): Promise<Product> {
    const res = await this.client(credentials).get<VariantResponse>(`${API_V1}/variants/${id}`)
    if (!res.variant) throw new Error(`inventory-planner variant ${id} not found`)
    return transformProduct(res.variant)
  }

  // ── StockLevels (derived from variant warehouse data) ───────────────────────

  async listStockLevels(credentials: Credentials, params: QueryParams): Promise<StockLevel[]> {
    const res = await this.client(credentials).get<VariantsResponse>(
      `${API_V1}/variants`,
      this.listParams(params),
    )
    const levels: StockLevel[] = []
    for (const variant of res.variants ?? []) {
      levels.push(...transformStockLevelsFromVariant(variant))
    }
    return levels
  }

  async getStockLevel(credentials: Credentials, id: string): Promise<StockLevel> {
    // id format expected: "<variantId>:<locationId>"
    const sep = id.indexOf(':')
    if (sep === -1) throw new Error(`inventory-planner getStockLevel: id must be "<variantId>:<locationId>", got "${id}"`)
    const variantId = id.slice(0, sep)
    const locationId = id.slice(sep + 1)
    const res = await this.client(credentials).get<VariantResponse>(`${API_V1}/variants/${variantId}`)
    if (!res.variant) throw new Error(`inventory-planner variant ${variantId} not found`)
    const levels = transformStockLevelsFromVariant(res.variant)
    const level = levels.find((l) => l.locationId === locationId)
    if (!level) throw new Error(`inventory-planner stock level ${id} not found`)
    return level
  }

  // ── Locations (derived from variant warehouse keys) ─────────────────────────

  async listLocations(credentials: Credentials, params: QueryParams): Promise<Location[]> {
    const res = await this.client(credentials).get<VariantsResponse>(
      `${API_V1}/variants`,
      this.listParams(params),
    )
    return deriveLocationsFromVariants(res.variants ?? [])
  }

  async getLocation(credentials: Credentials, id: string): Promise<Location> {
    // id is the warehouse name; we scan variants to confirm it exists
    const res = await this.client(credentials).get<VariantsResponse>(
      `${API_V1}/variants`,
      { limit: DEFAULT_PAGE_SIZE },
    )
    const variants = res.variants ?? []
    for (const variant of variants) {
      if (variant.warehouses && id in variant.warehouses) {
        return deriveLocation(id)
      }
    }
    throw new Error(`inventory-planner location "${id}" not found in any variant warehouse`)
  }

  // ── Suppliers (via /api/v1/vendors) ─────────────────────────────────────────

  async listSuppliers(credentials: Credentials, params: QueryParams): Promise<Supplier[]> {
    const res = await this.client(credentials).get<VendorsResponse>(
      `${API_V1}/vendors`,
      this.listParams(params),
    )
    return (res.vendors ?? []).map(transformSupplier)
  }

  async getSupplier(credentials: Credentials, id: string): Promise<Supplier> {
    const res = await this.client(credentials).get<VendorResponse>(`${API_V1}/vendors/${id}`)
    if (!res.vendor) throw new Error(`inventory-planner vendor ${id} not found`)
    return transformSupplier(res.vendor)
  }

  // ── PurchaseOrders (via /api/v1/purchase-orders) ────────────────────────────

  async listPurchaseOrders(credentials: Credentials, params: QueryParams): Promise<PurchaseOrder[]> {
    const res = await this.client(credentials).get<PurchaseOrdersResponse>(
      `${API_V1}/purchase-orders`,
      this.listParams(params),
    )
    const list = res['purchase-orders'] ?? res.purchase_orders ?? []
    return list.map(transformPurchaseOrder)
  }

  async getPurchaseOrder(credentials: Credentials, id: string): Promise<PurchaseOrder> {
    const res = await this.client(credentials).get<PurchaseOrderResponse>(`${API_V1}/purchase-orders/${id}`)
    const po = res['purchase-order'] ?? res.purchase_order
    if (!po) throw new Error(`inventory-planner purchase order ${id} not found`)
    return transformPurchaseOrder(po)
  }
}
