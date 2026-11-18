/**
 * Pickware adapter — Shopware ERP powered by Pickware.
 *
 * Pickware is a Shopware 5 plugin that adds warehouse/bin-location/stock
 * management.  Its REST API extends Shopware 5's own REST API and lives on
 * the merchant's own Shopware 5 instance.
 *
 * Supported resources:
 *   - products   (Shopware 5 articles — GET /api/articles)
 *   - locations  (Pickware warehouses — GET /api/warehouses)
 *   - stockLevels (Pickware bin-location mappings — GET /api/binLocations)
 *   - suppliers  (Shopware 5 manufacturers/brands — GET /api/manufacturers)
 *
 * Auth: HTTP Basic Authentication — base64(username:api_key).
 * Base URL is customer-supplied (their Shopware 5 instance URL).
 *
 * ── Resource coverage ──────────────────────────────────────────────
 * Unavailable: purchase-order   — no purchase order concept or endpoint in Shopware 5 or Pickware REST API
 * Unavailable: stock-transfer   — Pickware stock relocate is write-only (PUT); no list/get of historical transfers
 * Unavailable: stock-adjustment — Pickware stock change is write-only (PUT); no list/get of historical adjustments
 */
import type { CredentialField, Credentials, QueryParams } from '@opensteward/shared'
import type { InventoryAdapter } from '../../adapter/interface'
import type { Product } from '../../schema/product'
import type { StockLevel } from '../../schema/stock-level'
import type { Location } from '../../schema/location'
import type { Supplier } from '../../schema/supplier'

import {
  credentialFields as pickwareCredentialFields,
  exchangeCredentials as pickwareExchangeCredentials,
  getAuthUrlUnsupported,
} from './auth'
import {PickwareClient} from './client'
import {DEFAULT_PAGE_SIZE} from './constants'

import {transformProduct, type RawPickwareArticle} from './transform/product'
import {transformStockLevelsFromBinLocation, type RawPickwareBinLocation} from './transform/stock-level'
import {transformLocation, type RawPickwareWarehouse} from './transform/location'
import {transformSupplier, type RawPickwareManufacturer} from './transform/supplier'

export type PickwareAdapterConfig = Record<string, never>

/** Shopware 5 REST API list envelope */
interface ShopwareListResponse<T> {
  success?: boolean
  total?: number
  data?: T[]
}

/** Shopware 5 REST API single-item envelope */
interface ShopwareSingleResponse<T> {
  success?: boolean
  data?: T
}

export class PickwareAdapter implements InventoryAdapter {
  readonly platform = 'pickware'
  readonly version = '0.1.0'

  constructor(_config?: PickwareAdapterConfig) {}

  credentialFields(): CredentialField[] {
    return pickwareCredentialFields()
  }

  async exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
    return pickwareExchangeCredentials(fields)
  }

  getAuthUrl(_state: string, _scopes?: string[]): string {
    return getAuthUrlUnsupported()
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    throw new Error('pickware uses HTTP Basic auth (username + api_key); use credentialFields() instead')
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    // API keys do not expire; return as-is.
    return credentials
  }

  private client(credentials: Credentials): PickwareClient {
    return new PickwareClient(credentials)
  }

  /** Build Shopware 5 pagination query params from canonical QueryParams. */
  private pageParams(params: QueryParams): Record<string, unknown> {
    const limit = params.limit ?? DEFAULT_PAGE_SIZE
    const start = params.page ? (params.page - 1) * limit : 0
    return { limit, start }
  }

  // ── Products (Shopware 5 articles) ────────────────────────────────────────

  async listProducts(credentials: Credentials, params: QueryParams): Promise<Product[]> {
    const res = await this.client(credentials).get<ShopwareListResponse<RawPickwareArticle>>(
      '/articles',
      this.pageParams(params),
    )
    return (res.data ?? []).map(transformProduct)
  }

  async getProduct(credentials: Credentials, id: string): Promise<Product> {
    const res = await this.client(credentials).get<ShopwareSingleResponse<RawPickwareArticle>>(
      `/articles/${id}`,
    )
    if (!res.data) throw new Error(`pickware article ${id} not found`)
    return transformProduct(res.data)
  }

  // ── Locations (Pickware warehouses) ───────────────────────────────────────

  async listLocations(credentials: Credentials, params: QueryParams): Promise<Location[]> {
    const res = await this.client(credentials).get<ShopwareListResponse<RawPickwareWarehouse>>(
      '/warehouses',
      this.pageParams(params),
    )
    return (res.data ?? []).map(transformLocation)
  }

  async getLocation(credentials: Credentials, id: string): Promise<Location> {
    const res = await this.client(credentials).get<ShopwareSingleResponse<RawPickwareWarehouse>>(
      `/warehouses/${id}`,
    )
    if (!res.data) throw new Error(`pickware warehouse ${id} not found`)
    return transformLocation(res.data)
  }

  // ── Stock Levels (Pickware bin-location mappings) ─────────────────────────
  //
  // The Pickware REST API exposes stock at the bin-location level.
  // GET /api/binLocations returns a flat list (no stock mappings).
  // GET /api/binLocations/{id} returns the full detail with per-article stock.
  //
  // listStockLevels: page through bin-locations and fetch each detail record.
  // This is O(n) requests but is the only available pattern in the API.

  async listStockLevels(credentials: Credentials, params: QueryParams): Promise<StockLevel[]> {
    const client = this.client(credentials)
    const pageRes = await client.get<ShopwareListResponse<RawPickwareBinLocation>>(
      '/binLocations',
      this.pageParams(params),
    )
    const binIds = (pageRes.data ?? []).map((b) => b.id)
    const levels: StockLevel[] = []
    for (const binId of binIds) {
      try {
        const detail = await client.get<ShopwareSingleResponse<RawPickwareBinLocation>>(
          `/binLocations/${binId}`,
        )
        if (detail.data) {
          levels.push(...transformStockLevelsFromBinLocation(detail.data))
        }
      } catch {
        // Never throw in transforms; skip bins that fail to load.
      }
    }
    return levels
  }

  async getStockLevel(credentials: Credentials, id: string): Promise<StockLevel> {
    // id convention: "{articleDetailId}:{binLocationId}"
    const parts = id.split(':')
    const binId = parts[1] ?? parts[0]
    const articleId = parts[0]
    const res = await this.client(credentials).get<ShopwareSingleResponse<RawPickwareBinLocation>>(
      `/binLocations/${binId}`,
    )
    if (!res.data) throw new Error(`pickware binLocation ${binId} not found`)
    const levels = transformStockLevelsFromBinLocation(res.data)
    const match = levels.find((l) => l.productId === articleId)
    if (!match) throw new Error(`pickware stock level ${id} not found in bin ${binId}`)
    return match
  }

  // ── Suppliers (Shopware 5 manufacturers/brands — GET /api/manufacturers) ──
  //
  // Shopware 5 maps its manufacturer/brand catalog to s_articles_supplier.
  // This is the closest concept to an inventory supplier in the REST API.
  // Fields available: id, name, link, description. No email, phone, or lead times.

  async listSuppliers(credentials: Credentials, params: QueryParams): Promise<Supplier[]> {
    const res = await this.client(credentials).get<ShopwareListResponse<RawPickwareManufacturer>>(
      '/manufacturers',
      this.pageParams(params),
    )
    return (res.data ?? []).map(transformSupplier)
  }

  async getSupplier(credentials: Credentials, id: string): Promise<Supplier> {
    const res = await this.client(credentials).get<ShopwareSingleResponse<RawPickwareManufacturer>>(
      `/manufacturers/${id}`,
    )
    if (!res.data) throw new Error(`pickware manufacturer ${id} not found`)
    return transformSupplier(res.data)
  }
}
