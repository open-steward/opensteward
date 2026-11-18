/**
 * ShipBob inventory adapter.
 *
 * ShipBob is a 3PL: the merchant's stock physically sits in ShipBob's
 * fulfilment centres, so "inventory" here means what ShipBob holds and what is
 * inbound to it — not a warehouse the merchant runs.
 *
 * Every path below was read from ShipBob's machine-readable OpenAPI document,
 * fetched 2026-09-18:
 *
 *   https://marketplaceapi.shipbob.com/docs/2026-01.json
 *
 * Until this rewrite the file was a byte-copy of the Cin7 Core reference
 * adapter — its own header still said "Cin7 Core adapter", and it sent
 * the Cin7 Core routes productList, ref/stockonhand and stockAdjustmentList to
 * `api.shipbob.com/1.0`. Every call 404'd.
 *
 * ── Implemented (8) ────────────────────────────────────────────────────────
 *
 *   Products        GET /product                 (+ /product?InventoryId=…; one row per variant)
 *   Stock levels    GET /inventory-level/locations
 *                                                (+ /inventory-level/{inventoryId}/locations)
 *   Locations       GET /fulfillment-center      (list only — see getLocation)
 *   Purchase orders GET /receiving               (+ /receiving/{id})
 *
 * ── Not implemented, because ShipBob has no such endpoint ──────────────────
 *
 *   supplier          ShipBob is the warehouse, not a procurement system.
 *   stock-transfer    No transfer resource; ShipBob moves stock internally.
 *   stock-adjustment  `POST /inventory/history:query` returns a movement FEED,
 *                     not adjustment records. Mapping a feed onto an
 *                     adjustment resource would invent entities.
 *
 * Those three are declared in `metadata.ts` with the same reasons, so the
 * claim is visible in the catalog rather than implied by silence.
 *
 * ── Pagination is not uniform, and that matters ────────────────────────────
 *
 *   /product, /inventory-level/locations
 *                                cursor: `{ first, items, last, next, prev }`,
 *                                takes `PageSize`, has NO page number
 *   /receiving                   classic `Page` + `Limit`
 *   /fulfillment-center          no paging at all, returns a bare array
 *
 * Forwarding a page number to a cursor route silently truncates a sync, which
 * is why the three shapes are handled separately rather than through one
 * helper.
 */
import { createHash } from 'node:crypto'
import {
  callerLimit,
  cursorPagerKey,
  pageByCursor,
  reportUpstreamPage,
  type CredentialField,
  type Credentials,
  type PagedResult,
  type QueryParams,
} from '@opensteward/shared'
import type { InventoryAdapter } from '../../adapter/interface'
import type { Product } from '../../schema/product'
import type { StockLevel } from '../../schema/stock-level'
import type { Location } from '../../schema/location'
import type { PurchaseOrder } from '../../schema/purchase-order'
import type { WebhookEvent } from '../../schema/webhook'

import {
  buildAuthUrl,
  credentialFields as shipbobInventoryCredentialFields,
  exchangeCode as shipbobInventoryExchangeCode,
  exchangeCredentials as shipbobInventoryExchangeCredentials,
  refreshCredentials as shipbobInventoryRefreshCredentials,
  type ShipBobInventoryAuthConfig,
} from './auth'
import { ShipBobInventoryClient } from './client'
import { DEFAULT_PAGE_SIZE, RECEIVING_DEFAULT_LIMIT } from './constants'
import { verifyShipBobInventoryWebhook, parseShipBobInventoryWebhookEvents } from './webhook'

import { flattenProducts, type RawShipBobProduct } from './transform/product'
import { flattenStockLevels, type RawShipBobInventoryLevel } from './transform/stock-level'
import {
  transformLocation,
  type RawShipBobFulfillmentCenter,
} from './transform/location'
import {
  transformPurchaseOrder,
  type RawShipBobReceivingOrder,
} from './transform/purchase-order'

export interface ShipBobInventoryAdapterConfig {
  clientId?: string
  clientSecret?: string
  redirectUri?: string
  scopes?: string[]
  /**
   * Point at ShipBob's staging environment: `sandbox-api.shipbob.com` for the
   * API and `authstage.shipbob.com` for OAuth. An app registration and a
   * token each exist in exactly one environment, so this flag selects both
   * together — splitting them would authorize against one and read from the
   * other.
   */
  sandbox?: boolean
}

/**
 * The cursor envelope `/product`, `/inventory` and `/inventory-level` return.
 * `next` and friends are LINKS, not cursors — see `cursorFrom`.
 */
interface CursorEnvelope<T> {
  items?: T[] | null
  next?: string | null
  prev?: string | null
  first?: string | null
  last?: string | null
}

/**
 * The cursor carried by a ShipBob `next` link, or `undefined` at the end.
 *
 * Live links (2026-09-22) are relative and UNVERSIONED, with casing of their
 * own — `/Product?cursor=…`, `/inventory-level?cursor=…` — and the cursor is a
 * gzipped query string holding the whole position: filters, PageSize, sort,
 * CursorId. So only the cursor is taken, and it goes back to the route that
 * minted it (see `cursorPage`). A link WITHOUT one is a contract change, and
 * reading it as "last page" would mark a truncated collection complete — the
 * defect this paging exists to remove — so it throws instead.
 */
function cursorFrom(next: string | null | undefined, path: string): string | undefined {
  if (!next) return undefined
  const cursor = new URL(next, 'https://api.shipbob.com').searchParams.get('cursor')
  if (!cursor) {
    throw new Error(
      `ShipBob ${path} returned a next link with no cursor (${next}); refusing to treat it as the last page.`,
    )
  }
  return cursor
}

export class ShipBobInventoryAdapter implements InventoryAdapter {
  readonly platform = 'shipbob-inventory'
  readonly version = '1.0.0'
  /**
   * `requiresPkce` is what makes the router mint a verifier/challenge pair and
   * hand the challenge to `getAuthUrl` — ShipBob documents PKCE as required
   * and refuses the authorize request outright without it, with a page that
   * names no cause.
   *
   * `maxPageSize` is the cap every route here is asked at. Without it the sync
   * worker asks for 500, receives a full page of 100, reads it as short, and
   * marks the collection complete after one page — how `/receiving` was
   * truncated even though it honours `Page`.
   */
  readonly capabilities = {
    requiresPkce: true,
    supportsSandbox: true,
    maxPageSize: DEFAULT_PAGE_SIZE,
  }

  private readonly sandbox: boolean
  private readonly auth: ShipBobInventoryAuthConfig

  constructor(config: ShipBobInventoryAdapterConfig = {}) {
    this.sandbox = config.sandbox ?? false
    this.auth = {
      clientId: config.clientId ?? '',
      clientSecret: config.clientSecret ?? '',
      redirectUri: config.redirectUri,
      scopes: config.scopes,
      sandbox: this.sandbox,
    }
  }

  credentialFields(): CredentialField[] {
    return shipbobInventoryCredentialFields()
  }

  async exchangeCredentials(fields: Record<string, string>) {
    return shipbobInventoryExchangeCredentials(fields)
  }

  getAuthUrl(state: string, overrideScopes?: string[], codeChallenge?: string): string {
    return buildAuthUrl(this.auth, state, codeChallenge, overrideScopes)
  }

  async exchangeCode(code: string, redirectUri: string): Promise<Credentials> {
    return shipbobInventoryExchangeCode(this.auth, code, redirectUri)
  }

  /**
   * The callback prefers this whenever a verifier is in flight, which for this
   * adapter is always — see `capabilities.requiresPkce`.
   */
  async exchangeCodeWithVerifier(
    code: string,
    redirectUri: string,
    codeVerifier: string,
  ): Promise<Credentials> {
    return shipbobInventoryExchangeCode(this.auth, code, redirectUri, codeVerifier)
  }

  /**
   * Renews an OAuth grant, and returns a Personal Access Token untouched: a
   * PAT carries no refresh token, does not expire on a schedule, and there is
   * nothing to exchange for it.
   */
  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return shipbobInventoryRefreshCredentials(this.auth, credentials)
  }

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return verifyShipBobInventoryWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parseShipBobInventoryWebhookEvents(payload)
  }

  private client(credentials: Credentials): ShipBobInventoryClient {
    return new ShipBobInventoryClient(credentials, this.sandbox)
  }

  /**
   * How many records to ask ShipBob for: the CALLER's page size, never the
   * API router's `hasMore` probe.
   *
   * The router asks every adapter for `callerLimit + 1` and drops the extra
   * row. Both of ShipBob's paging shapes turn that into a lost row per page:
   * a cursor is minted AFTER the probe row, and `/receiving` derives its
   * offset from the Limit it was sent. Live (2026-09-22), a walk at limit=10
   * over 38 products served 35. `callerLimit` strips the probe; for the sync
   * worker, which sets none, it is just `limit`.
   */
  private pageSize(params: QueryParams, cap: number): number {
    return params.limit === undefined ? cap : Math.min(callerLimit(params), cap)
  }

  /**
   * Params for the FIRST page of a cursor route. `PageSize` only — a page
   * number is not part of the contract. Later pages send the cursor alone,
   * which already encodes the page size and every filter.
   */
  private cursorParams(params: QueryParams): Record<string, unknown> {
    return { PageSize: this.pageSize(params, DEFAULT_PAGE_SIZE) }
  }

  /**
   * Who a cursor walk belongs to: stable per connection, and never the raw
   * token (it becomes part of a map key).
   *
   * Credentials carry no ShipBob account id. The refresh token stands in for
   * an OAuth connection — ShipBob does not rotate it on every refresh, so a
   * sync straddling the hourly access-token refresh keeps its walk rather than
   * re-walking from page 1 — and a Personal Access Token never changes at all.
   */
  private pagerScope(credentials: Credentials): string {
    const basis = credentials.refreshToken ?? credentials.accessToken
    return `shipbob-inventory:${createHash('sha256').update(basis).digest('hex').slice(0, 16)}`
  }

  /**
   * One page of a cursor route, by the page NUMBER the sync worker and the
   * routers ask for. ShipBob only knows "the page after this cursor", so the
   * shared pager walks the chain from the nearest remembered page.
   *
   * The cursor goes back to `path` — the route that minted it — never to the
   * route its `next` link names (see `cursorFrom`).
   */
  private async cursorPage<T>(
    credentials: Credentials,
    path: string,
    params: QueryParams,
  ): Promise<PagedResult<T>> {
    const firstPage = this.cursorParams(params)
    const client = this.client(credentials)
    return pageByCursor<T>(
      cursorPagerKey(this.pagerScope(credentials), path, firstPage),
      params.page,
      async (cursor) => {
        const res = await client.get<CursorEnvelope<T>>(
          path,
          cursor === undefined ? firstPage : { cursor },
        )
        return { items: res?.items ?? [], next: cursorFrom(res?.next, path) }
      },
    )
  }

  // ── Products ───────────────────────────────────────────────────────────────

  // One canonical product per VARIANT, keyed by its inventory id — the id
  // stock levels and purchase-order lines reference (see `flattenProducts`).
  //
  // A page returns every row its ShipBob records flatten into, never trimmed
  // to `limit`: trimming discards rows the next page will not return. The end
  // of the list is ShipBob's word (`hasMore`), not a row count — a page of 100
  // products can flatten into more or fewer than 100 rows.
  async listProducts(credentials: Credentials, params: QueryParams): Promise<Product[]> {
    const page = await this.cursorPage<RawShipBobProduct>(credentials, '/product', params)
    reportUpstreamPage(params, { hasMore: page.hasMore })
    return page.items.flatMap(flattenProducts)
  }

  /**
   * The id is an INVENTORY id, which `/product/{productId}` does not accept.
   * `/product` filtered on `InventoryId` ("Looks for variants by its associated
   * inventory id") answers with the owning product, verified live 2026-09-22.
   * Whether that answer carries the sibling variants too could not be checked —
   * every sandbox product has exactly one — so the row for this id is picked
   * out of the flattened set rather than assumed to be the first.
   */
  async getProduct(credentials: Credentials, id: string): Promise<Product> {
    const res = await this.client(credentials).get<CursorEnvelope<RawShipBobProduct>>('/product', {
      InventoryId: id,
    })
    const row = (res?.items ?? []).flatMap(flattenProducts).find((p) => p.id === String(id))
    if (!row) throw new Error(`ShipBob product ${id} not found`)
    return row
  }

  // ── Stock levels ───────────────────────────────────────────────────────────

  // `/inventory-level/locations`, not `/inventory-level`. The latter returns
  // `total_*` quantities summed across every fulfilment centre, and a
  // canonical stock level is per (product, location) — reporting a
  // network-wide total against one warehouse would be wrong in a way nothing
  // downstream could detect. One inventory item across three centres becomes
  // three rows.
  //
  // Every row a page flattens into is returned — no slice to `limit`. This
  // used to slice (2026-09-18), to quiet the router's "adapter ignored the
  // requested limit" warning. That was harmless only while page 2 was
  // unreachable; with paging, a sync page of 100 items across 6 centres is
  // ~600 rows, and a slice kept 100. The router still truncates what it SENDS
  // an API caller, and its warning for a flattened list is accurate.
  async listStockLevels(credentials: Credentials, params: QueryParams): Promise<StockLevel[]> {
    const page = await this.cursorPage<RawShipBobInventoryLevel>(
      credentials,
      '/inventory-level/locations',
      params,
    )
    reportUpstreamPage(params, { hasMore: page.hasMore })
    return page.items.flatMap(flattenStockLevels)
  }

  /**
   * The id is the composite `${inventoryId}:${locationId}` `listStockLevels`
   * emits, because neither half identifies a row on its own. The by-id route
   * is per inventory item, so the location is selected from its response.
   */
  async getStockLevel(credentials: Credentials, id: string): Promise<StockLevel> {
    const [inventoryId, locationId] = String(id).split(':')
    if (!inventoryId || !locationId) {
      throw new Error(
        `ShipBob stock level id '${id}' must be '<inventoryId>:<locationId>' — the composite id listStockLevels returns.`,
      )
    }
    const res = await this.client(credentials).get<RawShipBobInventoryLevel>(
      `/inventory-level/${inventoryId}/locations`,
    )
    const row = flattenStockLevels(res ?? {}).find((r) => r.id === id)
    if (!row) throw new Error(`ShipBob stock level ${id} not found`)
    return row
  }

  // ── Locations ──────────────────────────────────────────────────────────────

  /**
   * `/fulfillment-center`, not `/location`.
   *
   * ShipBob has both and they answer different questions. `/location` is the
   * whole network — 69 centres live, 65 of them `access_granted: false` — and
   * it needs the `locations_read` scope. `/fulfillment-center` is the 8
   * centres this merchant uses, and needs no scope the other resources here
   * do not already require.
   *
   * The reason is referential, not convenience: the location ids
   * `listStockLevels` emits were 7, 9, 10, 80, 81, 82, 83, 85 and this route
   * returned exactly that set. Under `/location` a stock level could point at
   * a centre we never returned; under this one every `locationId` resolves.
   *
   * Neither route pages, and an account has a handful of centres, so
   * `page`/`limit` are deliberately not forwarded rather than sent and
   * ignored.
   */
  async listLocations(credentials: Credentials, _params: QueryParams): Promise<Location[]> {
    const res = await this.client(credentials).get<RawShipBobFulfillmentCenter[]>(
      '/fulfillment-center',
    )
    return (res ?? []).map(transformLocation)
  }

  async getLocation(credentials: Credentials, id: string): Promise<Location> {
    // No by-id route exists, so the single row is selected from the list. The
    // collection is eight rows and unpaged, which is what makes this honest
    // rather than a hidden full-table scan.
    const res = await this.client(credentials).get<RawShipBobFulfillmentCenter[]>(
      '/fulfillment-center',
    )
    const found = (res ?? []).find((l) => String(l.id) === String(id))
    if (!found) throw new Error(`ShipBob fulfillment center ${id} not found`)
    return transformLocation(found)
  }

  // ── Purchase orders (ShipBob Warehouse Receiving Orders) ───────────────────

  async listPurchaseOrders(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<PurchaseOrder[]> {
    // The one inventory route that really does take Page + Limit — and ShipBob
    // derives the offset from that Limit, so it must be the caller's page size
    // (see `pageSize`), or each page starts one order past where the last one
    // was cut.
    const page = params.page ?? 1
    const limit = this.pageSize(params, RECEIVING_DEFAULT_LIMIT)
    const client = this.client(credentials)
    const res = await client.get<RawShipBobReceivingOrder[]>('/receiving', {
      Page: page,
      Limit: limit,
    })
    const rows = res ?? []
    // A full page cannot tell "more" from "an exact multiple" on its own, and
    // would report `hasMore: null` — on which a client cannot paginate. So look
    // one order ahead (Limit 1 puts Page N at offset N−1) and say so. On EVERY
    // full page: this once ran only when it detected the router's limit+1
    // probe, which the router no longer sends — and a sync gains too,
    // since a reported `hasMore` is a known end the worker can vouch for.
    if (rows.length === limit) {
      const ahead = await client.get<RawShipBobReceivingOrder[]>('/receiving', {
        Page: page * limit + 1,
        Limit: 1,
      })
      reportUpstreamPage(params, { hasMore: (ahead ?? []).length > 0 })
    }
    return rows.map(transformPurchaseOrder)
  }

  async getPurchaseOrder(credentials: Credentials, id: string): Promise<PurchaseOrder> {
    const res = await this.client(credentials).get<RawShipBobReceivingOrder>(`/receiving/${id}`)
    if (!res) throw new Error(`ShipBob receiving order ${id} not found`)
    return transformPurchaseOrder(res)
  }
}
