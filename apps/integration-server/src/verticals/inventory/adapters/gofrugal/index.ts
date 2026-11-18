/**
 * GoFrugal RetailEasy inventory adapter.
 *
 * GoFrugal is an on-premises retail POS / ERP platform widely used in India.
 * Auth: static API key via X-Auth-Token header.
 * Base URL: customer-supplied (e.g. http://10.0.0.5:8482/WebReporter).
 *
 * Supported resources (documented public API):
 *   - Products     → GET /api/v1/items
 *   - StockLevels  → derived from /api/v1/items (embedded stock per location)
 *   - Locations    → derived from /api/v1/items (unique locationIds)
 *
 * NOT supported (no public endpoint documented):
 *   - Suppliers, PurchaseOrders, StockTransfers, StockAdjustments
 *
 * Webhooks: GoFrugal does not document a webhook signing mechanism;
 *   verifyWebhook always returns false.
 */
import type { CredentialField, Credentials, QueryParams, UpstreamPageMeta } from '@opensteward/shared'
import { pageLocally, reportUpstreamPage } from '@opensteward/shared'
import type { InventoryAdapter } from '../../adapter/interface'
import type { Product } from '../../schema/product'
import type { StockLevel } from '../../schema/stock-level'
import type { Location } from '../../schema/location'

import {
  credentialFields as gofrugalCredentialFields,
  exchangeCredentials as gofrugalExchangeCredentials,
  getAuthUrlUnsupported,
} from './auth'
import {GofrugalClient} from './client'
import {DEFAULT_PAGE_SIZE, ITEMS_WALK_PAGE_SIZE, MAX_ITEMS_WALK_PAGES} from './constants'

import {transformProduct, type RawGofrugalProduct} from './transform/product'
import {expandStockLevels, transformStockLevel} from './transform/stock-level'
import {transformLocation, type RawGofrugalLocation} from './transform/location'

export interface GofrugalAdapterConfig {
  /** No OAuth config needed — GoFrugal uses static API key auth. */
  _unused?: never
}

/**
 * GET /api/v1/items. GoFrugal's two KB articles for this endpoint disagree:
 *
 *   - ServeEasy (.../e-commerce-integration/articles/api-for-list-all-items)
 *     shows a paged envelope next to `items`: "count": 2, "total_records": 2,
 *     "current_page": 1, "per_page": 50, "total_pages": 1.
 *   - RetailEasy (.../api-integration/articles/list-all-items, the one this
 *     adapter's docs_url names) says "Purpose: Used to list all the items",
 *     lists no parameters, and its sample is a bare `{ items }`.
 *
 * So every envelope field is optional, read only when it is a whole number,
 * and the adapter checks each response against what it asked for rather than
 * trusting either article.
 */
interface GofrugalItemsResponse {
  items?: RawGofrugalProduct[]
  count?: number
  total_records?: number
  current_page?: number
  per_page?: number
  total_pages?: number
}

/** The envelope fields of one /items response that are usable whole numbers. */
interface ItemsEnvelope {
  totalRecords?: number
  totalPages?: number
  currentPage?: number
  /**
   * The size of the server's pages. The ServeEasy sample's total_pages is
   * ceil(total_records / per_page), so page N is taken to be rows
   * ((N-1) * per_page, N * per_page]. That stride is an assumption: GoFrugal
   * documents no clamp for /items, nor what one would do to the offset.
   */
  perPage?: number
}

/** A whole number ≥ `min`, or undefined. */
function wholeNumber(value: unknown, min: number): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) && value >= min ? value : undefined
}

function envelopeOf(res: GofrugalItemsResponse): ItemsEnvelope {
  return {
    totalRecords: wholeNumber(res.total_records, 0),
    totalPages: wholeNumber(res.total_pages, 0),
    currentPage: wholeNumber(res.current_page, 1),
    perPage: wholeNumber(res.per_page, 1),
  }
}

/** No usable envelope field at all: the RetailEasy article's bare `{ items }`. */
function isBare(env: ItemsEnvelope): boolean {
  return Object.values(env).every((v) => v === undefined)
}

/**
 * Whether an enveloped response is the page asked for: the server's pages are
 * no larger than the limit, it served no more than a page of them, and it
 * echoed the page asked for (when it echoes one). Anything else is a server
 * that ignored `limit` or `page`.
 */
function servedAsAsked(env: ItemsEnvelope, served: number, page: number, limit: number): boolean {
  const perPage = env.perPage ?? limit
  return perPage <= limit && served <= perPage && (env.currentPage ?? page) === page
}

/**
 * What an envelope says about the page asked for, for `reportUpstreamPage`:
 * only the fields the response carries. per_page below the limit is a server
 * clamp, reported as `pageSize` so a full page of that size does not read as
 * the last one.
 */
function itemsPageMeta(env: ItemsEnvelope, page: number, limit: number): UpstreamPageMeta {
  const meta: UpstreamPageMeta = {}
  if (env.totalRecords !== undefined) meta.totalCount = env.totalRecords
  if (env.totalPages !== undefined) {
    meta.totalPages = env.totalPages
    meta.hasMore = page < env.totalPages
  }
  if (env.currentPage !== undefined) meta.currentPage = env.currentPage
  if (env.perPage !== undefined && env.perPage < limit) meta.pageSize = env.perPage
  return meta
}

/** One /items row is one (item, location) pair. */
function rowKey(row: RawGofrugalProduct): string {
  return `${String(row.itemId)}\u0000${String(row.locationId)}`
}

/** The same rows in the same order: what a server that ignores `page` sends for every page. */
function sameRows(a: readonly RawGofrugalProduct[], b: readonly RawGofrugalProduct[]): boolean {
  return a.length === b.length && a.every((row, i) => rowKey(row) === rowKey(b[i]!))
}

export class GofrugalAdapter implements InventoryAdapter {
  readonly platform = 'gofrugal'
  readonly version = '0.1.0'

  constructor(_config?: GofrugalAdapterConfig) {}

  credentialFields(): CredentialField[] {
    return gofrugalCredentialFields()
  }

  async exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
    return gofrugalExchangeCredentials(fields)
  }

  getAuthUrl(_state: string, _scopes?: string[]): string {
    return getAuthUrlUnsupported()
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    throw new Error('gofrugal uses a static API key; use credentialFields() instead')
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    // Static API keys do not expire.
    return credentials
  }

  verifyWebhook(_payload: Buffer, _headers: Record<string, string>, _secret: string): boolean {
    // GoFrugal does not document a webhook signing mechanism.
    return false
  }

  private client(credentials: Credentials): GofrugalClient {
    return new GofrugalClient(credentials)
  }

  // ── Products ──────────────────────────────────────────────────────────────

  /**
   * One caller page of /items: `page` and `limit` forwarded as documented
   * for this API ("WebReporter/api/v1/salesOrders?page=2&limit=50" fetches
   * records 51-100), and the envelope reported.
   *
   * A response that is not the page asked for is never passed off as one:
   *   - enveloped, but the server ignored `limit` or `page`: the caller's page
   *     is cut from a walk of the whole master;
   *   - bare, with more rows than asked for: the server ignored `limit`, and a
   *     bare response is the whole master (RetailEasy: "Used to list all the
   *     items"), so the caller's page is cut from it;
   *   - bare, past page 1: only page 1 tells a server that pages without an
   *     envelope from one that answers every page with the whole master, so
   *     page 1 is asked for too.
   */
  private async itemsPage(credentials: Credentials, params: QueryParams): Promise<RawGofrugalProduct[]> {
    const page = params.page ?? 1
    const limit = params.limit ?? DEFAULT_PAGE_SIZE
    const client = this.client(credentials)
    const res = await client.get<GofrugalItemsResponse>('/items', { page, limit })
    const items = res.items ?? []
    const env = envelopeOf(res)
    if (isBare(env)) {
      if (items.length > limit) return pageLocally(items, params)
      if (page > 1 && items.length > 0) {
        const first = await client.get<GofrugalItemsResponse>('/items', { page: 1, limit })
        if (sameRows(first.items ?? [], items)) return pageLocally(items, params)
      }
      // Nothing to report: the router judges the end by a short page.
      return items
    }
    if (!servedAsAsked(env, items.length, page, limit)) {
      return pageLocally(await this.allItems(credentials), params)
    }
    reportUpstreamPage(params, itemsPageMeta(env, page, limit))
    return items
  }

  /**
   * Every /items row, a page at a time: pages 1, 2, … at ITEMS_WALK_PAGE_SIZE.
   *
   * The walk ends on the envelope's total_pages, on an empty page, or on a
   * page that repeats the one before: a server that ignores `page` has already
   * served all it will, and one whose envelope counts rows it never served
   * fails loudly. A bare page of more rows than asked for is the whole master.
   * It never ends on a short page alone: without an envelope, a server that
   * serves fewer rows than asked would read as finished after one page.
   * A server that never ends it fails loudly at MAX_ITEMS_WALK_PAGES.
   */
  private async *itemPages(credentials: Credentials): AsyncGenerator<RawGofrugalProduct[]> {
    const client = this.client(credentials)
    let previous: RawGofrugalProduct[] = []
    let served = 0
    for (let page = 1; page <= MAX_ITEMS_WALK_PAGES; page++) {
      const res = await client.get<GofrugalItemsResponse>('/items', { page, limit: ITEMS_WALK_PAGE_SIZE })
      const items = res.items ?? []
      const env = envelopeOf(res)
      if (items.length === 0) return
      if (sameRows(items, previous)) {
        if (env.totalRecords !== undefined && served < env.totalRecords) {
          throw new Error(
            `gofrugal: /items answered page ${page} with page ${page - 1}'s rows, so only ` +
              `${served} of the ${env.totalRecords} rows it reports can be read`,
          )
        }
        return
      }
      yield items
      served += items.length
      const last = isBare(env)
        ? items.length > ITEMS_WALK_PAGE_SIZE // the whole master
        : page >= (env.totalPages ?? Infinity)
      if (last) return
      previous = items
    }
    throw new Error(`gofrugal: /items ran to more than ${MAX_ITEMS_WALK_PAGES} pages without ending`)
  }

  private async allItems(credentials: Credentials): Promise<RawGofrugalProduct[]> {
    const all: RawGofrugalProduct[] = []
    for await (const items of this.itemPages(credentials)) all.push(...items)
    return all
  }

  /**
   * The first /items row `pick` accepts, mapped by it, walking only as far as
   * that row. No lookup by id is documented for /items.
   */
  private async findInItems<T>(
    credentials: Credentials,
    pick: (row: RawGofrugalProduct) => T | undefined,
  ): Promise<T | undefined> {
    for await (const items of this.itemPages(credentials)) {
      for (const row of items) {
        const hit = pick(row)
        if (hit !== undefined) return hit
      }
    }
    return undefined
  }

  async listProducts(credentials: Credentials, params: QueryParams): Promise<Product[]> {
    return (await this.itemsPage(credentials, params)).map(transformProduct)
  }

  async getProduct(credentials: Credentials, id: string): Promise<Product> {
    const found = await this.findInItems(credentials, (i) =>
      String(i.itemId) === id ? transformProduct(i) : undefined,
    )
    if (!found) throw new Error(`gofrugal: product ${id} not found`)
    return found
  }

  // ── StockLevels ──────────────────────────────────────────────────────────

  async listStockLevels(credentials: Credentials, params: QueryParams): Promise<StockLevel[]> {
    // One /items row is one (item, location) pair and expands to exactly one
    // stock level, so a page of rows is a page of stock levels.
    const items = await this.itemsPage(credentials, params)
    return items.flatMap(expandStockLevels).map(transformStockLevel)
  }

  async getStockLevel(credentials: Credentials, id: string): Promise<StockLevel> {
    // id is expected to be in "productId:locationId" composite format.
    const match = await this.findInItems(credentials, (i) =>
      expandStockLevels(i).find((f) => `${f.itemId}:${f.locationId}` === id),
    )
    if (!match) throw new Error(`gofrugal: stock level ${id} not found`)
    return transformStockLevel(match)
  }

  // ── Locations ─────────────────────────────────────────────────────────────

  async listLocations(credentials: Credentials, params: QueryParams): Promise<Location[]> {
    // No locations endpoint is documented: locations are the distinct
    // locationIds across EVERY item row, so a page of them is not a page of
    // /items. Walk the whole item master, dedupe, then slice.
    const items = await this.allItems(credentials)
    const seen = new Map<string, RawGofrugalLocation>()
    for (const item of items) {
      if (item.locationId == null) continue
      const lid = String(item.locationId)
      if (!seen.has(lid)) seen.set(lid, { locationId: item.locationId })
    }
    return pageLocally(Array.from(seen.values()).map(transformLocation), params)
  }

  async getLocation(credentials: Credentials, id: string): Promise<Location> {
    // The first row at the location, as listLocations keeps it.
    const found = await this.findInItems(credentials, (i) =>
      i.locationId != null && String(i.locationId) === id
        ? transformLocation({ locationId: i.locationId })
        : undefined,
    )
    if (!found) throw new Error(`gofrugal: location ${id} not found`)
    return found
  }
}
