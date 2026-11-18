/**
 * SOS Inventory adapter for the OpenSteward inventory vertical.
 *
 * SOS Inventory is a QuickBooks-integrated inventory + order management
 * platform. Auth: OAuth 2.0 authorization-code flow.
 *
 * Supported resources (v2 public API):
 *   - Products    → GET /api/v2/item
 *   - StockLevels → derived from item.{onhand,available,onSO,onPO,reorderPoint}
 *   - Locations   → GET /api/v2/location
 *
 * Not supported (not in v2 public API surface):
 *   suppliers, purchase orders, stock transfers, stock adjustments.
 *
 * Webhooks: SOS Inventory v2 does not document HMAC/JWT webhook signing;
 *   verifyWebhook and parseWebhookEvents are not implemented.
 *
 * Rate limits: 100 calls per connection per 60 s (per Microsoft connector docs).
 *
 * Schema-firewall: no product images, no supplier banking, BOM refused.
 */
import {
  pageOffset,
  reportUpstreamPage,
  type CredentialField,
  type Credentials,
  type QueryParams,
} from '@opensteward/shared'
import type { InventoryAdapter } from '../../adapter/interface'
import type { Product } from '../../schema/product'
import type { StockLevel } from '../../schema/stock-level'
import type { Location } from '../../schema/location'

import {
  credentialFields as sosCredentialFields,
  getAuthUrl as sosGetAuthUrl,
  exchangeCode as sosExchangeCode,
  refreshAccessToken,
} from './auth'
import {SosInventoryClient} from './client'
import {DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, SCOPES} from './constants'

import {transformProduct, type RawSosInventoryItem} from './transform/product'
import {transformStockLevel} from './transform/stock-level'
import {transformLocation, type RawSosInventoryLocation} from './transform/location'

export interface SosInventoryAdapterConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
  scopes?: string[]
}

/** SOS Inventory v2 list-endpoint response envelope */
interface SosListResponse<T> {
  count?: number
  totalCount?: number
  data?: T[]
}

export class SosInventoryAdapter implements InventoryAdapter {
  readonly platform = 'sos-inventory'
  readonly version = '0.1.0'
  /** Every list pages through {@link listOnePage} at up to this size. */
  readonly capabilities = { maxPageSize: MAX_PAGE_SIZE }

  private readonly config: SosInventoryAdapterConfig

  constructor(config: SosInventoryAdapterConfig) {
    this.config = config
  }

  credentialFields(): CredentialField[] {
    return sosCredentialFields()
  }

  async exchangeCredentials(_fields: Record<string, string>): Promise<Credentials> {
    throw new Error('sos-inventory uses OAuth2 authorization-code; use getAuthUrl() + exchangeCode()')
  }

  getAuthUrl(state: string, scopes?: string[]): string {
    return sosGetAuthUrl(
      this.config.clientId,
      this.config.redirectUri,
      state,
      scopes ?? SCOPES,
    )
  }

  async exchangeCode(code: string, redirectUri: string): Promise<Credentials> {
    return sosExchangeCode(code, this.config.clientId, this.config.clientSecret, redirectUri)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    if (!credentials.refreshToken) return credentials
    const clientId = String(credentials.extra?.['clientId'] ?? this.config.clientId)
    const clientSecret = String(credentials.extra?.['clientSecret'] ?? this.config.clientSecret)
    if (!clientId || !clientSecret) return credentials
    return refreshAccessToken(credentials.refreshToken, clientId, clientSecret)
  }

  private client(credentials: Credentials): SosInventoryClient {
    return new SosInventoryClient(credentials)
  }

  /**
   * One caller page of a SOS list endpoint, with the platform's own total
   * reported.
   *
   * Every list endpoint, item and location alike, pages by the same two
   * documented parameters (https://developer.sosinventory.com/apidoc):
   *
   *   start       "This is the row number of the full set of results. [...]
   *               if you are retrieving 200 results at a time, you can set
   *               start=201 to retrieve the next page of results."
   *   maxresults  "The default is 200, the maximum value allowed."
   *
   * So `start` is a 1-based row number: the 0-based offset plus one. The size
   * is clamped to 200 before the offset is computed from it, or a larger
   * limit would be answered with 200 rows while the next page strode past
   * the rest. The envelope's `totalCount` ("The total number of records that
   * match the filters of this query") makes the end exact: the next page
   * starts at row offset + size + 1 whatever this one held, so rows remain
   * exactly when that row is within the total. Without a total there is no
   * verdict to give, and the size asked for is all that is reported.
   */
  private async listOnePage<T>(
    credentials: Credentials,
    path: string,
    params: QueryParams,
    filters: Record<string, unknown> = {},
  ): Promise<T[]> {
    const size = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
    const offset = pageOffset(params, size)
    const res = await this.client(credentials).get<SosListResponse<T>>(path, {
      ...filters,
      start: offset + 1,
      maxresults: size,
    })
    const total = res.totalCount
    reportUpstreamPage(params, {
      pageSize: size,
      ...(typeof total === 'number' ? { totalCount: total, hasMore: offset + size < total } : {}),
    })
    return res.data ?? []
  }

  // ── Products ──────────────────────────────────────────────────────────────

  async listProducts(credentials: Credentials, params: QueryParams): Promise<Product[]> {
    const rows = await this.listOnePage<RawSosInventoryItem>(credentials, '/item', params)
    return rows.map(transformProduct)
  }

  async getProduct(credentials: Credentials, id: string): Promise<Product> {
    const res = await this.client(credentials).get<RawSosInventoryItem | null>(`/item/${id}`)
    if (!res || (res as unknown as SosListResponse<unknown>).data === null) {
      throw new Error(`sos-inventory: item ${id} not found`)
    }
    // Single-record response may come wrapped in a list envelope with one item
    const item =
      'data' in (res as unknown as Record<string, unknown>) &&
      Array.isArray((res as unknown as SosListResponse<RawSosInventoryItem>).data)
        ? ((res as unknown as SosListResponse<RawSosInventoryItem>).data ?? [])[0]
        : (res as unknown as RawSosInventoryItem)
    if (!item) throw new Error(`sos-inventory: item ${id} not found`)
    return transformProduct(item)
  }

  // ── Stock Levels (derived from item.onhand fields) ───────────────────────

  /**
   * Quantities per item: account-wide, or at one location.
   *
   * GET /item's `location` filter "Filters items according to the name of the
   * location" (the docs' example is `location=warehouse`), and it makes the
   * quantities "reflect the totals at this location". The canonical
   * `locationId` is the SOS location id that listLocations emits, so it is
   * resolved to that location's name to filter by, and the rows keep the id.
   */
  async listStockLevels(credentials: Credentials, params: QueryParams): Promise<StockLevel[]> {
    const locationId = (params as QueryParams & { locationId?: string }).locationId
    const filters = locationId ? { location: await this.locationName(credentials, locationId) } : {}
    const rows = await this.listOnePage<RawSosInventoryItem>(credentials, '/item', params, filters)
    return rows.map((item) => transformStockLevel({ ...item, _locationId: locationId }))
  }

  /** The name GET /item's `location` filter takes, for a location id. */
  private async locationName(credentials: Credentials, locationId: string): Promise<string> {
    const { name } = await this.getLocation(credentials, locationId)
    // An empty filter would come back as account-wide totals, labelled as
    // this location's own.
    if (!name) {
      throw new Error(`sos-inventory: location ${locationId} has no name to filter items by`)
    }
    return name
  }

  async getStockLevel(credentials: Credentials, id: string): Promise<StockLevel> {
    // id is a productId: the stock figures are fields of the item itself.
    const itemRes = await this.client(credentials).get<RawSosInventoryItem | SosListResponse<RawSosInventoryItem>>(
      `/item/${id}`,
    )
    const item =
      'data' in (itemRes as Record<string, unknown>) &&
      Array.isArray((itemRes as SosListResponse<RawSosInventoryItem>).data)
        ? ((itemRes as SosListResponse<RawSosInventoryItem>).data ?? [])[0]
        : (itemRes as RawSosInventoryItem)
    if (!item) throw new Error(`sos-inventory: item ${id} not found`)
    return transformStockLevel(item)
  }

  // ── Locations ─────────────────────────────────────────────────────────────

  /**
   * A configuration endpoint, paged like the rest: "You may query for results
   * in the same manner you query for transactions [...] GET
   * /api/v2/:endpoint?start=101&maxresults=100". It used to send only
   * `limit`, which SOS does not document, and no `start`, so every page was
   * page 1.
   */
  async listLocations(credentials: Credentials, params: QueryParams): Promise<Location[]> {
    const rows = await this.listOnePage<RawSosInventoryLocation>(credentials, '/location', params)
    return rows.map(transformLocation)
  }

  async getLocation(credentials: Credentials, id: string): Promise<Location> {
    const res = await this.client(credentials).get<RawSosInventoryLocation | SosListResponse<RawSosInventoryLocation>>(
      `/location/${id}`,
    )
    const loc =
      'data' in (res as Record<string, unknown>) &&
      Array.isArray((res as SosListResponse<RawSosInventoryLocation>).data)
        ? ((res as SosListResponse<RawSosInventoryLocation>).data ?? [])[0]
        : (res as RawSosInventoryLocation)
    if (!loc) throw new Error(`sos-inventory: location ${id} not found`)
    return transformLocation(loc)
  }
}
