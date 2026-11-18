/**
 * Sellbrite adapter — multi-channel inventory management.
 *
 * Auth: HTTP Basic (account_token:secret_key).
 * Base URL: https://api.sellbrite.com/v1
 * Pagination: /products and /inventory take query params limit + page
 * (1-indexed), no documented max; /warehouses takes none and is paged locally.
 *
 * Supported resources: products, inventory (stock levels), warehouses (locations).
 */

// ── Resource coverage ──────────────────────────────────────────────
// Unavailable: purchase-order   — Sellbrite API has no purchase-order endpoint; purchasing is delegated to connected channels.
// Unavailable: stock-adjustment — PATCH /inventory writes adjustments but no history/audit-log read endpoint exists.
// Unavailable: stock-transfer   — Sellbrite API has no stock-transfer concept or endpoint.
// Unavailable: supplier         — Sellbrite API has no supplier concept or endpoint.
import { pageLocally, type CredentialField, type Credentials, type QueryParams } from '@opensteward/shared'
import type { InventoryAdapter } from '../../adapter/interface'
import type { Product } from '../../schema/product'
import type { StockLevel } from '../../schema/stock-level'
import type { Location } from '../../schema/location'

import {
  credentialFields as sellbriteCredentialFields,
  exchangeCredentials as sellbriteExchangeCredentials,
  getAuthUrlUnsupported,
} from './auth'
import {SellbriteClient} from './client'
import {DEFAULT_PAGE_SIZE} from './constants'

import {transformProduct, type RawSellbriteProduct} from './transform/product'
import {transformStockLevel, type RawSellbriteInventory} from './transform/stock-level'
import {transformLocation, type RawSellbriteWarehouse} from './transform/location'

// Sellbrite uses static credentials; no OAuth2 client ID/secret needed.
export type SellbriteAdapterConfig = Record<string, never>

export class SellbriteAdapter implements InventoryAdapter {
  readonly platform = 'sellbrite'
  readonly version = '0.1.0'

  constructor(_config?: SellbriteAdapterConfig) {}

  credentialFields(): CredentialField[] {
    return sellbriteCredentialFields()
  }

  async exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
    return sellbriteExchangeCredentials(fields)
  }

  getAuthUrl(_state: string, _scopes?: string[]): string {
    return getAuthUrlUnsupported()
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    throw new Error('sellbrite uses Basic HTTP auth; use credentialFields() instead')
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    // Basic auth credentials do not expire; return as-is.
    return credentials
  }

  private client(credentials: Credentials): SellbriteClient {
    return new SellbriteClient(credentials)
  }

  private listParams(params: QueryParams): Record<string, unknown> {
    return {
      limit: params.limit ?? DEFAULT_PAGE_SIZE,
      ...(params.page ? { page: params.page } : {}),
    }
  }

  // ── Products ──────────────────────────────────────────────────────────────

  async listProducts(credentials: Credentials, params: QueryParams): Promise<Product[]> {
    const res = await this.client(credentials).get<RawSellbriteProduct[]>('/products', this.listParams(params))
    return (Array.isArray(res) ? res : []).map(transformProduct)
  }

  async getProduct(credentials: Credentials, sku: string): Promise<Product> {
    const raw = await this.client(credentials).get<RawSellbriteProduct>(`/products/${encodeURIComponent(sku)}`)
    return transformProduct(raw)
  }

  // ── Stock Levels (inventory) ──────────────────────────────────────────────

  async listStockLevels(credentials: Credentials, params: QueryParams): Promise<StockLevel[]> {
    const res = await this.client(credentials).get<RawSellbriteInventory[]>('/inventory', this.listParams(params))
    return (Array.isArray(res) ? res : []).map(transformStockLevel)
  }

  async getStockLevel(_credentials: Credentials, id: string): Promise<StockLevel> {
    // Sellbrite inventory is bulk-only; no single-record fetch endpoint.
    throw new Error(`sellbrite stock-level fetch is bulk-only; call listStockLevels. id=${id}`)
  }

  // ── Locations (warehouses) ────────────────────────────────────────────────

  async listLocations(credentials: Credentials, params: QueryParams): Promise<Location[]> {
    // GET /warehouses documents no query params and returns every warehouse
    // ("Get a list of warehouses", developer.sellbrite.com/endpoints/warehouses.html),
    // so the caller's page is sliced here: returned whole, page 2 repeated page 1.
    const res = await this.client(credentials).get<RawSellbriteWarehouse[]>('/warehouses')
    return pageLocally((Array.isArray(res) ? res : []).map(transformLocation), params)
  }

  async getLocation(credentials: Credentials, uuid: string): Promise<Location> {
    // No single-warehouse GET; fetch all and find by uuid. No limit: every row.
    const all = await this.listLocations(credentials, {})
    const found = all.find((l) => l.id === uuid)
    if (!found) throw new Error(`sellbrite warehouse ${uuid} not found`)
    return found
  }
}
