/**
 * MarketMan adapter — inventory vertical.
 *
 * MarketMan is a restaurant-focused inventory management platform.
 * Auth: API-key + API-password → POST /buyers/auth/GetToken → AUTH_TOKEN header.
 * Token is short-lived; refreshCredentials() re-acquires it automatically.
 *
 * Supported resources:
 *   - Products    (GetInventoryItems → Items)
 *   - StockLevels (GetInventoryCounts → InventoryCounts[].Lines)
 *   - Suppliers   (GetVendors → Vendors)
 *   - PurchaseOrders (GetOrdersBySentDate → Orders)
 *   - StockTransfers (GetTransfers → Transfers)
 *   - StockAdjustments (mapped from GetInventoryCounts → cycle counts)
 *   - Locations   (derived from item.StorageIDs / item.StorageNames — no dedicated endpoint)
 *
 * Not supported (no documented API):
 *   - Webhooks (removed; no signature spec published)
 *
 * Paging. Only GetInventoryItems pages (`Skip`/`Take`, at most 500 a time), so
 * products forward the caller's page and locations walk every item page. The
 * other lists read endpoints that take no paging input (a date window, or
 * nothing), and slice the whole response into the caller's pages. Errors
 * arrive as HTTP 200 with `IsSuccess: false`; the client throws on them.
 * Docs quoted below are from
 * https://api-doc.marketman.com/api/collections/10610779/T1LPET6f?segregateAuth=true&versionTag=latest
 */
import {
  DEFAULT_PAGE_LIMIT,
  pageLocally,
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
import type { Supplier } from '../../schema/supplier'
import type { PurchaseOrder } from '../../schema/purchase-order'
import type { StockTransfer } from '../../schema/stock-transfer'
import type { StockAdjustment } from '../../schema/stock-adjustment'

import {
  credentialFields as marketmanCredentialFields,
  exchangeCredentials as marketmanExchangeCredentials,
  acquireToken,
  getAuthUrlUnsupported,
} from './auth'
import {MarketmanClient} from './client'

import {transformProduct, type RawMarketmanProduct} from './transform/product'
import {transformStockLevel, type RawMarketmanStockLevelLine} from './transform/stock-level'
import {transformLocation, type RawMarketmanLocation} from './transform/location'
import {transformSupplier, type RawMarketmanSupplier} from './transform/supplier'
import {transformPurchaseOrder, type RawMarketmanPurchaseOrder} from './transform/purchase-order'
import {transformStockTransfer, type RawMarketmanStockTransfer} from './transform/stock-transfer'
import {transformStockAdjustment, type RawMarketmanStockAdjustment} from './transform/stock-adjustment'

// ── Response envelope types ──────────────────────────────────────────────────

interface ItemsResponse {
  Items?: RawMarketmanProduct[]
  /**
   * The request's Skip/Take echoed back. No output table documents `Page`.
   * `Total` is null in the GetInventoryItems example, and its one numeric
   * example (GetPreps, which also documents Skip/Take: `Total: 98` for 98
   * rows, sent without Skip/Take) cannot tell the collection's size from
   * this response's row count. So it may confirm that more rows follow, never that none do.
   */
  Page?: { Skip?: number | null; Take?: number | null; Total?: number | null } | null
}
interface VendorsResponse { Vendors?: RawMarketmanSupplier[] }
interface OrdersResponse { Orders?: RawMarketmanPurchaseOrder[] }
interface TransfersResponse { Transfers?: RawMarketmanStockTransfer[] }

interface InventoryCountLine extends RawMarketmanStockLevelLine {
  CountID?: string
  CountDateUTC?: string | null
  BuyerGuid?: string
}

interface InventoryCountRecord {
  ID?: string | null
  BuyerName?: string | null
  BuyerGuid?: string | null
  CountDateUTC?: string | null
  PriceTotalWithoutVAT?: number | null
  Commments?: string | null
  Lines?: RawMarketmanStockAdjustment['Lines']
  [key: string]: unknown
}

interface InventoryCountsResponse { InventoryCounts?: InventoryCountRecord[] }

// ── Date-range helpers ────────────────────────────────────────────────────────

/** Default lookback window for time-scoped endpoints (90 days). */
const DEFAULT_LOOKBACK_DAYS = 90

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * The window every date-scoped list reads: from 00:00 UTC 90 days before
 * today up to 00:00 UTC tomorrow, in the documented "yyyy/mm/dd hh:mm:ss".
 *
 * These lists page locally over this window and report it as the whole
 * collection, so it must hold still between one caller page and the next
 * (day boundaries only, never "now": `fmt` prints the UTC date at 00:00:00)
 * and must not leave out today's rows: ending at today's 00:00 did, while
 * calling the window complete.
 */
function defaultDateRange(): { DateTimeFromUTC: string; DateTimeToUTC: string } {
  const now = Date.now()
  const fmt = (t: number) => {
    const d = new Date(t)
    return `${d.getUTCFullYear()}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${String(d.getUTCDate()).padStart(2, '0')} 00:00:00`
  }
  return {
    DateTimeFromUTC: fmt(now - DEFAULT_LOOKBACK_DAYS * DAY_MS),
    DateTimeToUTC: fmt(now + DAY_MS),
  }
}

// ── Paging ────────────────────────────────────────────────────────────────────

const ITEMS_PATH = '/buyers/inventory/GetInventoryItems'
const COUNTS_PATH = '/buyers/inventory/GetInventoryCounts'
/** Documented as POST https://api.marketman.com/v3/buyers/items/GetVendors. */
const VENDORS_PATH = '/buyers/items/GetVendors'

/**
 * GetInventoryItems `Take`: "Optional. Will only request the inserted amount.
 * Maximum of 500 at a time. Used with 'Skip'". Its example response carries
 * `MaxTakeAllowed: 500`. No other endpoint this adapter reads takes a size.
 */
const MAX_TAKE = 500

/**
 * Item pages one locations walk may read before it gives up (50,000 items).
 * MarketMan allows "500 calls per 24 hours" per API consumer, so a walk that
 * does not end is stopped loudly, at a fifth of the day's quota, rather than
 * spending all of it. A buyer past 50,000 items cannot list locations.
 */
const MAX_ITEM_PAGES = 100

/** The Take for a caller's page: its limit, clamped to the documented maximum. */
function itemsTake(params: QueryParams): number {
  const limit = Number(params.limit)
  return Number.isFinite(limit) && limit >= 1
    ? Math.min(Math.floor(limit), MAX_TAKE)
    : DEFAULT_PAGE_LIMIT
}

// ── Adapter config ────────────────────────────────────────────────────────────

export interface MarketmanAdapterConfig {
  /** Intentionally empty — MarketMan adapter requires no build-time config. */
  [key: string]: unknown
}

// ── Adapter class ─────────────────────────────────────────────────────────────

export class MarketmanAdapter implements InventoryAdapter {
  readonly platform = 'marketman'
  readonly version = '0.1.0'
  /**
   * Products page at the size asked for, clamped to Take's 500; every other
   * list (locations, suppliers, stock levels, stock adjustments, purchase
   * orders, transfers) slices what it fetched.
   */
  readonly capabilities = { maxPageSize: MAX_TAKE }

  constructor(_config?: MarketmanAdapterConfig) {}

  credentialFields(): CredentialField[] {
    return marketmanCredentialFields()
  }

  async exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
    return marketmanExchangeCredentials(fields)
  }

  getAuthUrl(_state: string, _scopes?: string[]): string {
    return getAuthUrlUnsupported()
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    throw new Error('marketman uses API key + password; use credentialFields() instead')
  }

  /**
   * Re-acquire a token from MarketMan using the stored apiKey + apiPassword.
   * Falls through to returning existing credentials if secrets are missing
   * (e.g., an already-bare token stored by an older integration).
   */
  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    const apiKey = String(credentials.extra?.['apiKey'] ?? '')
    const apiPassword = String(credentials.extra?.['apiPassword'] ?? '')
    if (!apiKey || !apiPassword) return credentials
    const token = await acquireToken(apiKey, apiPassword)
    return { ...credentials, accessToken: token }
  }

  private client(credentials: Credentials): MarketmanClient {
    return new MarketmanClient(credentials)
  }

  // ── Products ───────────────────────────────────────────────────────────────

  /**
   * One caller page as GetInventoryItems `Skip`/`Take` ("Optional. State the
   * number of items to skip").
   *
   * No has-more flag is documented. A short page is the end. A full page is
   * followed by more when a numeric `Page.Total` exceeds the rows served so
   * far; otherwise (and always with `Total` null, as in the documented
   * example) whether more follow is left unreported, and the next page, empty
   * or short, ends it. `Total` is never reported as the collection's size,
   * nor allowed to end a full page: its meaning is undocumented (see
   * {@link ItemsResponse}).
   */
  async listProducts(credentials: Credentials, params: QueryParams): Promise<Product[]> {
    const take = itemsTake(params)
    const skip = pageOffset(params, take)
    const res = await this.client(credentials).post<ItemsResponse>(ITEMS_PATH, {
      Skip: skip,
      Take: take,
    })
    const rows = res.Items ?? []
    const total = res.Page?.Total
    const hasMore =
      rows.length < take
        ? false
        : typeof total === 'number' && skip + rows.length < total
          ? true
          : undefined
    reportUpstreamPage(params, {
      ...(hasMore === undefined ? {} : { hasMore }),
      // A direct call past the maximum pages at 500, and is judged at 500.
      ...(Number(params.limit) > take ? { pageSize: take } : {}),
    })
    return rows.map(transformProduct)
  }

  /** "ItemIDs: Optional. Can be used to retrieve items by specific IDs." */
  async getProduct(credentials: Credentials, id: string): Promise<Product> {
    const res = await this.client(credentials).post<ItemsResponse>(ITEMS_PATH, { ItemIDs: [id] })
    const item = (res.Items ?? []).find((p) => String(p.ID) === id)
    if (!item) throw new Error(`marketman product ${id} not found`)
    return transformProduct(item)
  }

  /**
   * Every inventory item, read in pages of the documented maximum until a
   * short page. For lists derived from items across pages. `Page.Total` does
   * not end the walk (see {@link ItemsResponse}): an exact multiple of 500
   * items costs one empty read instead.
   */
  private async allItems(client: MarketmanClient): Promise<RawMarketmanProduct[]> {
    const all: RawMarketmanProduct[] = []
    let previousFirst: string | undefined
    for (let n = 0; n < MAX_ITEM_PAGES; n++) {
      const skip = n * MAX_TAKE
      const res = await client.post<ItemsResponse>(ITEMS_PATH, { Skip: skip, Take: MAX_TAKE })
      const rows = res.Items ?? []
      const first = rows[0]?.ID === undefined ? undefined : String(rows[0].ID)
      if (n > 0 && first !== undefined && first === previousFirst) {
        throw new Error(
          `marketman GetInventoryItems answered Skip ${skip} with the page it served for ` +
            `Skip ${skip - MAX_TAKE}; it is ignoring Skip, so the item list cannot be walked`,
        )
      }
      previousFirst = first
      all.push(...rows)
      if (rows.length < MAX_TAKE) return all
    }
    throw new Error(
      `marketman GetInventoryItems did not end within ${MAX_ITEM_PAGES} pages of ${MAX_TAKE} items`,
    )
  }

  // ── Stock levels ───────────────────────────────────────────────────────────

  /**
   * Every inventory count in the default window. GetInventoryCounts ("Gets
   * all inventory counts") takes no paging input. Lines are asked for
   * explicitly: "GetLineDetails: Optional (Default is false) Whether to get
   * the Lines array object.If false, the lines would be null."
   */
  private async inventoryCounts(credentials: Credentials): Promise<InventoryCountRecord[]> {
    const res = await this.client(credentials).post<InventoryCountsResponse>(COUNTS_PATH, {
      ...defaultDateRange(),
      GetLineDetails: true,
    })
    return res.InventoryCounts ?? []
  }

  /** Count lines flattened from the whole window, sliced into the caller's page. */
  async listStockLevels(credentials: Credentials, params: QueryParams): Promise<StockLevel[]> {
    const lines: InventoryCountLine[] = []
    for (const count of await this.inventoryCounts(credentials)) {
      for (const line of count.Lines ?? []) {
        lines.push({
          ...line,
          CountID: pickStr(count.ID),
          CountDateUTC: count.CountDateUTC,
          BuyerGuid: pickStr(count.BuyerGuid),
        })
      }
    }
    return pageLocally(lines, params).map(transformStockLevel)
  }

  async getStockLevel(_credentials: Credentials, id: string): Promise<StockLevel> {
    throw new Error(`marketman stock-level fetch is bulk-only; call listStockLevels. id=${id}`)
  }

  // ── Locations (derived from item storage areas) ────────────────────────────

  /**
   * Storage areas de-duplicated across EVERY item page, then sliced. One item
   * page is not one page of storage areas, and an area repeats on items in
   * different pages, so forwarding Skip/Take here would repeat or drop areas.
   *
   * The docs name an item's storage areas two ways: the Items output table
   * lists `StorageArea1ID`/`StorageArea1Name` and `StorageArea2ID`/
   * `StorageArea2Name`, while the example response carries `StorageIDs`/
   * `StorageNames` arrays. Both are read. The first name seen for an ID wins.
   * An area belongs to the buyer the request was made for; items document no
   * buyer field of their own.
   */
  async listLocations(credentials: Credentials, params: QueryParams): Promise<Location[]> {
    const client = this.client(credentials)
    const items = await this.allItems(client)
    const buyerGuid = client.buyerGuid || undefined
    const seen = new Map<string, RawMarketmanLocation>()
    const add = (id: unknown, name: unknown) => {
      const sid = id === null || id === undefined ? '' : String(id)
      if (sid && !seen.has(sid)) {
        seen.set(sid, { ID: sid, Name: pickStr(name), BuyerGuid: buyerGuid })
      }
    }
    for (const item of items) {
      const ids = item.StorageIDs ?? []
      const names = item.StorageNames ?? []
      for (let i = 0; i < ids.length; i++) add(ids[i], names[i])
      add(item['StorageArea1ID'], item['StorageArea1Name'])
      add(item['StorageArea2ID'], item['StorageArea2Name'])
    }
    return pageLocally(Array.from(seen.values()), params).map(transformLocation)
  }

  async getLocation(credentials: Credentials, id: string): Promise<Location> {
    const all = await this.listLocations(credentials, {})
    const found = all.find((l) => l.id === id)
    if (!found) throw new Error(`marketman location ${id} not found`)
    return found
  }

  // ── Suppliers ──────────────────────────────────────────────────────────────

  /**
   * Every vendor, sliced into the caller's page. GetVendors ("Gets all vendors
   * your account is connected to") documents BuyerGuid as its only input, so
   * no paging input. A vendor is identified by its `Guid` ("Vendor guid");
   * one without it cannot be read back, and is left out before slicing.
   *
   * BuyerGuid ("Buyer's Guid") names the buyer whose vendors are listed; the
   * collection says to "put the buyer GUID that you wish to work on (for
   * working on Buyer API)". A connection without one is refused before any
   * request, rather than asking for an unspecified buyer's vendors.
   */
  async listSuppliers(credentials: Credentials, params: QueryParams): Promise<Supplier[]> {
    const client = this.client(credentials)
    if (!client.buyerGuid) {
      throw Object.assign(
        new Error(
          'MarketMan cannot list vendors without a Buyer GUID: GetVendors takes "BuyerGuid | String | Buyer’s Guid". Reconnect with the buyerGuid credential.',
        ),
        { statusCode: 501, code: 'NOT_SUPPORTED' },
      )
    }
    const res = await client.post<VendorsResponse>(VENDORS_PATH)
    const vendors = (res.Vendors ?? []).filter((v) => pickStr(v.Guid))
    return pageLocally(vendors, params).map(transformSupplier)
  }

  async getSupplier(credentials: Credentials, id: string): Promise<Supplier> {
    const all = await this.listSuppliers(credentials, {})
    const found = all.find((s) => s.id === id)
    if (!found) throw new Error(`marketman vendor ${id} not found`)
    return found
  }

  // ── Purchase orders ────────────────────────────────────────────────────────

  /** "Gets all orders according to sent date range.": no paging input, so sliced. */
  async listPurchaseOrders(credentials: Credentials, params: QueryParams): Promise<PurchaseOrder[]> {
    const res = await this.client(credentials).post<OrdersResponse>(
      '/buyers/orders/GetOrdersBySentDate',
      defaultDateRange(),
    )
    return pageLocally(res.Orders ?? [], params).map(transformPurchaseOrder)
  }

  async getPurchaseOrder(credentials: Credentials, id: string): Promise<PurchaseOrder> {
    const all = await this.listPurchaseOrders(credentials, {})
    const found = all.find((o) => o.id === id)
    if (!found) throw new Error(`marketman purchase order ${id} not found`)
    return found
  }

  // ── Stock transfers ────────────────────────────────────────────────────────

  /** "Gets all transfers.": no paging input, so sliced. */
  async listStockTransfers(credentials: Credentials, params: QueryParams): Promise<StockTransfer[]> {
    const res = await this.client(credentials).post<TransfersResponse>(
      '/buyers/inventory/GetTransfers',
      defaultDateRange(),
    )
    return pageLocally(res.Transfers ?? [], params).map(transformStockTransfer)
  }

  async getStockTransfer(credentials: Credentials, id: string): Promise<StockTransfer> {
    const all = await this.listStockTransfers(credentials, {})
    const found = all.find((t) => t.id === id)
    if (!found) throw new Error(`marketman stock transfer ${id} not found`)
    return found
  }

  // ── Stock adjustments (mapped from inventory counts = cycle counts) ─────────

  /** One adjustment per count in the whole window, sliced into the caller's page. */
  async listStockAdjustments(credentials: Credentials, params: QueryParams): Promise<StockAdjustment[]> {
    return pageLocally(await this.inventoryCounts(credentials), params).map(transformStockAdjustment)
  }

  async getStockAdjustment(credentials: Credentials, id: string): Promise<StockAdjustment> {
    const all = await this.listStockAdjustments(credentials, {})
    const found = all.find((a) => a.id === id)
    if (!found) throw new Error(`marketman stock adjustment ${id} not found`)
    return found
  }
}

// ── Inline helper (pickStr) used inside index.ts for type narrowing ───────────
function pickStr(v: unknown): string | undefined {
  if (typeof v === 'string' && v.length > 0) return v
  if (v == null) return undefined
  return String(v)
}
