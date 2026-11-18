/**
 * ConnectPOS inventory adapter.
 *
 * ConnectPOS is a Magento 2 POS module (SM_XRetail). Its REST API is served
 * from {storeUrl}/xrest/index/v1 with path-based routing (?path=<resource>).
 * Auth: Bearer JWT access token stored as the api_key credential.
 *
 * Supported resources:
 *   - products    GET ?path=product
 *   - stock-levels  GET ?path=warehouse-item  (per warehouse, per product)
 *   - locations   GET ?path=outlet  (POS outlets / physical stores)
 *
 * Not supported (no xrest endpoint):
 *   suppliers, purchase-orders, stock-transfers, stock-adjustments
 *
 * Schema-firewall: no product images, no POS shift/cash data, no payment data.
 */
import type { CredentialField, Credentials, QueryParams } from '@opensteward/shared'
import type { InventoryAdapter } from '../../adapter/interface'
import type { Product } from '../../schema/product'
import type { StockLevel } from '../../schema/stock-level'
import type { Location } from '../../schema/location'

import {
  credentialFields as connectposCredentialFields,
  exchangeCredentials as connectposExchangeCredentials,
  getAuthUrlUnsupported,
} from './auth'
import {ConnectposClient} from './client'
import {DEFAULT_PAGE_SIZE} from './constants'

import {transformProduct, type RawConnectposProduct} from './transform/product'
import {transformStockLevel, type RawConnectposStockLevel} from './transform/stock-level'
import {transformLocation, type RawConnectposOutlet} from './transform/location'

export type ConnectposAdapterConfig = Record<string, never>

/**
 * ConnectPOS xrest paginated response wrapper.
 * The SM_XRetail SearchResult serialises as:
 * { items: T[], total_count: number, search_criteria: {...} }
 */
interface XrestListResponse<T> {
  items?: T[]
  total_count?: number
  /** Some endpoints return data directly as array */
  data?: T[]
  [key: string]: unknown
}

export class ConnectposAdapter implements InventoryAdapter {
  readonly platform = 'connectpos'
  readonly version = '0.1.0'

  constructor(_config: ConnectposAdapterConfig) {}

  credentialFields(): CredentialField[] {
    return connectposCredentialFields()
  }

  async exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
    return connectposExchangeCredentials(fields)
  }

  getAuthUrl(_state: string, _scopes?: string[]): string {
    return getAuthUrlUnsupported()
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    throw new Error('connectpos uses a static JWT access token; use credentialFields() instead')
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    // JWT tokens are long-lived in ConnectPOS; no automated refresh
    return credentials
  }

  private client(credentials: Credentials): ConnectposClient {
    return new ConnectposClient(credentials)
  }

  /**
   * Build Magento-style searchCriteria pagination params.
   * ConnectPOS uses searchCriteria[currentPage] and searchCriteria[pageSize].
   */
  private listParams(params: QueryParams): Record<string, unknown> {
    const pageSize = params.limit ?? DEFAULT_PAGE_SIZE
    const currentPage = params.page ?? 1
    return {
      'searchCriteria[pageSize]': pageSize,
      'searchCriteria[currentPage]': currentPage,
    }
  }

  // ── Products ───────────────────────────────────────────────────────────────

  async listProducts(credentials: Credentials, params: QueryParams): Promise<Product[]> {
    const res = await this.client(credentials).get<XrestListResponse<RawConnectposProduct>>(
      'product',
      this.listParams(params),
    )
    const items = res.items ?? (res.data as RawConnectposProduct[] | undefined) ?? []
    return items.map(transformProduct)
  }

  async getProduct(credentials: Credentials, id: string): Promise<Product> {
    const res = await this.client(credentials).get<XrestListResponse<RawConnectposProduct>>(
      'product',
      { 'searchCriteria[filter_groups][0][filters][0][field]': 'entity_id',
        'searchCriteria[filter_groups][0][filters][0][value]': id,
        'searchCriteria[filter_groups][0][filters][0][condition_type]': 'eq',
        'searchCriteria[pageSize]': 1 },
    )
    const items = res.items ?? (res.data as RawConnectposProduct[] | undefined) ?? []
    if (items.length === 0) throw new Error(`connectpos product ${id} not found`)
    return transformProduct(items[0]!)
  }

  // ── StockLevels ────────────────────────────────────────────────────────────

  async listStockLevels(credentials: Credentials, params: QueryParams): Promise<StockLevel[]> {
    const res = await this.client(credentials).get<XrestListResponse<RawConnectposStockLevel>>(
      'warehouse-item',
      this.listParams(params),
    )
    const items = res.items ?? (res.data as RawConnectposStockLevel[] | undefined) ?? []
    return items.map(transformStockLevel)
  }

  async getStockLevel(_credentials: Credentials, id: string): Promise<StockLevel> {
    throw new Error(`connectpos stock-level fetch is bulk-only; call listStockLevels. id=${id}`)
  }

  // ── Locations (Outlets) ────────────────────────────────────────────────────

  async listLocations(credentials: Credentials, params: QueryParams): Promise<Location[]> {
    const res = await this.client(credentials).get<XrestListResponse<RawConnectposOutlet>>(
      'outlet',
      this.listParams(params),
    )
    const items = res.items ?? (res.data as RawConnectposOutlet[] | undefined) ?? []
    return items.map(transformLocation)
  }

  async getLocation(credentials: Credentials, id: string): Promise<Location> {
    const res = await this.client(credentials).get<XrestListResponse<RawConnectposOutlet>>(
      'outlet',
      { 'searchCriteria[filter_groups][0][filters][0][field]': 'id',
        'searchCriteria[filter_groups][0][filters][0][value]': id,
        'searchCriteria[filter_groups][0][filters][0][condition_type]': 'eq',
        'searchCriteria[pageSize]': 1 },
    )
    const items = res.items ?? (res.data as RawConnectposOutlet[] | undefined) ?? []
    if (items.length === 0) throw new Error(`connectpos outlet ${id} not found`)
    return transformLocation(items[0]!)
  }
}
