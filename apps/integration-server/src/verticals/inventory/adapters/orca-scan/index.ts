/**
 * Orca Scan adapter — barcode scanning inventory platform.
 *
 * Orca Scan organises data as "sheets" (scan areas / locations) containing
 * "rows" (scanned items / products with quantity).
 *
 * Auth: API key sent as Bearer token (Business plan required).
 * Base URL: https://api.orcascan.com/v1
 * Rate limit: 15 req/s; responds with 429 + Retry-After.
 *
 * ── Resource coverage ──────────────────────────────────────────────
 * Unavailable: supplier       — Orca Scan has no supplier entity; the API covers only sheets, rows, fields, history, users, and webhooks
 * Unavailable: purchase-order — Orca Scan has no purchase-order entity; the API covers only sheets, rows, fields, history, users, and webhooks
 * Unavailable: stock-transfer — Orca Scan has no stock-transfer entity; the API covers only sheets, rows, fields, history, users, and webhooks
 * Unavailable: stock-adjustment — Orca Scan has no stock-adjustment entity; the API covers only sheets, rows, fields, history, users, and webhooks
 */
import type { CredentialField, Credentials, QueryParams } from '@opensteward/shared'
import { connectionScope, cursorPagerKey, pageByRows, pageLocally } from '@opensteward/shared'
import type { InventoryAdapter } from '../../adapter/interface'
import type { Product } from '../../schema/product'
import type { StockLevel } from '../../schema/stock-level'
import type { Location } from '../../schema/location'

import {
  credentialFields as orcaScanCredentialFields,
  exchangeCredentials as orcaScanExchangeCredentials,
  getAuthUrlUnsupported,
} from './auth'
import {OrcaScanClient} from './client'

import {transformProduct, type RawOrcaScanRow} from './transform/product'
import {transformStockLevel} from './transform/stock-level'
import {transformLocation, type RawOrcaScanSheet} from './transform/location'

export type OrcaScanAdapterConfig = Record<string, never>

/** Shape of GET /sheets response */
interface SheetsResponse {
  data: RawOrcaScanSheet[]
}

/** Shape of GET /sheets/:sheetId/rows response */
interface RowsResponse {
  data: RawOrcaScanRow[]
}

/** Shape of GET /sheets/:sheetId/rows/:rowId response */
interface RowResponse {
  data: RawOrcaScanRow
}

/** A `{ data: [...] }` envelope's array, or none when the body carries none. */
function dataArray<T>(body: { data?: T[] } | null | undefined): T[] {
  return body?.data ?? []
}

/**
 * Ascending `_id`. The spec promises no order for GET /sheets or GET
 * /sheets/{sheetId}/rows, and every caller page reads them again, so the
 * pages line up only if the adapter fixes one. The ids in Orca Scan's REST
 * guide are 24-hex-digit ObjectIds (`62a3188f098a6343fe0d9c1b`), which makes
 * this creation order: a sheet or row added later sorts last.
 */
function byId(a: { _id: string }, b: { _id: string }): number {
  return a._id < b._id ? -1 : a._id > b._id ? 1 : 0
}

export class OrcaScanAdapter implements InventoryAdapter {
  readonly platform = 'orca-scan'
  readonly version = '0.1.0'

  constructor(_config?: OrcaScanAdapterConfig) {}

  credentialFields(): CredentialField[] {
    return orcaScanCredentialFields()
  }

  async exchangeCredentials(fields: Record<string, string>) {
    return orcaScanExchangeCredentials(fields)
  }

  getAuthUrl(_state: string, _scopes?: string[]): string {
    return getAuthUrlUnsupported()
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    throw new Error('orca-scan uses a static API key; use credentialFields() instead')
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return credentials
  }

  private client(credentials: Credentials): OrcaScanClient {
    return new OrcaScanClient(credentials)
  }

  /**
   * Every sheet the key can access, in `_id` order. GET /sheets is
   * unpaginated: Orca Scan's OpenAPI spec declares no parameters on it ("List
   * all sheets") and answers with every sheet in one `data` array.
   * https://api.orcascan.com/v1/openapi.json
   */
  private async sheets(client: OrcaScanClient): Promise<RawOrcaScanSheet[]> {
    return dataArray<RawOrcaScanSheet>(await client.get<SheetsResponse>('/sheets')).sort(byId)
  }

  /**
   * One caller page of the rows of every sheet (or only `sheetId`'s), each
   * mapped by `toRow`.
   *
   * GET /sheets/{sheetId}/rows is unpaginated too: listRows takes only
   * `barcode` and `withTitles` and returns every row of the sheet. So each
   * sheet is one upstream page, and `pageByRows` cuts exactly the caller's
   * rows out of them, with `hasMore` exact. The next caller page continues
   * from the sheet the last one ended in instead of reading every sheet again.
   *
   * The cursor is the `_id` of the next sheet, and a call reads the first
   * sheet at or after it, so a sheet deleted between two caller pages is
   * skipped instead of failing the walk. Keyed by the connection (the row
   * pager keeps rows), the collection (products and stock levels hold
   * different rows) and the sheet filter. The caller's limit is left out: it
   * does not size an upstream page.
   */
  private async sheetRows<Row>(
    credentials: Credentials,
    params: QueryParams,
    collection: string,
    toRow: (raw: RawOrcaScanRow) => Row,
  ): Promise<Row[]> {
    const c = this.client(credentials)
    const sheetId = (params as QueryParams & { filter?: { sheetId?: string } }).filter?.sheetId
    const sheetIds = sheetId ? [sheetId] : (await this.sheets(c)).map((s) => s._id)
    const { items } = await pageByRows<Row, string>(
      cursorPagerKey(connectionScope('orca-scan', credentials), collection, { sheetId }),
      params,
      async (cursor) => {
        const at = cursor === undefined ? 0 : sheetIds.findIndex((id) => id >= cursor)
        const sid = at < 0 ? undefined : sheetIds[at]
        if (sid === undefined) return { items: [] }
        const res = await c.get<RowsResponse>(`/sheets/${sid}/rows`, { withTitles: false })
        const rows = dataArray<RawOrcaScanRow>(res).sort(byId)
        return { items: rows.map((row) => toRow({ ...row, _sheetId: sid })), next: sheetIds[at + 1] }
      },
      // Each sheet is one upstream page, however few rows it holds, so a page
      // of a sparse account may read every sheet. The walk cannot cycle: it
      // only moves forward through this list.
      { maxUpstreamPages: sheetIds.length + 1 },
    )
    return items
  }

  // ── Sheets → Locations ───────────────────────────────────────────────────

  /** GET /sheets returns every sheet, so each call serves the caller's page of them. */
  async listLocations(credentials: Credentials, params: QueryParams): Promise<Location[]> {
    return pageLocally((await this.sheets(this.client(credentials))).map(transformLocation), params)
  }

  /**
   * The sheet from GET /sheets. The spec has no GET /sheets/{sheetId}, and GET
   * /sheets/{sheetId}/settings (SheetSettings) carries neither `_id` nor
   * `name` but does carry the webhook `secret` and the item-link and QR-form
   * PINs, which a Location's `raw` would pass on to every reader.
   */
  async getLocation(credentials: Credentials, id: string): Promise<Location> {
    const sheet = (await this.sheets(this.client(credentials))).find((s) => s._id === id)
    if (!sheet) throw new Error(`orca-scan sheet ${id} not found`)
    return transformLocation(sheet)
  }

  // ── Rows → Products ──────────────────────────────────────────────────────

  /**
   * List products across all sheets, or a specific sheet when
   * params.filter?.sheetId is supplied.
   *
   * Orca Scan has no global "list all rows" endpoint; we iterate sheets
   * and collect rows (see `sheetRows`). To avoid N+1 on large accounts,
   * callers should supply params.filter = { sheetId: '...' } when possible.
   */
  async listProducts(credentials: Credentials, params: QueryParams): Promise<Product[]> {
    return this.sheetRows(credentials, params, 'products', transformProduct)
  }

  async getProduct(credentials: Credentials, id: string): Promise<Product> {
    // id format: "<sheetId>/<rowId>"
    const [sheetId, rowId] = id.split('/')
    if (!sheetId || !rowId) throw new Error(`orca-scan getProduct: id must be "<sheetId>/<rowId>", got "${id}"`)
    const res = await this.client(credentials).get<RowResponse>(`/sheets/${sheetId}/rows/${rowId}`)
    if (!res.data) throw new Error(`orca-scan row ${id} not found`)
    return transformProduct({ ...res.data, _sheetId: sheetId })
  }

  // ── Rows → StockLevels ───────────────────────────────────────────────────

  async listStockLevels(credentials: Credentials, params: QueryParams): Promise<StockLevel[]> {
    return this.sheetRows(credentials, params, 'stock-levels', transformStockLevel)
  }

  async getStockLevel(_credentials: Credentials, id: string): Promise<StockLevel> {
    throw new Error(
      `orca-scan stock-level fetch is bulk-only; call listStockLevels (filter by sheetId). id=${id}`,
    )
  }
}
