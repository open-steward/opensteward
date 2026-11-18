/**
 * GoCodes adapter for the inventory vertical.
 *
 * GoCodes is an asset-tracking platform.  The public REST API exposes:
 *   - Assets  (→ Products)
 *   - Locations
 *   - Stock levels (synthesised from asset + location data)
 *
 * Auth: static API key passed as `apikey` query parameter on every request.
 * Docs: https://documenter.getpostman.com/view/15366524/TzJpgeEe
 *
 * ── Resource coverage ──────────────────────────────────────────────────────
 * Unavailable: purchase-order   — GoCodes is an asset-tracking platform; purchase orders are not a concept in the product and no /purchase_orders endpoint exists in the public API.
 * Unavailable: stock-adjustment — GoCodes has no stock-adjustment concept or endpoint; inventory quantities are derived solely from asset-presence, not adjustment transactions.
 * Unavailable: stock-transfer   — GoCodes has no stock-transfer concept or endpoint; asset reassignment between locations is recorded on the asset record, not as transfer documents.
 * Unavailable: supplier         — GoCodes has no supplier/vendor concept or endpoint; procurement and vendor management are outside the scope of the platform.
 */
import type { CredentialField, Credentials, QueryParams } from '@opensteward/shared'
import type { InventoryAdapter } from '../../adapter/interface'
import type { Product } from '../../schema/product'
import type { StockLevel } from '../../schema/stock-level'
import type { Location } from '../../schema/location'

import {
  credentialFields as gocodesCredentialFields,
  exchangeCredentials as gocodesExchangeCredentials,
  getAuthUrlUnsupported,
} from './auth'
import {GocodesClient} from './client'
import {DEFAULT_PAGE_SIZE} from './constants'

import {transformProduct, type RawGocodesAsset} from './transform/product'
import {transformStockLevel, type RawGocodesStockLevel} from './transform/stock-level'
import {transformLocation, type RawGocodesLocation} from './transform/location'
export type GocodesAdapterConfig = Record<string, never>

/** GoCodes list-assets response envelope. */
interface AssetsListResponse {
  assets?: RawGocodesAsset[]
  data?: RawGocodesAsset[]
  /** Total record count for pagination. */
  total?: number
  [key: string]: unknown
}

/** GoCodes single-asset response envelope. */
interface AssetResponse {
  asset?: RawGocodesAsset
  data?: RawGocodesAsset
  [key: string]: unknown
}

/** GoCodes list-locations response envelope. */
interface LocationsListResponse {
  locations?: RawGocodesLocation[]
  data?: RawGocodesLocation[]
  [key: string]: unknown
}

/** GoCodes single-location response envelope. */
interface LocationResponse {
  location?: RawGocodesLocation
  data?: RawGocodesLocation
  [key: string]: unknown
}

export class GocodesAdapter implements InventoryAdapter {
  readonly platform = 'gocodes'
  readonly version = '0.1.0'

  constructor(_config: GocodesAdapterConfig = {}) {}

  credentialFields(): CredentialField[] {
    return gocodesCredentialFields()
  }

  async exchangeCredentials(fields: Record<string, string>) {
    return gocodesExchangeCredentials(fields)
  }

  getAuthUrl(_state: string, _scopes?: string[]): string {
    return getAuthUrlUnsupported()
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    throw new Error('gocodes uses a static API key; use credentialFields() instead')
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return credentials
  }

  private client(credentials: Credentials): GocodesClient {
    return new GocodesClient(credentials)
  }

  private listParams(params: QueryParams): Record<string, unknown> {
    return {
      per_page: params.limit ?? DEFAULT_PAGE_SIZE,
      ...(params.page ? { page: params.page } : {}),
    }
  }

  // ── Products (Assets) ─────────────────────────────────────────────────────

  async listProducts(credentials: Credentials, params: QueryParams): Promise<Product[]> {
    const res = await this.client(credentials).get<AssetsListResponse>('/assets', this.listParams(params))
    const items = res.assets ?? res.data ?? []
    return items.map(transformProduct)
  }

  async getProduct(credentials: Credentials, id: string): Promise<Product> {
    const res = await this.client(credentials).get<AssetResponse>(`/assets/${id}`)
    const raw = res.asset ?? res.data
    if (!raw) throw new Error(`gocodes asset ${id} not found`)
    return transformProduct(raw)
  }

  // ── Locations ────────────────────────────────────────────────────────────

  async listLocations(credentials: Credentials, params: QueryParams): Promise<Location[]> {
    const res = await this.client(credentials).get<LocationsListResponse>('/locations', this.listParams(params))
    const items = res.locations ?? res.data ?? []
    return items.map(transformLocation)
  }

  async getLocation(credentials: Credentials, id: string): Promise<Location> {
    const res = await this.client(credentials).get<LocationResponse>(`/locations/${id}`)
    const raw = res.location ?? res.data
    if (!raw) throw new Error(`gocodes location ${id} not found`)
    return transformLocation(raw)
  }

  // ── StockLevels ───────────────────────────────────────────────────────────
  //
  // GoCodes does not expose a dedicated stock-level endpoint.  We synthesise
  // stock levels by fetching all assets and grouping by location.  Each asset
  // record represents one physical unit, so quantity = count of assets per
  // (asset_tag, location_id) group.
  //
  // listStockLevels returns one StockLevel per (asset_id, location_id) pair.

  async listStockLevels(credentials: Credentials, params: QueryParams): Promise<StockLevel[]> {
    const res = await this.client(credentials).get<AssetsListResponse>('/assets', this.listParams(params))
    const assets = res.assets ?? res.data ?? []
    return assets
      .filter((a) => a.location_id)
      .map((a): RawGocodesStockLevel => ({
        asset_id: String(a.id),
        location_id: String(a.location_id),
        quantity_on_hand: 1,
        quantity_checked_out: undefined,
        last_audit_date: a.updated_at,
      }))
      .map(transformStockLevel)
  }

  async getStockLevel(_credentials: Credentials, id: string): Promise<StockLevel> {
    throw new Error(`gocodes stock-level fetch is synthesised from assets — call listStockLevels. id=${id}`)
  }
}
