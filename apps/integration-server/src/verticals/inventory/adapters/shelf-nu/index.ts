/**
 * Shelf.nu adapter — open-source physical asset management platform.
 *
 * Shelf tracks serialised physical items (assets) with locations, custody,
 * categories, and audit trails. It does NOT expose suppliers, purchase orders,
 * stock transfers, or stock adjustments via its REST API — those methods are
 * intentionally omitted.
 *
 * Auth: Supabase JWT sent as Authorization: Bearer <token>.
 *       Organisation ID is required as credentials.extra.organizationId.
 * Base URL: https://app.shelf.nu
 * Pagination: page (1-based) + perPage (max 50 for assets, 100 for locations).
 *
 * Supported resources: products (assets), stock-levels, locations.
 *
 * ── Resource coverage ──────────────────────────────────────────────
 * Unavailable: supplier       — no supplier concept; Shelf is an asset tracker, not a procurement system
 * Unavailable: purchase-order — no purchase-order concept; platform tracks custody/location, not procurement
 * Unavailable: stock-transfer — no transfer document resource; location changes are per-asset updates only
 * Unavailable: stock-adjustment — no quantity adjustment documents; each asset is a serialised unit (qty=1)
 */
import { pageOffset, reportUpstreamPage } from '@opensteward/shared'
import type { CredentialField, Credentials, QueryParams } from '@opensteward/shared'
import type { InventoryAdapter } from '../../adapter/interface'
import type { Product } from '../../schema/product'
import type { StockLevel } from '../../schema/stock-level'
import type { Location } from '../../schema/location'

import {
  credentialFields as shelfCredentialFields,
  exchangeCredentials as shelfExchangeCredentials,
  getAuthUrlUnsupported,
} from './auth'
import {ShelfNuClient} from './client'
import {ASSETS_MAX_PAGE_SIZE, LOCATIONS_MAX_PAGE_SIZE} from './constants'

import {transformProduct, type RawShelfNuAsset} from './transform/product'
import {transformStockLevel, type RawShelfNuAssetForStock} from './transform/stock-level'
import {transformLocation, type RawShelfNuLocation} from './transform/location'

// ── Response envelope shapes from Shelf mobile API ─────────────────────────

/** What both paged list routes say about the page they served. */
interface PageFields {
  page?: number
  perPage?: number
  totalCount?: number
  totalPages?: number
}

interface AssetsResponse extends PageFields {
  assets: RawShelfNuAsset[]
  /** `Math.ceil(totalCount / perPage)`: 0 when nothing matches. */
  totalPages?: number
}

/**
 * The paging fields arrived upstream on 2026-07-22 (Shelf commit 290d166c).
 * Before that the route ignored page and perPage and answered one `take: 50`
 * list as `{ locations }` alone. The fields therefore stay optional, and a
 * response without them is the whole list that route will ever serve:
 * listLocations pages it locally and getLocation stops after it.
 */
interface LocationsResponse extends PageFields {
  locations: RawShelfNuLocation[]
  /** `Math.max(1, Math.ceil(totalCount / perPage))`. */
  totalPages?: number
}

/**
 * Report the end of a page one of the paged list routes served: its total, its
 * page count and whether pages remain past it. Both routes echo the page they
 * served, and `page < totalPages` reads the assets route's 0 for an empty
 * result as correctly as the locations route's minimum of 1. Returns false,
 * reporting nothing, for a response that carries no totalPages.
 */
function reportEnd(params: QueryParams, res: PageFields, page: number): boolean {
  if (typeof res.totalPages !== 'number') return false
  reportUpstreamPage(params, {
    ...(typeof res.totalCount === 'number' ? { totalCount: res.totalCount } : {}),
    totalPages: res.totalPages,
    hasMore: (res.page ?? page) < res.totalPages,
  })
  return true
}

/**
 * The caller's search term without its surrounding whitespace, or undefined
 * when that leaves nothing. The router treats a term that trims to nothing as
 * no filter (assertSearchSupported), and so does this: Shelf applies `search`
 * as given, so `" "` would return only the names that contain a space.
 */
function searchTerm(params: QueryParams): string | undefined {
  const term = typeof params.search === 'string' ? params.search.trim() : ''
  return term === '' ? undefined : term
}

interface AssetDetailResponse {
  asset: RawShelfNuAsset
}

// ── Config (no OAuth; credentials are provided directly) ───────────────────

export interface ShelfNuAdapterConfig {
  /** Reserved for future use; currently unused. */
  instanceUrl?: string
}

// ── Adapter ─────────────────────────────────────────────────────────────────

export class ShelfNuAdapter implements InventoryAdapter {
  readonly platform = 'shelf-nu'
  readonly version = '0.1.0'
  /** Honours `params.search`; see AdapterCapabilities. Declared so the
   *  router can refuse the parameter on adapters that would drop it. */
  readonly capabilities = { search: true }

  constructor(_config?: ShelfNuAdapterConfig) {}

  credentialFields(): CredentialField[] {
    return shelfCredentialFields()
  }

  async exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
    return shelfExchangeCredentials(fields)
  }

  getAuthUrl(_state: string, _scopes?: string[]): string {
    return getAuthUrlUnsupported()
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    throw new Error('shelf-nu uses Supabase JWT; use credentialFields() instead')
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    // JWTs are managed by the caller (Supabase SDK handles refresh).
    return credentials
  }

  // ── Webhook — not supported (no documented HMAC signing) ─────────────────

  verifyWebhook(_payload: Buffer, _headers: Record<string, string>, _secret: string): boolean {
    return false
  }

  // ── Internal ──────────────────────────────────────────────────────────────

  private client(credentials: Credentials): ShelfNuClient {
    return new ShelfNuClient(credentials)
  }

  /**
   * `max` is the route's own perPage ceiling, and there is no default: each
   * Shelf mobile route clamps perPage to a different one (assets 50, locations
   * 100), and a size the route clamps down makes every full page look short.
   */
  private pageParams(params: QueryParams, max: number): { page: number; perPage: number } {
    const perPage = Math.min(params.limit ?? max, max)
    // Reported so the router and the sync worker judge a full page against the
    // size sent, not the caller's larger limit (which read it as the last
    // page). Not an adapter-wide maxPageSize, which would cap locations at the
    // assets ceiling of 50.
    reportUpstreamPage(params, { pageSize: perPage })
    return {
      page: params.page ?? 1,
      perPage,
    }
  }

  // ── Assets (products and stock levels) ────────────────────────────────────

  // GET /api/mobile/assets pages by page + perPage (default 20, clamped to
  // 1..50), ordered by createdAt desc then id, and answers { assets, page,
  // perPage, totalCount, totalPages }. `search` (the web asset search's
  // fields, first 100 characters) filters before the count.

  private async listAssets(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<RawShelfNuAsset[]> {
    const search = searchTerm(params)
    const paging = this.pageParams(params, ASSETS_MAX_PAGE_SIZE)
    const res = await this.client(credentials).get<AssetsResponse>(
      '/api/mobile/assets',
      search ? { search, ...paging } : paging,
    )
    reportEnd(params, res, paging.page)
    return res.assets ?? []
  }

  // ── Products (assets) ─────────────────────────────────────────────────────

  async listProducts(credentials: Credentials, params: QueryParams): Promise<Product[]> {
    return (await this.listAssets(credentials, params)).map(transformProduct)
  }

  async getProduct(credentials: Credentials, id: string): Promise<Product> {
    const res = await this.client(credentials).get<AssetDetailResponse>(
      `/api/mobile/assets/${encodeURIComponent(id)}`,
    )
    if (!res.asset) throw new Error(`shelf-nu asset ${id} not found`)
    return transformProduct(res.asset)
  }

  // ── Stock levels (synthesised from asset status) ──────────────────────────
  //
  // Shelf tracks each physical item individually. quantityOnHand is always 1.
  // quantityAvailable reflects whether the asset is in AVAILABLE status.

  async listStockLevels(credentials: Credentials, params: QueryParams): Promise<StockLevel[]> {
    return (await this.listAssets(credentials, params)).map((a) =>
      transformStockLevel(a as RawShelfNuAssetForStock),
    )
  }

  async getStockLevel(credentials: Credentials, id: string): Promise<StockLevel> {
    const res = await this.client(credentials).get<AssetDetailResponse>(
      `/api/mobile/assets/${encodeURIComponent(id)}`,
    )
    if (!res.asset) throw new Error(`shelf-nu asset ${id} not found`)
    return transformStockLevel(res.asset as RawShelfNuAssetForStock)
  }

  // ── Locations ─────────────────────────────────────────────────────────────

  // GET /api/mobile/locations pages by page + perPage (default 50, clamped to
  // 1..100), ordered by name, and answers { locations, page, perPage,
  // totalCount, totalPages }. `search` (name contains, case-insensitive)
  // filters before paging, so the counts are the matches'.

  async listLocations(credentials: Credentials, params: QueryParams): Promise<Location[]> {
    const search = searchTerm(params)
    const paging = this.pageParams(params, LOCATIONS_MAX_PAGE_SIZE)
    const res = await this.client(credentials).get<LocationsResponse>(
      '/api/mobile/locations',
      search ? { search, ...paging } : paging,
    )
    const rows = (res.locations ?? []).map(transformLocation)
    if (reportEnd(params, res, paging.page)) return rows
    // The pre-paging route answers the same list of at most 50 whatever page
    // is asked for, so the caller's page is cut from it here, at the perPage
    // already reported as this call's page size. That list is all the route
    // will ever serve, so its end is the end. No total is reported: the route
    // stated none. Nor is `pagedLocally`: the requests page and follow the
    // limit, and the paging-contract gate should keep judging them, since its
    // stub body is this same shape.
    const start = pageOffset(params, paging.perPage)
    reportUpstreamPage(params, { hasMore: start + paging.perPage < rows.length })
    return rows.slice(start, start + paging.perPage)
  }

  async getLocation(credentials: Credentials, id: string): Promise<Location> {
    // Shelf has no single-location GET endpoint: walk the list at its maximum
    // page size until the id turns up or the last page has been read.
    const client = this.client(credentials)
    for (let page = 1, totalPages = 1; page <= totalPages; page++) {
      const res = await client.get<LocationsResponse>('/api/mobile/locations', {
        page,
        perPage: LOCATIONS_MAX_PAGE_SIZE,
      })
      const found = (res.locations ?? []).find((l) => l.id === id)
      if (found) return transformLocation(found)
      // A response without totalPages (the pre-paging route) was the only page.
      totalPages = res.totalPages ?? page
    }
    // Every page has been read, so this is the platform's answer, not a guess.
    throw Object.assign(new Error(`shelf-nu location ${id} not found`), {
      statusCode: 404,
      code: 'NOT_FOUND',
    })
  }
}
