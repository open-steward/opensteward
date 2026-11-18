/**
 * Apicbase adapter — F&B inventory management platform.
 *
 * Apicbase is a food & beverage platform covering ingredient management,
 * outlet (location) inventory, supplier management, and procurement.
 * Auth: OAuth2 Bearer access token (api_key credential field).
 * Pagination: DRF-style { count, next, previous, results[] } with ?page + ?page_size.
 *
 * Supported resources: products (ingredients), stock-levels, locations (outlets),
 *   suppliers, purchase-orders, stock-transfers (transfer events), stock-adjustments
 *   (count events).
 * Webhooks: not implemented (no documented HMAC/JWT signing scheme).
 *
 * Schema-firewall: no product images, no supplier banking, BOM refused.
 */
import type { CredentialField, Credentials, QueryParams } from '@opensteward/shared'
import {
  connectionScope,
  cursorPagerKey,
  pageByRows,
  reportUpstreamPage,
} from '@opensteward/shared'
import type { InventoryAdapter } from '../../adapter/interface'
import type { Product } from '../../schema/product'
import type { StockLevel } from '../../schema/stock-level'
import type { Location } from '../../schema/location'
import type { Supplier } from '../../schema/supplier'
import type { PurchaseOrder } from '../../schema/purchase-order'
import type { StockTransfer } from '../../schema/stock-transfer'
import type { StockAdjustment } from '../../schema/stock-adjustment'

import {
  credentialFields as apicbaseCredentialFields,
  exchangeCredentials as apicbaseExchangeCredentials,
  getAuthUrlUnsupported,
} from './auth'
import { ApicbaseClient } from './client'
import { DEFAULT_PAGE_SIZE, MAX_COUNT_EVENTS_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

import { transformProduct, type RawApicbaseIngredient } from './transform/product'
import { transformStockLevel, type RawApicbaseStockLevel } from './transform/stock-level'
import { transformLocation, type RawApicbaseOutlet } from './transform/location'
import { transformSupplier, type RawApicbaseSupplier } from './transform/supplier'
import { transformPurchaseOrder, type RawApicbasePurchaseOrder } from './transform/purchase-order'
import { transformStockTransfer, type RawApicbaseTransferEvent } from './transform/stock-transfer'
import {
  transformStockAdjustment,
  type RawApicbaseCountedItem,
  type RawApicbaseTopCount,
} from './transform/stock-adjustment'

export interface ApicbaseAdapterConfig {
  clientId?: string
  clientSecret?: string
  redirectUri?: string
  scopes?: string[]
}

/** DRF-style paginated list response. */
interface PagedResponse<T> {
  count?: number
  next?: string | null
  previous?: string | null
  results?: T[]
}

/**
 * A position in a list read outlet by outlet: which outlet, which of its
 * lists (transfers have two), and which page of that list. The outlets
 * themselves come a page of GET /accounts/outlets/ at a time.
 */
interface OutletCursor {
  /** Outlet ids from the current page of GET /accounts/outlets/, or the one filtered outlet. */
  outlets: readonly string[]
  /** Index into `outlets`. Past its end, the next page of outlets is read first. */
  at: number
  /** Index into the lists read for each outlet. */
  list: number
  /** The page of that list. */
  page: number
  /** The page of GET /accounts/outlets/ after `outlets`; absent when there is none. */
  outletsPage?: number
  /** Ids already served before this position, when the list drops repeats. */
  seen?: SeenIds
  /** Whether any per-outlet list read before this position answered. */
  answered?: boolean
  /** The first 403 a per-outlet list read before this position was refused with. */
  denied?: unknown
}

/**
 * The ids served before a position, one link per upstream page that served
 * any. Carried in the cursor so a page fetched again drops exactly the rows
 * it dropped the first time, whichever call fetches it.
 */
interface SeenIds {
  ids: ReadonlySet<string>
  prev?: SeenIds
}

function seenBefore(chain: SeenIds | undefined, id: string): boolean {
  for (let link = chain; link; link = link.prev) if (link.ids.has(id)) return true
  return false
}

/** The HTTP status a failed request was answered with, if it was answered. */
function statusOf(err: unknown): unknown {
  return (err as { response?: { status?: unknown } } | null)?.response?.status
}

/**
 * The end of a walk over per-outlet lists. A per-outlet list is skipped when
 * it answers 403 (an outlet this token may not read) or 404 (an outlet
 * deleted since it was listed, or a page gone because the list shrank). But
 * when every list the walk read was refused and none answered, the token
 * cannot read the resource at all. Served as an empty list, that would read
 * as a complete, empty collection, so the refusal is thrown.
 *
 * The case this guards is assumed, not documented. The scopes are documented
 * apart: outlets under `accounts` ("Access to user, library, and outlet
 * endpoints.") and stock and transfers under `inventory` ("Access to
 * inventory events and stock data."), so a token with the first and not the
 * second would list outlets and be refused every outlet's lists. The spec
 * documents only a 200 for these endpoints, so a 403 as that refusal, and a
 * 404 for a gone outlet or page, are what Django REST Framework answers, not
 * what Apicbase says it does.
 */
function assertReadable(pos: Pick<OutletCursor, 'answered' | 'denied'>): void {
  if (!pos.answered && pos.denied !== undefined) throw pos.denied
}

/**
 * Upstream pages one call to a per-outlet list may walk (`pageByRows`'s
 * `maxUpstreamPages`; its default is 1,000). Every outlet's list is a page
 * even when empty, so filling one caller page of a sparse list can walk one
 * per list per outlet: 1,000 would fail transfers at 500 outlets. This only
 * stops a chain that never ends.
 */
const MAX_OUTLET_PAGES = 10_000

const TRANSFER_DIRECTIONS = ['incoming', 'outgoing'] as const

const stockPath = (outletId: string) => `/inventory/outlets/${outletId}/stock_items/stock/`
const transferPath = (direction: 'incoming' | 'outgoing') => (outletId: string) =>
  `/inventory/outlets/${outletId}/transfer_events/${direction}/`
/** Top counts (reference/get-top-counts), not the retired `count_events/aggregated/`. */
const topCountsPath = (outletId: string) => `/inventory/outlets/${outletId}/count_events/`
const topCountPath = (outletId: string, topCountId: string) =>
  `/inventory/outlets/${outletId}/count_events/${topCountId}/`

/** A top count as the walk holds it: the row, and the outlet it was listed from. */
interface ListedTopCount {
  count: RawApicbaseTopCount
  outletId: string
}

/**
 * Top counts read at once for their counted items: one request each, and a
 * caller page of up to the router's 500 would otherwise be 500 in a row.
 */
const COUNTED_ITEMS_CONCURRENCY = 5

export class ApicbaseAdapter implements InventoryAdapter {
  readonly platform = 'apicbase'
  readonly version = '0.1.0'

  constructor(_config: ApicbaseAdapterConfig = {}) {}

  credentialFields(): CredentialField[] {
    return apicbaseCredentialFields()
  }

  async exchangeCredentials(fields: Record<string, string>) {
    return apicbaseExchangeCredentials(fields)
  }

  getAuthUrl(_state: string, _scopes?: string[]): string {
    return getAuthUrlUnsupported()
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    throw new Error('apicbase uses a static access token; use credentialFields() instead')
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return credentials
  }

  private client(credentials: Credentials): ApicbaseClient {
    return new ApicbaseClient(credentials)
  }

  /**
   * One caller page of a list Apicbase serves from one endpoint: the
   * documented `page` (1-based) at `page_size` of at most 200
   * (developers.apicbase.com/reference/pagination), ending where the DRF
   * envelope's `next` is null. A limit above 200 is sent as 200 and reported
   * as the page size, so the router, the cache and the sync worker judge a
   * page of 200 as full rather than as the last one. Django REST Framework
   * answers a page past the end with 404 "Invalid page.", which is an empty
   * last page here.
   */
  private async onePage<Raw, Row>(
    credentials: Credentials,
    path: string,
    params: QueryParams,
    toRow: (raw: Raw) => Row,
  ): Promise<Row[]> {
    const size = this.pageSize(params)
    const page = params.page ?? 1
    const clamped = size < this.callerLimit(params) ? { pageSize: size } : {}
    let res: PagedResponse<Raw>
    try {
      res = await this.client(credentials).get<PagedResponse<Raw>>(path, { page, page_size: size })
    } catch (err) {
      if (page > 1 && statusOf(err) === 404) {
        reportUpstreamPage(params, { hasMore: false, ...clamped })
        return []
      }
      throw err
    }
    reportUpstreamPage(params, {
      hasMore: res.next != null,
      ...(typeof res.count === 'number' ? { totalCount: res.count } : {}),
      ...clamped,
    })
    return (res.results ?? []).map(toRow)
  }

  /** The caller's page size: `params.limit`, or the adapter's default. */
  private callerLimit(params: QueryParams): number {
    const asked = Math.floor(Number(params.limit ?? DEFAULT_PAGE_SIZE))
    return Number.isFinite(asked) && asked >= 1 ? asked : DEFAULT_PAGE_SIZE
  }

  /** The `page_size` to send: the caller's limit, at most the documented 200 (or `max`). */
  private pageSize(params: QueryParams, max: number = MAX_PAGE_SIZE): number {
    return Math.min(this.callerLimit(params), max)
  }

  /**
   * One caller page of rows Apicbase lists per outlet: each outlet's `lists`
   * in turn, each read with the documented `page` and `page_size`
   * (developers.apicbase.com/reference/pagination), outlet after outlet.
   * Without `outletId`, the outlets are every page of GET /accounts/outlets/,
   * read 200 at a time as the walk reaches them.
   *
   * One upstream page is not one caller page here: a caller page can end
   * part-way through one outlet's list or span several. `pageByRows` walks
   * the stream and serves exactly rows [(page-1)×limit, page×limit), with
   * `hasMore` exact; the next caller page continues from the upstream page
   * it already holds. Keyed by the connection, the outlet filter and the
   * upstream page size, which follows the caller's limit up to 200 (or the
   * list's own documented `maxPageSize`).
   *
   * With `idOf`, a row whose id was already served earlier in the stream, or
   * that has none, is dropped before rows are counted, so pages stay whole.
   *
   * A per-outlet list answering 403 or 404 is skipped, unless every list the
   * walk read was refused (`assertReadable`); any other error fails the call.
   */
  private async outletRows<Raw, Row>(
    credentials: Credentials,
    params: QueryParams,
    spec: {
      collection: string
      lists: ReadonlyArray<(outletId: string) => string>
      outletId?: string
      toRow: (raw: Raw, outletId: string, list: number) => Row
      idOf?: (row: Row) => string
      /** The list's documented largest `page_size`, when below the general 200. */
      maxPageSize?: number
    },
  ): Promise<Row[]> {
    const client = this.client(credentials)
    const size = this.pageSize(params, spec.maxPageSize)
    const start: OutletCursor = spec.outletId
      ? { outlets: [spec.outletId], at: 0, list: 0, page: 1 }
      : { outlets: [], at: 0, list: 0, page: 1, outletsPage: 1 }
    const key = cursorPagerKey(connectionScope('apicbase', credentials), spec.collection, {
      outletId: spec.outletId,
      page_size: size,
    })
    const { items } = await pageByRows<Row, OutletCursor>(
      key,
      params,
      async (cursor) => {
        let pos = cursor ?? start
        if (pos.at >= pos.outlets.length && pos.outletsPage !== undefined) {
          const res = await client.get<PagedResponse<RawApicbaseOutlet>>('/accounts/outlets/', {
            page: pos.outletsPage,
            page_size: MAX_PAGE_SIZE,
          })
          // Outlets carry `id` (reference/get-outlets); there is no `uid`.
          const outlets = (res.results ?? []).flatMap((o) => (o.id ? [o.id] : []))
          const outletsPage = res.next != null ? pos.outletsPage + 1 : undefined
          pos = { ...pos, outlets, at: 0, list: 0, page: 1, outletsPage }
        }
        if (pos.at >= pos.outlets.length) {
          // A page of outlets with none to read: read the next, or end here.
          if (pos.outletsPage !== undefined) return { items: [], next: pos }
          assertReadable(pos)
          return { items: [] }
        }
        const here = pos
        const outletId = here.outlets[here.at]!
        let res: PagedResponse<Raw> = {}
        let { answered, denied } = here
        try {
          res = await client.get<PagedResponse<Raw>>(spec.lists[here.list]!(outletId), {
            page: here.page,
            page_size: size,
          })
          answered = true
        } catch (err) {
          const status = statusOf(err)
          if (status === 403) denied ??= err
          else if (status !== 404) throw err
        }
        let rows = (res.results ?? []).map((raw) => spec.toRow(raw, outletId, here.list))
        let seen = here.seen
        const idOf = spec.idOf
        if (idOf) {
          const fresh = new Set<string>()
          rows = rows.filter((row) => {
            const id = idOf(row)
            if (!id || fresh.has(id) || seenBefore(here.seen, id)) return false
            fresh.add(id)
            return true
          })
          if (fresh.size > 0) seen = { ids: fresh, prev: here.seen }
        }
        const after = { ...here, seen, answered, denied }
        const next = this.nextOutletPosition(after, res.next != null, spec.lists.length)
        if (next === undefined) assertReadable(after)
        return { items: rows, next }
      },
      { defaultLimit: DEFAULT_PAGE_SIZE, maxUpstreamPages: MAX_OUTLET_PAGES },
    )
    return items
  }

  /**
   * Where the stream continues after the page at `pos`: its next page, list,
   * outlet or page of outlets. What `pos` carries past the page (the ids
   * served, whether any list answered or was refused) carries on unchanged.
   */
  private nextOutletPosition(
    pos: OutletCursor,
    morePages: boolean,
    lists: number,
  ): OutletCursor | undefined {
    if (morePages) return { ...pos, page: pos.page + 1 }
    if (pos.list + 1 < lists) return { ...pos, list: pos.list + 1, page: 1 }
    if (pos.at + 1 < pos.outlets.length) return { ...pos, at: pos.at + 1, list: 0, page: 1 }
    if (pos.outletsPage !== undefined) return { ...pos, outlets: [], at: 0, list: 0, page: 1 }
    return undefined
  }

  // ── Products (Ingredients) ────────────────────────────────────────────────

  async listProducts(credentials: Credentials, params: QueryParams): Promise<Product[]> {
    return this.onePage<RawApicbaseIngredient, Product>(
      credentials,
      '/products/ingredients/',
      params,
      transformProduct,
    )
  }

  async getProduct(credentials: Credentials, id: string): Promise<Product> {
    const raw = await this.client(credentials).get<RawApicbaseIngredient>(
      `/products/ingredients/${id}/`,
    )
    return transformProduct(raw)
  }

  // ── Stock Levels ──────────────────────────────────────────────────────────
  // Apicbase stocks are scoped per outlet. With params.filter.outletId the
  // list is that outlet's; without it, every outlet's in turn.

  async listStockLevels(credentials: Credentials, params: QueryParams): Promise<StockLevel[]> {
    const outletId = (params as QueryParams & { filter?: Record<string, string> }).filter?.[
      'outletId'
    ]
    if (outletId) {
      // One outlet's list is one paginated endpoint.
      return this.onePage<RawApicbaseStockLevel, StockLevel>(
        credentials,
        stockPath(outletId),
        params,
        (r) => transformStockLevel({ ...r, outlet_uid: outletId }),
      )
    }
    // Every outlet: one stream of each outlet's stock pages, cut into the caller's pages.
    return this.outletRows<RawApicbaseStockLevel, StockLevel>(credentials, params, {
      collection: 'stock_items/stock',
      lists: [stockPath],
      toRow: (r, outlet) => transformStockLevel({ ...r, outlet_uid: outlet }),
    })
  }

  async getStockLevel(credentials: Credentials, id: string): Promise<StockLevel> {
    // id format: "{stockItemId}:{outletId}" (productId:locationId per schema convention)
    const sep = id.indexOf(':')
    if (sep < 0)
      throw new Error(`apicbase getStockLevel: id must be "{stockItemId}:{outletId}", got: ${id}`)
    const stockItemId = id.slice(0, sep)
    const outletId = id.slice(sep + 1)
    const raw = await this.client(credentials).get<RawApicbaseStockLevel>(
      `/inventory/outlets/${outletId}/stock_items/${stockItemId}/stock/`,
    )
    return transformStockLevel({ ...raw, outlet_uid: outletId, stock_item_uid: stockItemId })
  }

  // ── Locations (Outlets) ───────────────────────────────────────────────────

  async listLocations(credentials: Credentials, params: QueryParams): Promise<Location[]> {
    return this.onePage<RawApicbaseOutlet, Location>(
      credentials,
      '/accounts/outlets/',
      params,
      transformLocation,
    )
  }

  async getLocation(credentials: Credentials, id: string): Promise<Location> {
    const raw = await this.client(credentials).get<RawApicbaseOutlet>(`/accounts/outlets/${id}/`)
    return transformLocation(raw)
  }

  // ── Suppliers ─────────────────────────────────────────────────────────────

  async listSuppliers(credentials: Credentials, params: QueryParams): Promise<Supplier[]> {
    return this.onePage<RawApicbaseSupplier, Supplier>(
      credentials,
      '/suppliers/',
      params,
      transformSupplier,
    )
  }

  async getSupplier(credentials: Credentials, id: string): Promise<Supplier> {
    const raw = await this.client(credentials).get<RawApicbaseSupplier>(`/suppliers/${id}/`)
    return transformSupplier(raw)
  }

  // ── Purchase Orders ───────────────────────────────────────────────────────

  async listPurchaseOrders(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<PurchaseOrder[]> {
    return this.onePage<RawApicbasePurchaseOrder, PurchaseOrder>(
      credentials,
      '/procurement/purchase_orders/',
      params,
      transformPurchaseOrder,
    )
  }

  async getPurchaseOrder(credentials: Credentials, id: string): Promise<PurchaseOrder> {
    const raw = await this.client(credentials).get<RawApicbasePurchaseOrder>(
      `/procurement/purchase_orders/${id}/`,
    )
    return transformPurchaseOrder(raw)
  }

  // ── Stock Transfers (Transfer Events) ────────────────────────────────────
  // Apicbase exposes transfers per outlet, split into incoming and outgoing
  // directions. We list both directions of every outlet (or of the one
  // outlet params.filter.outletId names) as one stream, and serve a transfer
  // seen at two outlets once, where it first appears.

  async listStockTransfers(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<StockTransfer[]> {
    const outletId = (params as QueryParams & { filter?: Record<string, string> }).filter?.[
      'outletId'
    ]
    return this.outletRows<RawApicbaseTransferEvent, StockTransfer>(credentials, params, {
      collection: 'transfer_events',
      lists: TRANSFER_DIRECTIONS.map(transferPath),
      outletId,
      // Rows name only the other outlet (origin_outlet / destination_outlet),
      // so the outlet they were listed from is supplied here.
      toRow: (r, outlet, list) =>
        transformStockTransfer({ ...r, outlet: r.outlet ?? outlet }, TRANSFER_DIRECTIONS[list]!),
      idOf: (t) => t.id,
    })
  }

  async getStockTransfer(credentials: Credentials, id: string): Promise<StockTransfer> {
    // id format: "{transferEventId}:{outletId}:{direction}"
    const parts = id.split(':')
    if (parts.length < 3) {
      throw new Error(
        `apicbase getStockTransfer: id must be "{eventId}:{outletId}:{direction}", got: ${id}`,
      )
    }
    const [eventId, outletId, direction] = parts as [string, string, 'incoming' | 'outgoing']
    const raw = await this.client(credentials).get<RawApicbaseTransferEvent>(
      `/inventory/outlets/${outletId}/transfer_events/${direction}/${eventId}/`,
    )
    return transformStockTransfer(raw, direction)
  }

  // ── Stock Adjustments (Count Events) ─────────────────────────────────────
  // Apicbase models inventory adjustments as count events (top counts).
  // Each top count is outlet-scoped; we iterate all outlets when no filter
  // is provided.

  async listStockAdjustments(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<StockAdjustment[]> {
    const outletId = (params as QueryParams & { filter?: Record<string, string> }).filter?.[
      'outletId'
    ]
    // GET …/count_events/ caps page_size at 100: "Defaults to 10, capped at 100."
    const listed = await this.outletRows<RawApicbaseTopCount, ListedTopCount>(credentials, params, {
      collection: 'count_events',
      lists: [topCountsPath],
      outletId,
      maxPageSize: MAX_COUNT_EVENTS_PAGE_SIZE,
      toRow: (count, outlet) => ({ count, outletId: outlet }),
    })
    // "The response no longer embeds a `counted_items` array. Fetch the
    // counted stock items per count from Get Stock Items In A Top Count
    // instead." Only the rows served are expanded.
    const client = this.client(credentials)
    const out: StockAdjustment[] = []
    for (let i = 0; i < listed.length; i += COUNTED_ITEMS_CONCURRENCY) {
      const batch = listed.slice(i, i + COUNTED_ITEMS_CONCURRENCY)
      out.push(
        ...(await Promise.all(
          batch.map(async ({ count, outletId: outlet }) => {
            if (!count.id) throw new Error(`apicbase top count at outlet ${outlet} has no id`)
            return transformStockAdjustment(
              count,
              outlet,
              await this.countedItems(client, outlet, count.id),
            )
          }),
        )),
      )
    }
    return out
  }

  async getStockAdjustment(credentials: Credentials, id: string): Promise<StockAdjustment> {
    // id format: "{topCountId}:{outletId}", as listStockAdjustments emits it
    const sep = id.indexOf(':')
    if (sep < 1 || sep === id.length - 1) {
      throw new Error(
        `apicbase getStockAdjustment: id must be "{topCountId}:{outletId}", got: ${id}`,
      )
    }
    const topCountId = id.slice(0, sep)
    const outletId = id.slice(sep + 1)
    const client = this.client(credentials)
    const raw = await client.get<RawApicbaseTopCount>(topCountPath(outletId, topCountId))
    return transformStockAdjustment(
      raw,
      outletId,
      await this.countedItems(client, outletId, topCountId),
    )
  }

  /**
   * The stock items counted in a top count: GET
   * …/count_events/{top_count_id}/stocks/ (reference/get-stock-items-in-a-top-count),
   * documented as a plain array with no paging parameters.
   */
  private async countedItems(
    client: ApicbaseClient,
    outletId: string,
    topCountId: string,
  ): Promise<RawApicbaseCountedItem[]> {
    const items = await client.get<RawApicbaseCountedItem[]>(
      `${topCountPath(outletId, topCountId)}stocks/`,
    )
    if (!Array.isArray(items)) {
      throw new Error(`apicbase top count ${topCountId}: counted items are not a list`)
    }
    return items
  }
}
