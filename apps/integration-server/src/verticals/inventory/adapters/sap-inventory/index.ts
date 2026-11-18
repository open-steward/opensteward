/**
 * SAP S/4HANA Cloud — Inventory Management adapter.
 *
 * Auth:       OAuth 2.0 client-credentials grant
 *             Token URL: https://<tenant>-api.s4hana.ondemand.com/sap/bc/sec/oauth2/token
 *
 * APIs used:
 *   Products       → API_PRODUCT_SRV            (A_Product)
 *   Stock Levels   → API_MATERIAL_STOCK_SRV     (A_MatlStkInAcctMod)
 *   Locations      → derived from stock-level Plant + StorageLocation
 *   Suppliers      → API_BUSINESS_PARTNER       (A_Supplier)
 *   Purchase Orders → API_PURCHASEORDER_PROCESS_SRV (A_PurchaseOrder, type ≠ UB)
 *   Stock Transfers → API_PURCHASEORDER_PROCESS_SRV (A_PurchaseOrder, type = UB)
 *   Stock Adjustments → API_MATERIAL_DOCUMENT_SRV (A_MaterialDocumentHeader)
 *
 * Pagination: $top / $skip from the caller's page, via SapInventoryClient.paginate().
 *             Locations walk the stock rows in Plant, StorageLocation order,
 *             each page starting by $filter where the last ended, through the
 *             shared row pager.
 * Webhooks:   Not supported (SAP uses BTP Event Mesh, not HTTP callbacks).
 *
 * Schema-firewall: no product images, no supplier banking details,
 *   no manufacturing BOM / work orders, no customer order data.
 */
import { connectionScope, cursorPagerKey, pageByRows, pageOffset } from '@opensteward/shared'
import type { CredentialField, Credentials, QueryParams } from '@opensteward/shared'
import type { InventoryAdapter } from '../../adapter/interface'
import type { Product } from '../../schema/product'
import type { StockLevel } from '../../schema/stock-level'
import type { Location } from '../../schema/location'
import type { Supplier } from '../../schema/supplier'
import type { PurchaseOrder } from '../../schema/purchase-order'
import type { StockTransfer } from '../../schema/stock-transfer'
import type { StockAdjustment } from '../../schema/stock-adjustment'

import {
  credentialFields as sapCredentialFields,
  exchangeCredentials as sapExchangeCredentials,
  refreshCredentials as sapRefreshCredentials,
  getAuthUrl as sapGetAuthUrl,
  exchangeCode as sapExchangeCode,
} from './auth'
import {SapInventoryClient} from './client'
import {
  SERVICE_PRODUCT,
  SERVICE_MATERIAL_STOCK,
  SERVICE_BUSINESS_PARTNER,
  SERVICE_PURCHASE_ORDER,
  DEFAULT_PAGE_SIZE,
  NEXT_LINK_KEY,
} from './constants'
import {verifySapInventoryWebhook, parseSapInventoryWebhookEvents} from './webhook'

import {transformProduct, type RawSapProduct} from './transform/product'
import {transformStockLevel, type RawSapStockLevel} from './transform/stock-level'
import {transformLocation, type RawSapPlant} from './transform/location'
import {transformSupplier, type RawSapSupplier} from './transform/supplier'
import {transformPurchaseOrder, type RawSapPurchaseOrder} from './transform/purchase-order'
import {transformStockTransfer, type RawSapStockTransfer} from './transform/stock-transfer'
import {transformStockAdjustment, type RawSapStockAdjustment} from './transform/stock-adjustment'

export interface SapInventoryAdapterConfig {
  /** Default SAP client number (optional, passed as sap-client header) */
  sapClient?: string
}

/**
 * Where the next page of stock rows starts, in `$orderby=Plant,StorageLocation`
 * order: after the pair (`plant`, `storageLocation`) within `plant`, or, once
 * `plantDone`, at the first plant after `plant`. A position in the sort, not
 * an offset, so a stock row added or removed elsewhere during a walk cannot
 * move it.
 */
interface LocationScanCursor {
  plant: string
  storageLocation: string
  plantDone: boolean
}

/** Stock rows per upstream page. The caller's limit counts locations, not rows. */
const LOCATION_SCAN_TOP = DEFAULT_PAGE_SIZE

/** An OData string literal: single-quoted, with a quote inside doubled. */
function odataString(value: string): string {
  return `'${value.replace(/'/g, "''")}'`
}

/**
 * The `$filter` that starts a page of stock rows at `at`. Two plain
 * conjunctions rather than one `or` across properties: a service that reads
 * the filter as one range per property, as the implementation example on SAP
 * Gateway's "OData Query Options" page does (`get_filter_select_options`),
 * can express these and could not express the `or`.
 */
function locationScanFilter(at: LocationScanCursor): string {
  return at.plantDone
    ? `Plant gt ${odataString(at.plant)}`
    : `Plant eq ${odataString(at.plant)} and StorageLocation gt ${odataString(at.storageLocation)}`
}

/**
 * Requests a walk from the first page can take to learn whether location
 * `n` (0-based) exists. The first request returns location 0. Every later one
 * starts past the location the one before it ended in, so it either returns
 * a new location or no rows at all. No rows comes at most once per plant (its
 * last page was full, and nothing of it is left) before the next plant, and
 * a plant is a location. So location `n` arrives by request 2n + 1, and in a
 * table of exactly `n` locations the empty request that ends it is request
 * 2n + 1 at the latest. Plant is a key of A_MatlStkInAcctMod, so every row
 * has one.
 */
function locationScanBudget(n: number): number {
  return 2 * n + 1
}

/** -1, 0 or 1 as the pair (p, s) sorts before, with or after (plant, storageLocation). */
function comparePairs(p: string, s: string, plant: string, storageLocation: string): number {
  if (p !== plant) return p < plant ? -1 : 1
  if (s !== storageLocation) return s < storageLocation ? -1 : 1
  return 0
}

/**
 * The locations that START in `rows`, a page of stock rows sorted by Plant
 * then StorageLocation: a plant where Plant changes, and a storage location
 * where the pair changes to one with a StorageLocation. Rows of one pair
 * repeat (one per stock record) and are one location.
 *
 * The sort is what makes the previous row enough to tell a new location from
 * a repeat, so the rows are checked against it: every row must sort at or
 * after the one before it, and every row must lie past `at`, where `filter`
 * started the page. A row out of order means the service did not apply
 * `$orderby`, a row before `at` that it did not apply `$filter`; either way
 * locations would repeat or go missing, so it throws instead.
 *
 * The check compares as JavaScript does, by UTF-16 code unit. Plant and
 * StorageLocation are 4-character key codes (SAP's own VDM,
 * @sap/cloud-sdk-vdm-material-stock-service: `key: true, length: 4`), and
 * the service is expected to sort them by code point too; no live tenant has
 * confirmed it. A service that sorts them some other way fails here, loudly,
 * rather than serving a location twice.
 */
function locationsStartingIn(
  rows: readonly RawSapStockLevel[],
  at: LocationScanCursor | undefined,
  filter: string | undefined,
): Location[] {
  const locations: Location[] = []
  let plant = at?.plant
  let storageLocation = at?.storageLocation ?? ''
  for (const row of rows) {
    const p = row.Plant ?? ''
    const s = row.StorageLocation ?? ''
    if (at && (at.plantDone ? p <= at.plant : p !== at.plant || s <= at.storageLocation))
      throw new Error(
        `sap-inventory: A_MatlStkInAcctMod answered $filter=${filter ?? ''} with ` +
          `Plant ${p} / StorageLocation ${s || '(none)'}, which it excludes, so the service did ` +
          'not apply the filter; locations derived from these rows would repeat',
      )
    if (plant !== undefined) {
      const order = comparePairs(p, s, plant, storageLocation)
      if (order < 0)
        throw new Error(
          `sap-inventory: A_MatlStkInAcctMod returned Plant ${p} / StorageLocation ${s || '(none)'} ` +
            `after Plant ${plant} / StorageLocation ${storageLocation || '(none)'}, so the service ` +
            'did not apply $orderby=Plant,StorageLocation; locations derived from these rows would ' +
            'repeat or go missing',
        )
      if (order === 0) continue
    }
    if (p) {
      if (p !== plant) locations.push(transformLocation({ Plant: p } as RawSapPlant))
      if (s) locations.push(transformLocation({ Plant: p, StorageLocation: s }))
    }
    plant = p
    storageLocation = s
  }
  return locations
}

/**
 * The row pager's scope for one connection. A client-credentials connection
 * has no refresh token, and auth.ts mints a new access token every hour, so a
 * fingerprint of the token would start every walk that spans a refresh again
 * from the first location. The OAuth client is what decides which rows a
 * connection sees (the authorizations of the communication user behind it),
 * so the client is fingerprinted instead: hashed by `connectionScope`, never
 * logged. A connection stored without it falls back to the token.
 */
function locationScanScope(credentials: Credentials): string {
  const extra = credentials.extra ?? {}
  const tenant = String(extra['tenantUrl'] ?? '')
  const clientId = String(extra['clientId'] ?? '')
  const clientSecret = String(extra['clientSecret'] ?? '')
  return connectionScope(`sap-inventory:${tenant}`, {
    accessToken: credentials.accessToken,
    refreshToken: clientId && clientSecret ? `${clientId}\u0000${clientSecret}` : undefined,
  })
}

export class SapInventoryAdapter implements InventoryAdapter {
  readonly platform = 'sap-inventory'
  readonly version = '0.1.0'

  constructor(_config?: SapInventoryAdapterConfig) {}

  // ── Auth ──────────────────────────────────────────────────────────────────

  credentialFields(): CredentialField[] {
    return sapCredentialFields()
  }

  async exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
    return sapExchangeCredentials(fields)
  }

  getAuthUrl(state: string, scopes?: string[]): string {
    return sapGetAuthUrl(state, scopes)
  }

  async exchangeCode(code: string, redirectUri: string): Promise<Credentials> {
    return sapExchangeCode(code, redirectUri)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return sapRefreshCredentials(credentials)
  }

  // ── Webhooks (unsupported) ────────────────────────────────────────────────

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return verifySapInventoryWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>) {
    return parseSapInventoryWebhookEvents(payload)
  }

  // ── Client factory ────────────────────────────────────────────────────────

  private client(credentials: Credentials): SapInventoryClient {
    return new SapInventoryClient(credentials)
  }

  // ── Products (API_PRODUCT_SRV / A_Product) ────────────────────────────────

  async listProducts(credentials: Credentials, params: QueryParams): Promise<Product[]> {
    const client = this.client(credentials)
    const top = params.limit ?? DEFAULT_PAGE_SIZE
    const skip = params.page ? (params.page - 1) * top : 0
    const items = await client.paginate<RawSapProduct>(
      SERVICE_PRODUCT,
      'A_Product',
      {
        $expand: 'to_Description',
        $top: top,
        ...(skip > 0 ? { $skip: skip } : {}),
      },
      top,
    )
    return items.map(transformProduct)
  }

  async getProduct(credentials: Credentials, id: string): Promise<Product> {
    const client = this.client(credentials)
    const d = await client.get<RawSapProduct>(
      SERVICE_PRODUCT,
      `A_Product('${encodeURIComponent(id)}')`,
      { $expand: 'to_Description' },
    )
    // Single entity: d does not have results; the fields are directly on d
    const raw = d as unknown as RawSapProduct
    if (!raw.Product) throw new Error(`sap-inventory: product ${id} not found`)
    return transformProduct(raw)
  }

  // ── Stock Levels (API_MATERIAL_STOCK_SRV / A_MatlStkInAcctMod) ───────────

  async listStockLevels(credentials: Credentials, params: QueryParams): Promise<StockLevel[]> {
    const client = this.client(credentials)
    const top = params.limit ?? DEFAULT_PAGE_SIZE
    const skip = params.page ? (params.page - 1) * top : 0
    const items = await client.paginate<RawSapStockLevel>(
      SERVICE_MATERIAL_STOCK,
      'A_MatlStkInAcctMod',
      {
        $top: top,
        ...(skip > 0 ? { $skip: skip } : {}),
      },
      top,
    )
    return items.map(transformStockLevel)
  }

  async getStockLevel(_credentials: Credentials, id: string): Promise<StockLevel> {
    // A_MatlStkInAcctMod has a composite key; bulk list is the standard approach.
    throw new Error(
      `sap-inventory: stock-level lookup by composite id is not supported; use listStockLevels. id=${id}`,
    )
  }

  // ── Locations — derived from stock-level Plant data ───────────────────────
  //
  // SAP does not expose a single "list all storage locations" endpoint in the
  // standard inventory APIs. We derive one Location per distinct Plant and
  // one per distinct Plant:StorageLocation from the stock table.
  //
  // A_MatlStkInAcctMod is keyed by Material, Plant, StorageLocation, Batch
  // and more, so `$select=Plant,StorageLocation` still returns one row per
  // STOCK RECORD: a page of stock rows is not a page of locations. This used
  // to send `$top=limit` and no `$skip`, so page 2 repeated page 1, and one
  // page held up to 2 × limit locations.
  //
  // Now it walks the stock rows sorted by `$orderby=Plant,StorageLocation`,
  // which keeps each location's rows together, and `pageByRows` cuts exactly
  // the caller's locations out of the stream with `hasMore` exact. Each page
  // after the first starts where the last one ended by `$filter`, not
  // `$skip`: within the plant after the pair it ended on, then past the
  // plant. So the walk skips the rest of a location's stock rows instead of
  // reading them, and costs at most two requests per location
  // (`locationScanBudget`), however many materials a location holds. An
  // offset walk read every stock row, and page 1 is read afresh on every API
  // call. A position in the sort also cannot drift when stock moves during
  // the walk, where an offset can.
  //
  // The query options, for this entity set: SAP's Business Accelerator Hub
  // spec of "Material Stock - Read" (API_MATERIAL_STOCK_SRV, 1.1.0) lists
  // `$top`, `$filter` and `$orderby` on GET /A_MatlStkInAcctMod, with Plant
  // and StorageLocation among the `$orderby` values. api.sap.com needs a
  // login, so that was read from a copy of the spec
  // (github.com/be-lenka/sap_material-stock, material_stock.json). Its
  // `$filter` links SAP's copy of the OData V2 specification
  // (https://help.sap.com/doc/5890d27be418427993fafa6722cdc03b/Cloud/en-US/OdataV2.pdf,
  // [MS-ODATA] 2.2.3.6.1.1): the operands of `gt` "MUST evaluate to a value
  // of one of the following EDM Primitive types: ... Edm.String ...", and
  // "a data service MUST always use consistent semantics when ordering and
  // comparing values", so `gt` agrees with `$orderby`. SAP Gateway,
  // "OData Query Options"
  // (https://help.sap.com/docs/ABAP_PLATFORM_NEW/68bf513362174d54b58cddec28794093/30116c10d4ff42908d4a4ad023b77634.html):
  //   "$orderby Request example: .../Products?$orderby=Category desc"
  //   "$filter Request example: .../Products?$filter=Category eq 'Notebooks'"
  // The same page lists `$orderby`, `$top` and `$filter` under "Query
  // Options Requiring Implementation": a service has them only if it was
  // built with them. That is why the entity-specific spec above matters, and
  // the sibling methods here already rely on `$top` and `$filter`. No tenant
  // has been tried live. A service that ignores `$orderby` or `$filter`
  // fails in `locationsStartingIn` rather than serving locations twice.
  //
  // A page shorter than `$top` with no `d.__next` is all the stock its filter
  // matches. Under server-driven paging a short page carries `d.__next`; the
  // walk does not follow it, but carries on by filter from the pair the page
  // ended on, as after a full page.
  //
  // The upstream page is LOCATION_SCAN_TOP stock rows whatever the caller's
  // limit, so the key leaves the limit out and an API walk and a sync walk
  // share their positions. The key is per connection (`locationScanScope`),
  // because the row pager keeps the rows it fetched.

  async listLocations(credentials: Credentials, params: QueryParams): Promise<Location[]> {
    const client = this.client(credentials)
    const query = {
      $select: 'Plant,StorageLocation',
      $orderby: 'Plant,StorageLocation',
      $top: LOCATION_SCAN_TOP,
    }
    const limit = Number(params.limit ?? DEFAULT_PAGE_SIZE)
    const { items } = await pageByRows<Location, LocationScanCursor>(
      cursorPagerKey(
        locationScanScope(credentials),
        `${SERVICE_MATERIAL_STOCK}/A_MatlStkInAcctMod#locations`,
        query,
      ),
      params,
      async (at) => {
        const filter = at ? locationScanFilter(at) : undefined
        // client.get throws on a body that is not JSON (a logon page). A JSON
        // body with no `d` holds no rows.
        const d: { results?: RawSapStockLevel[]; [NEXT_LINK_KEY]?: string } | undefined =
          await client.get<RawSapStockLevel>(SERVICE_MATERIAL_STOCK, 'A_MatlStkInAcctMod', {
            ...query,
            ...(filter ? { $filter: filter } : {}),
          })
        const rows = d?.results ?? []
        const locations = locationsStartingIn(rows, at, filter)
        const last = rows[rows.length - 1]
        let next: LocationScanCursor | undefined
        if (last && (rows.length >= LOCATION_SCAN_TOP || !!d?.[NEXT_LINK_KEY]))
          // More stock matches this page's filter: carry on past the pair it ended on.
          next = {
            plant: last.Plant ?? '',
            storageLocation: last.StorageLocation ?? '',
            plantDone: false,
          }
        else if (at && !at.plantDone)
          // Nothing of this plant is left: carry on at the next plant.
          next = { plant: at.plant, storageLocation: '', plantDone: true }
        // Otherwise the page held all the stock left in the table.
        return { items: locations, next }
      },
      {
        defaultLimit: DEFAULT_PAGE_SIZE,
        maxUpstreamPages: locationScanBudget(pageOffset(params, limit) + limit),
      },
    )
    return items
  }

  async getLocation(_credentials: Credentials, id: string): Promise<Location> {
    // Locations are derived from stock data; individual lookup not supported.
    throw new Error(
      `sap-inventory: location lookup by id is not supported; use listLocations. id=${id}`,
    )
  }

  // ── Suppliers (API_BUSINESS_PARTNER / A_Supplier) ─────────────────────────

  async listSuppliers(credentials: Credentials, params: QueryParams): Promise<Supplier[]> {
    const client = this.client(credentials)
    const top = params.limit ?? DEFAULT_PAGE_SIZE
    const skip = params.page ? (params.page - 1) * top : 0
    const items = await client.paginate<RawSapSupplier>(
      SERVICE_BUSINESS_PARTNER,
      'A_Supplier',
      {
        $top: top,
        ...(skip > 0 ? { $skip: skip } : {}),
      },
      top,
    )
    return items.map(transformSupplier)
  }

  async getSupplier(credentials: Credentials, id: string): Promise<Supplier> {
    const client = this.client(credentials)
    const d = await client.get<RawSapSupplier>(
      SERVICE_BUSINESS_PARTNER,
      `A_Supplier('${encodeURIComponent(id)}')`,
    )
    const raw = d as unknown as RawSapSupplier
    if (!raw.Supplier) throw new Error(`sap-inventory: supplier ${id} not found`)
    return transformSupplier(raw)
  }

  // ── Purchase Orders (API_PURCHASEORDER_PROCESS_SRV, type ≠ UB) ───────────

  async listPurchaseOrders(credentials: Credentials, params: QueryParams): Promise<PurchaseOrder[]> {
    const client = this.client(credentials)
    const top = params.limit ?? DEFAULT_PAGE_SIZE
    const skip = params.page ? (params.page - 1) * top : 0
    const items = await client.paginate<RawSapPurchaseOrder>(
      SERVICE_PURCHASE_ORDER,
      'A_PurchaseOrder',
      {
        $filter: "PurchaseOrderType ne 'UB'",
        $expand: 'to_PurchaseOrderItem',
        $top: top,
        ...(skip > 0 ? { $skip: skip } : {}),
      },
      top,
    )
    return items.map(transformPurchaseOrder)
  }

  async getPurchaseOrder(credentials: Credentials, id: string): Promise<PurchaseOrder> {
    const client = this.client(credentials)
    const d = await client.get<RawSapPurchaseOrder>(
      SERVICE_PURCHASE_ORDER,
      `A_PurchaseOrder('${encodeURIComponent(id)}')`,
      { $expand: 'to_PurchaseOrderItem' },
    )
    const raw = d as unknown as RawSapPurchaseOrder
    if (!raw.PurchaseOrder) throw new Error(`sap-inventory: purchase order ${id} not found`)
    return transformPurchaseOrder(raw)
  }

  // ── Stock Transfers (A_PurchaseOrder, type = UB) ──────────────────────────

  async listStockTransfers(credentials: Credentials, params: QueryParams): Promise<StockTransfer[]> {
    const client = this.client(credentials)
    const top = params.limit ?? DEFAULT_PAGE_SIZE
    const skip = params.page ? (params.page - 1) * top : 0
    const items = await client.paginate<RawSapStockTransfer>(
      SERVICE_PURCHASE_ORDER,
      'A_PurchaseOrder',
      {
        $filter: "PurchaseOrderType eq 'UB'",
        $expand: 'to_PurchaseOrderItem',
        $top: top,
        ...(skip > 0 ? { $skip: skip } : {}),
      },
      top,
    )
    return items.map(transformStockTransfer)
  }

  async getStockTransfer(credentials: Credentials, id: string): Promise<StockTransfer> {
    const client = this.client(credentials)
    const d = await client.get<RawSapStockTransfer>(
      SERVICE_PURCHASE_ORDER,
      `A_PurchaseOrder('${encodeURIComponent(id)}')`,
      { $expand: 'to_PurchaseOrderItem' },
    )
    const raw = d as unknown as RawSapStockTransfer
    if (!raw.PurchaseOrder) throw new Error(`sap-inventory: stock transfer ${id} not found`)
    return transformStockTransfer(raw)
  }

  // ── Stock Adjustments (API_MATERIAL_DOCUMENT_SRV) ─────────────────────────

  async listStockAdjustments(credentials: Credentials, params: QueryParams): Promise<StockAdjustment[]> {
    const client = this.client(credentials)
    const top = params.limit ?? DEFAULT_PAGE_SIZE
    const skip = params.page ? (params.page - 1) * top : 0
    const items = await client.paginate<RawSapStockAdjustment>(
      'API_MATERIAL_DOCUMENT_SRV',
      'A_MaterialDocumentHeader',
      {
        $expand: 'to_MaterialDocumentItem',
        $top: top,
        ...(skip > 0 ? { $skip: skip } : {}),
      },
      top,
    )
    return items.map(transformStockAdjustment)
  }

  async getStockAdjustment(credentials: Credentials, id: string): Promise<StockAdjustment> {
    // id format: "<MaterialDocument>:<Year>" e.g. "5000000100:2024"
    const parts = id.split(':')
    const docNum = parts[0] ?? id
    const docYear = parts[1] ?? ''
    const client = this.client(credentials)
    const d = await client.get<RawSapStockAdjustment>(
      'API_MATERIAL_DOCUMENT_SRV',
      `A_MaterialDocumentHeader(MaterialDocument='${encodeURIComponent(docNum)}',MaterialDocumentYear='${encodeURIComponent(docYear)}')`,
      { $expand: 'to_MaterialDocumentItem' },
    )
    const raw = d as unknown as RawSapStockAdjustment
    if (!raw.MaterialDocument) throw new Error(`sap-inventory: stock adjustment ${id} not found`)
    return transformStockAdjustment(raw)
  }
}
