/**
 * Megaventory inventory adapter.
 *
 * Every operation name, response key and field below was read from the LIVE
 * service's own ServiceStack metadata on 2026-09-18 — not from documentation.
 * Megaventory publishes effectively none: megaventory.com/developers points at
 * api.megaventory.com, and that page renders no content to a fetch. The
 * service describes itself instead:
 *
 *   index    https://api.megaventory.com/v2017a/metadata           (112 operations)
 *   per-op   https://api.megaventory.com/v2017a/json/metadata?op=ProductGet
 *
 * Until this rewrite the file's own header read "Cin7 Core adapter — reference
 * implementation for the inventory vertical". It sent Cin7's paths to
 * Megaventory's host and authenticated with a Bearer header Megaventory does
 * not read.
 *
 * ── Implemented (10) ───────────────────────────────────────────────────────
 *
 *   Products        ProductGet               -> mvProducts
 *   Stock levels    InventoryLocationStockGet-> mvProductStockList  (nested)
 *   Locations       InventoryLocationGet     -> mvInventoryLocations
 *   Suppliers       SupplierClientGet        -> mvSupplierClients   (filtered)
 *   Purchase orders PurchaseOrderGet         -> mvPurchaseOrders
 *
 * ── Not implemented, because Megaventory has no such operation ─────────────
 *
 *   stock-transfer    No transfer resource exists. TransferGet,
 *                     InventoryLocationTransferGet and StockTransferGet were
 *                     all probed against the live service and return no route.
 *   stock-adjustment  Likewise: StockAdjustmentGet, AdjustmentGet and
 *                     InventoryLocationStockAdjustmentGet have no route.
 *                     Megaventory records stock movement as Documents
 *                     (DocumentGet), which is a document feed rather than
 *                     adjustment records — projecting one onto the other
 *                     would invent entities.
 *
 * Both are declared in `metadata.ts` with the same reasons.
 *
 * ── Three traps this API sets ──────────────────────────────────────────────
 *
 * 1. Errors are IN-BAND on HTTP 200. A bad key answers 200 with an empty
 *    array and `ResponseStatus.ErrorCode: "500"`. The client raises on that,
 *    so an unauthenticated sync fails instead of reporting zero rows.
 * 2. The five Get operations used here do NOT PAGINATE. `ReturnTopNRecords` is
 *    a top-N limiter ordered by id descending, and none of the five takes an
 *    offset, page or cursor. (Some other operations do: BatchNumberGet and
 *    SerialNumberGet take a 1-based `Page` and a `Limit`.) Every list asks for
 *    all records and slices the caller's page from them (see `listAll`).
 * 3. Dates are .NET (`/Date(1530110485503-0000)/`) and an unset date is
 *    DateTime.MinValue, not null. Handled in `transform/shared.ts`.
 */
import {
  pageLocally,
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
import type { WebhookEvent } from '../../schema/webhook'

import {
  credentialFields as megaventoryCredentialFields,
  exchangeCredentials as megaventoryExchangeCredentials,
  getAuthUrlUnsupported,
} from './auth'
import { MegaventoryClient, type MegaventoryRequest } from './client'
import { OPERATIONS, RETURN_ALL_RECORDS, SUPPLIER_CLIENT_TYPE } from './constants'
import { verifyMegaventoryWebhook, parseMegaventoryWebhookEvents } from './webhook'

import { transformProduct, type RawMegaventoryProduct } from './transform/product'
import {
  flattenStockLevels,
  type RawMegaventoryProductStock,
} from './transform/stock-level'
import { transformLocation, type RawMegaventoryLocation } from './transform/location'
import {
  transformSupplier,
  type RawMegaventorySupplierClient,
} from './transform/supplier'
import {
  transformPurchaseOrder,
  type RawMegaventoryPurchaseOrder,
} from './transform/purchase-order'

/**
 * The order stock-level pages are cut from: product id descending, the order
 * InventoryLocationStockGet documents for its entries, then location id
 * ascending. The order of one product's `mvStock` entries is not documented
 * (the metadata example lists locations 4 then 5), so it is imposed here
 * rather than trusted to repeat from one call to the next.
 */
function stockLevelOrder(a: StockLevel, b: StockLevel): number {
  return Number(b.productId) - Number(a.productId) || Number(a.locationId) - Number(b.locationId)
}

export class MegaventoryAdapter implements InventoryAdapter {
  readonly platform = 'megaventory'
  readonly version = '1.0.0'

  credentialFields(): CredentialField[] {
    return megaventoryCredentialFields()
  }

  async exchangeCredentials(fields: Record<string, string>) {
    return megaventoryExchangeCredentials(fields)
  }

  getAuthUrl(_state: string, _scopes?: string[]): string {
    return getAuthUrlUnsupported()
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    throw new Error(
      'megaventory connects with a Megaventory API key; use credentialFields() instead of the OAuth flow.',
    )
  }

  /** An API key does not expire on a schedule, so there is nothing to refresh. */
  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return credentials
  }

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return verifyMegaventoryWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parseMegaventoryWebhookEvents(payload)
  }

  private client(credentials: Credentials): MegaventoryClient {
    return new MegaventoryClient(credentials)
  }

  /**
   * The request every list sends: all records, whatever page is asked for.
   *
   * None of the five Get operations this adapter lists from documents a page,
   * offset, skip or cursor. (BatchNumberGet and SerialNumberGet do take `Page`
   * and `Limit`; nothing here calls them.) Each of the five says the same
   * thing of its only size field, e.g. ProductGet's:
   * "Optionally, you can use ReturnTopNRecords to limit the number of the
   * results to the specified number (omit, or add ReturnTopNRecords = -1 to
   * get all the available results). The ReturnTopNRecords chooses the top
   * records in a ProductID descending order."
   * (https://api.megaventory.com/v2017a/json/metadata?op=ProductGet)
   *
   * So a limit sent as `ReturnTopNRecords` returned the same newest rows for
   * every page, and nothing past the first page was reachable. Each list
   * method fetches everything and `pageLocally` slices the caller's page and
   * reports the exact total.
   */
  private listAll(): MegaventoryRequest {
    return { ReturnTopNRecords: RETURN_ALL_RECORDS }
  }

  /** Fetch one record by its id through the operation's own id filter. */
  private byId(field: string, id: string): MegaventoryRequest {
    return {
      Filters: [{ FieldName: field, SearchOperator: 'Equals', SearchValue: id }],
      ReturnTopNRecords: 1,
    }
  }

  // ── Products ───────────────────────────────────────────────────────────────

  async listProducts(credentials: Credentials, params: QueryParams): Promise<Product[]> {
    const rows = await this.client(credentials).call<RawMegaventoryProduct>(
      OPERATIONS.product.op,
      OPERATIONS.product.key,
      this.listAll(),
    )
    return pageLocally(rows, params).map(transformProduct)
  }

  async getProduct(credentials: Credentials, id: string): Promise<Product> {
    const rows = await this.client(credentials).call<RawMegaventoryProduct>(
      OPERATIONS.product.op,
      OPERATIONS.product.key,
      this.byId('ProductID', id),
    )
    const found = rows[0]
    if (!found) throw new Error(`Megaventory product ${id} not found`)
    return transformProduct(found)
  }

  // ── Stock levels ───────────────────────────────────────────────────────────

  async listStockLevels(credentials: Credentials, params: QueryParams): Promise<StockLevel[]> {
    const rows = await this.client(credentials).call<RawMegaventoryProductStock>(
      OPERATIONS.stockLevel.op,
      OPERATIONS.stockLevel.key,
      this.listAll(),
    )
    // Sliced after flattening: the response holds one entry per product, and
    // the caller pages over (product, location) rows. Each page is a fresh
    // fetch and a page boundary can fall inside one product's locations, so
    // the rows are put in one fixed order before slicing.
    return pageLocally(rows.flatMap(flattenStockLevels).sort(stockLevelOrder), params)
  }

  /**
   * The id is the composite `${productId}:${locationId}` `listStockLevels`
   * emits, because neither half identifies a row on its own: one product is
   * held at many locations and one location holds many products.
   */
  async getStockLevel(credentials: Credentials, id: string): Promise<StockLevel> {
    const [productId, locationId] = String(id).split(':')
    if (!productId || !locationId) {
      throw new Error(
        `Megaventory stock level id '${id}' must be '<productId>:<locationId>' — the composite id listStockLevels returns.`,
      )
    }
    const rows = await this.client(credentials).call<RawMegaventoryProductStock>(
      OPERATIONS.stockLevel.op,
      OPERATIONS.stockLevel.key,
      this.byId('productid', productId),
    )
    const row = rows.flatMap(flattenStockLevels).find((r) => r.id === id)
    if (!row) throw new Error(`Megaventory stock level ${id} not found`)
    return row
  }

  // ── Locations ──────────────────────────────────────────────────────────────

  async listLocations(credentials: Credentials, params: QueryParams): Promise<Location[]> {
    const rows = await this.client(credentials).call<RawMegaventoryLocation>(
      OPERATIONS.location.op,
      OPERATIONS.location.key,
      this.listAll(),
    )
    return pageLocally(rows, params).map(transformLocation)
  }

  async getLocation(credentials: Credentials, id: string): Promise<Location> {
    const rows = await this.client(credentials).call<RawMegaventoryLocation>(
      OPERATIONS.location.op,
      OPERATIONS.location.key,
      this.byId('InventoryLocationID', id),
    )
    const found = rows[0]
    if (!found) throw new Error(`Megaventory location ${id} not found`)
    return transformLocation(found)
  }

  // ── Suppliers ──────────────────────────────────────────────────────────────

  async listSuppliers(credentials: Credentials, params: QueryParams): Promise<Supplier[]> {
    // SupplierClientGet returns customers as well. Without this filter every
    // customer in the account is imported as a supplier.
    const rows = await this.client(credentials).call<RawMegaventorySupplierClient>(
      OPERATIONS.supplier.op,
      OPERATIONS.supplier.key,
      {
        ...this.listAll(),
        Filters: [
          {
            FieldName: 'SupplierClientType',
            SearchOperator: 'Equals',
            SearchValue: SUPPLIER_CLIENT_TYPE,
          },
        ],
      },
    )
    // Filtered upstream, so the local total counts exactly the rows typed
    // 'Supplier', the one type this adapter treats as a supplier (getSupplier
    // applies the same test).
    return pageLocally(rows, params).map(transformSupplier)
  }

  async getSupplier(credentials: Credentials, id: string): Promise<Supplier> {
    const rows = await this.client(credentials).call<RawMegaventorySupplierClient>(
      OPERATIONS.supplier.op,
      OPERATIONS.supplier.key,
      this.byId('SupplierClientID', id),
    )
    const found = rows[0]
    // A record that exists but is a customer is not a supplier, and returning
    // it would let a customer be fetched through the supplier route.
    if (!found || found.SupplierClientType !== SUPPLIER_CLIENT_TYPE) {
      throw new Error(`Megaventory supplier ${id} not found`)
    }
    return transformSupplier(found)
  }

  // ── Purchase orders ────────────────────────────────────────────────────────

  async listPurchaseOrders(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<PurchaseOrder[]> {
    const rows = await this.client(credentials).call<RawMegaventoryPurchaseOrder>(
      OPERATIONS.purchaseOrder.op,
      OPERATIONS.purchaseOrder.key,
      this.listAll(),
    )
    return pageLocally(rows, params).map(transformPurchaseOrder)
  }

  async getPurchaseOrder(credentials: Credentials, id: string): Promise<PurchaseOrder> {
    const rows = await this.client(credentials).call<RawMegaventoryPurchaseOrder>(
      OPERATIONS.purchaseOrder.op,
      OPERATIONS.purchaseOrder.key,
      this.byId('PurchaseOrderId', id),
    )
    const found = rows[0]
    if (!found) throw new Error(`Megaventory purchase order ${id} not found`)
    return transformPurchaseOrder(found)
  }
}
