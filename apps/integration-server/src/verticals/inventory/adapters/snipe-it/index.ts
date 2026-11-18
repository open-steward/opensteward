/**
 * Snipe-IT adapter — IT asset management mapped to the inventory vertical.
 *
 * Snipe-IT tracks individual hardware assets (laptops, monitors, servers, etc.)
 * at user-hosted or cloud instances.  Auth: Bearer API token.
 *
 * Supported resources:
 *   - products     → /hardware  (each hardware asset = one product record)
 *   - stock-levels → /hardware  (each asset synthesised as qty=1 at location)
 *   - locations    → /locations
 *   - suppliers    → /suppliers
 *
 * Webhooks: Snipe-IT has no documented HMAC webhook signing mechanism.
 *
 * ── Resource coverage ──────────────────────────────────────────────
 * Unavailable: purchase-order   — no purchase-order concept or API endpoint in Snipe-IT
 * Unavailable: stock-adjustment — Snipe-IT tracks individual assets (qty=1); no bulk stock-adjustment endpoint
 * Unavailable: stock-transfer   — asset reassignment is a check-in/check-out workflow, not a batch transfer endpoint
 */
import type { CredentialField, Credentials, QueryParams } from '@opensteward/shared'
import type { InventoryAdapter } from '../../adapter/interface'
import type { Product } from '../../schema/product'
import type { StockLevel } from '../../schema/stock-level'
import type { Location } from '../../schema/location'
import type { Supplier } from '../../schema/supplier'

import {
  credentialFields as snipeItCredentialFields,
  exchangeCredentials as snipeItExchangeCredentials,
  getAuthUrlUnsupported,
} from './auth'
import {SnipeItClient} from './client'
import {DEFAULT_PAGE_SIZE} from './constants'

import {transformProduct, type RawSnipeItAsset} from './transform/product'
import {transformStockLevel} from './transform/stock-level'
import {transformLocation, type RawSnipeItLocation} from './transform/location'
import {transformSupplier, type RawSnipeItSupplier} from './transform/supplier'

export type SnipeItAdapterConfig = Record<string, never>

/** Snipe-IT paginated list wrapper */
interface SnipeListResponse<T> {
  total?: number
  rows?: T[]
}

export class SnipeItAdapter implements InventoryAdapter {
  readonly platform = 'snipe-it'
  readonly version = '0.1.0'

  constructor(_config?: SnipeItAdapterConfig) {}

  credentialFields(): CredentialField[] {
    return snipeItCredentialFields()
  }

  async exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
    return snipeItExchangeCredentials(fields)
  }

  getAuthUrl(_state: string, _scopes?: string[]): string {
    return getAuthUrlUnsupported()
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    throw new Error('snipe-it uses a static Bearer API token; use credentialFields() instead')
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return credentials
  }

  // ── No webhook support — Snipe-IT does not document HMAC request signing ──
  verifyWebhook(_payload: Buffer, _headers: Record<string, string>, _secret: string): boolean {
    return false
  }

  private client(credentials: Credentials): SnipeItClient {
    return new SnipeItClient(credentials)
  }

  private pageParams(params: QueryParams): Record<string, unknown> {
    const limit = params.limit ?? DEFAULT_PAGE_SIZE
    const offset = params.page != null ? (params.page - 1) * limit : 0
    return { limit, offset }
  }

  // ── Products (hardware assets) ────────────────────────────────────────────

  async listProducts(credentials: Credentials, params: QueryParams): Promise<Product[]> {
    const res = await this.client(credentials).get<SnipeListResponse<RawSnipeItAsset>>(
      '/hardware',
      this.pageParams(params),
    )
    return (res.rows ?? []).map(transformProduct)
  }

  async getProduct(credentials: Credentials, id: string): Promise<Product> {
    const raw = await this.client(credentials).get<RawSnipeItAsset>(`/hardware/${id}`)
    return transformProduct(raw)
  }

  // ── Stock levels (synthesised from hardware assets) ───────────────────────

  async listStockLevels(credentials: Credentials, params: QueryParams): Promise<StockLevel[]> {
    const res = await this.client(credentials).get<SnipeListResponse<RawSnipeItAsset>>(
      '/hardware',
      this.pageParams(params),
    )
    return (res.rows ?? []).map(transformStockLevel)
  }

  async getStockLevel(credentials: Credentials, id: string): Promise<StockLevel> {
    // id is an asset id; synthesise a single StockLevel record from the asset
    const raw = await this.client(credentials).get<RawSnipeItAsset>(`/hardware/${id}`)
    return transformStockLevel(raw)
  }

  // ── Locations ─────────────────────────────────────────────────────────────

  async listLocations(credentials: Credentials, params: QueryParams): Promise<Location[]> {
    const res = await this.client(credentials).get<SnipeListResponse<RawSnipeItLocation>>(
      '/locations',
      this.pageParams(params),
    )
    return (res.rows ?? []).map(transformLocation)
  }

  async getLocation(credentials: Credentials, id: string): Promise<Location> {
    const raw = await this.client(credentials).get<RawSnipeItLocation>(`/locations/${id}`)
    return transformLocation(raw)
  }

  // ── Suppliers ─────────────────────────────────────────────────────────────

  async listSuppliers(credentials: Credentials, params: QueryParams): Promise<Supplier[]> {
    const res = await this.client(credentials).get<SnipeListResponse<RawSnipeItSupplier>>(
      '/suppliers',
      this.pageParams(params),
    )
    return (res.rows ?? []).map(transformSupplier)
  }

  async getSupplier(credentials: Credentials, id: string): Promise<Supplier> {
    const raw = await this.client(credentials).get<RawSnipeItSupplier>(`/suppliers/${id}`)
    return transformSupplier(raw)
  }
}
