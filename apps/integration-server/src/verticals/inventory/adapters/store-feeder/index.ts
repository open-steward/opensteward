/**
 * StoreFeeder inventory adapter.
 *
 * StoreFeeder is a multi-channel ecommerce management platform with a
 * REST API at https://rest.storefeeder.com.
 *
 * Auth: HTTP Basic — base64(username:apiKey).
 *   API key obtained from Settings > Company > Users > User Permissions.
 *
 * Supported resources:
 *   - products       GET /products, GET /products/{id}
 *   - stock-levels   GET /products?IncludeStockLocations=true (per-location)
 *   - locations      GET /warehouses, GET /warehouses/{id}
 *   - suppliers      GET /suppliers
 *   - purchase-orders GET /purchase-orders
 *   - stock-adjustments  GET /products/{id}/productinventorylogs
 *
 * Not supported (no documented read endpoint):
 *   - stock-transfers (POST /stocklocations/create-transfers is write-only)
 *   - webhooks (no webhook capability documented)
 *
 * Schema-firewall: no product images, no supplier banking, no BOM/manufacturing.
 */
import {
  connectionScope,
  cursorPagerKey,
  pageByRows,
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
  credentialFields as storeFeedercredentialFields,
  exchangeCredentials as storeFeederExchangeCredentials,
  getAuthUrlUnsupported,
} from './auth'
import {StoreFeederClient} from './client'
import {DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE} from './constants'
import {verifyStoreFeederWebhook, parseStoreFeederWebhookEvents} from './webhook'

import {transformProduct, type RawStoreFeederProduct} from './transform/product'
import {transformStockLevel, type RawStoreFeederStockLevel} from './transform/stock-level'
import {transformLocation, type RawStoreFeederLocation} from './transform/location'
import {transformSupplier, type RawStoreFeederSupplier} from './transform/supplier'
import {transformPurchaseOrder, type RawStoreFeederPurchaseOrder} from './transform/purchase-order'
import {transformStockAdjustment, type RawStoreFeederInventoryLog} from './transform/stock-adjustment'

export interface StoreFeederAdapterConfig {
  /** Unused — StoreFeeder has no OAuth app registration. Present for interface compatibility. */
  clientId?: string
}

/** Paged response wrapper used by most list endpoints. */
interface PagedResponse<T> {
  TotalItems?: number
  TotalPages?: number
  PagingInfo?: { MaxPageSize?: number; PageSize?: number; Page?: number }
  Data?: T[]
}

/** The keys of StoreFeeder's documented paged wrapper (PagedResponseModelOf…). */
const WRAPPER_KEYS = new Set(['Data', 'PagingInfo', 'TotalItems', 'TotalPages'])

/** A documented integer total, or undefined when the body does not carry one. */
function total(value: unknown): number | undefined {
  return typeof value === 'number' ? value : undefined
}

/**
 * Every row of a list endpoint that documents no paging, for `pageLocally`.
 *
 * The documented body is a top-level array. `pageLocally` reports these rows
 * as the complete collection and a cache marks it complete on that, so any
 * other body is read only when it proves it holds every row, and otherwise
 * throws rather than being read as fewer rows (or none):
 *
 *   - a key that could hold rows this does not read: a nested record or
 *     array, such as the `{ "Warehouse": { ... } }` sample on the GET
 *     warehouses help page, or a null where one could stand
 *     (`{ "Warehouses": null }`);
 *   - ASP.NET Web API's error body, `{ "Message": "..." }` (the help pages
 *     are that framework's), which says nothing about the collection;
 *   - a `Data` wrapper whose TotalItems or TotalPages says rows exist past
 *     it, and one holding rows with neither total, which proves nothing.
 *
 * An object with no row in it and no total above zero, `{ "TotalItems": 0 }`
 * or `{ "Data": null }`, is an empty collection.
 */
function wholeCollection<T>(res: unknown, path: string): T[] {
  if (Array.isArray(res)) return res as T[]
  const refuse = (got: string): never => {
    throw new Error(
      `store-feeder GET ${path} did not return the whole collection as a JSON array (got ${got}); ` +
        'refusing to report it as complete',
    )
  }
  if (res === null || typeof res !== 'object') return refuse(res === null ? 'null' : typeof res)
  const body = res as Record<string, unknown>
  const unread = Object.keys(body).filter(
    (k) => !WRAPPER_KEYS.has(k) && (body[k] === null || typeof body[k] === 'object'),
  )
  if (unread.length > 0) return refuse(`an object holding ${unread.join(', ')}`)
  if (typeof body['Message'] === 'string') {
    return refuse(`an error body, Message ${JSON.stringify(body['Message'].slice(0, 200))}`)
  }
  const data = body['Data'] ?? []
  if (!Array.isArray(data)) return refuse('a non-array Data')
  const items = total(body['TotalItems'])
  const pages = total(body['TotalPages'])
  if ((items ?? 0) > data.length || (pages ?? 0) > 1) {
    return refuse(
      `${data.length} rows of TotalItems ${items ?? '?'} over TotalPages ${pages ?? '?'}`,
    )
  }
  if (data.length > 0 && items === undefined && pages === undefined) {
    return refuse(`${data.length} rows in Data with neither TotalItems nor TotalPages`)
  }
  return data as T[]
}

/**
 * The row pager's scope for one connection (`connectionScope`). The password
 * grant issues no refresh token, and the stored access token stays empty
 * until a client fetches one in-instance, so an access-token fingerprint
 * alone would put every connection in one scope. The fingerprint is taken
 * over the login and API key the connection holds instead, which outlive any
 * token; `connectionScope` hashes it, so neither reaches a key or a log.
 */
function pagerScope(credentials: Credentials): string {
  const extra = credentials.extra ?? {}
  const login = [extra['username'], extra['apiKey']].map((v) => String(v ?? '')).join('\u0000')
  return connectionScope('store-feeder', {
    accessToken: credentials.accessToken,
    refreshToken: login === '\u0000' ? credentials.refreshToken : login,
  })
}

/**
 * The page after `page` of a paged wrapper, or undefined after the last.
 * TotalPages decides when the body carries it; otherwise a full page may have
 * another after it, and an empty one (the pager peeks) ends the walk.
 */
function nextPage(res: PagedResponse<unknown>, page: number, rows: number): number | undefined {
  const pages = total(res.TotalPages)
  if (pages !== undefined) return page < pages ? page + 1 : undefined
  return rows >= MAX_PAGE_SIZE ? page + 1 : undefined
}

/**
 * The stock levels one product carries: one per stock location when the
 * product lists them, else one per warehouse from InventoryInformation, else
 * one product total. A product with none of these carries none.
 */
function stockLevelsOf(product: RawStoreFeederProduct): StockLevel[] {
  const levels: StockLevel[] = []
  const warehouseInfoArr = Array.isArray(product.WarehouseInformation)
    ? product.WarehouseInformation
    : product.WarehouseInformation
      ? [product.WarehouseInformation]
      : []

  for (const wi of warehouseInfoArr) {
    const stockLocs: unknown[] = Array.isArray((wi as Record<string, unknown>)['StockLocations'])
      ? ((wi as Record<string, unknown>)['StockLocations'] as unknown[])
      : []

    if (stockLocs.length === 0) {
      // Fall back to warehouse-level inventory from InventoryInformation
      const inv = product.InventoryInformation as Record<string, unknown> | undefined
      const warehouseObj = (wi as Record<string, unknown>)['Warehouse'] as
        Record<string, unknown> | undefined
      const raw: RawStoreFeederStockLevel = {
        ProductID: product.ProductID,
        ProductGUID: product.ProductGUID,
        SKU: product.SKU,
        WarehouseID: warehouseObj?.['WarehouseID'] as number | undefined,
        WarehouseName: warehouseObj?.['WarehouseName'] as string | undefined,
        Inventory: inv?.['Inventory'] as number | undefined,
        AvailableInventory: inv?.['AvailableInventory'] as number | undefined,
        Allocated: inv?.['Allocated'] as number | undefined,
        OnPurchaseOrder: inv?.['OnPurchaseOrder'] as number | undefined,
        ManualReorderLevel: (wi as Record<string, unknown>)['ManualReorderLevel'] as
          number | undefined,
      }
      levels.push(transformStockLevel(raw))
    } else {
      // ProductStockLocationModel shape:
      //   StockLocation: StockLocationBaseModel { StockLocationID, StockLocationReference }
      //   PhysicalStock:   physical quantity on hand
      //   Available:       quantity available to allocate
      //   Allocated:       quantity allocated to orders
      //   PendingOut:      quantity pending outbound transfer
      for (const loc of stockLocs) {
        const l = loc as Record<string, unknown>
        const sl = l['StockLocation'] as Record<string, unknown> | undefined
        const warehouseObj = (wi as Record<string, unknown>)['Warehouse'] as
          Record<string, unknown> | undefined
        const raw: RawStoreFeederStockLevel = {
          ProductID: product.ProductID,
          ProductGUID: product.ProductGUID,
          SKU: product.SKU,
          StockLocationID: sl?.['StockLocationID'] as number | undefined,
          StockLocationReference: sl?.['StockLocationReference'] as string | undefined,
          WarehouseID: warehouseObj?.['WarehouseID'] as number | undefined,
          Inventory: l['PhysicalStock'] as number | undefined,
          AvailableInventory: l['Available'] as number | undefined,
          Allocated: l['Allocated'] as number | undefined,
        }
        levels.push(transformStockLevel(raw))
      }
    }
  }

  // If no WarehouseInformation at all, emit one record from InventoryInformation
  if (warehouseInfoArr.length === 0 && product.InventoryInformation) {
    const inv = product.InventoryInformation as Record<string, unknown>
    const raw: RawStoreFeederStockLevel = {
      ProductID: product.ProductID,
      ProductGUID: product.ProductGUID,
      SKU: product.SKU,
      Inventory: inv['Inventory'] as number | undefined,
      AvailableInventory: inv['AvailableInventory'] as number | undefined,
      Allocated: inv['Allocated'] as number | undefined,
      OnPurchaseOrder: inv['OnPurchaseOrder'] as number | undefined,
    }
    levels.push(transformStockLevel(raw))
  }
  return levels
}

export class StoreFeederAdapter implements InventoryAdapter {
  readonly platform = 'store-feeder'
  readonly version = '0.1.0'
  /**
   * The router asks for at most this and the sync worker pages at it. Every
   * list method keeps to it: products and purchase orders send it as their
   * PageSize, stock levels are cut from pages of products by the row pager,
   * warehouses and suppliers are unpaginated and sliced locally, and stock
   * adjustments throw on the router and sync paths (neither sets the
   * productId filter they need).
   */
  readonly capabilities = { maxPageSize: MAX_PAGE_SIZE }

  constructor(_config?: StoreFeederAdapterConfig) {}

  credentialFields(): CredentialField[] {
    return storeFeedercredentialFields()
  }

  async exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
    return storeFeederExchangeCredentials(fields)
  }

  getAuthUrl(_state: string, _scopes?: string[]): string {
    return getAuthUrlUnsupported()
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    throw new Error('store-feeder uses OAuth password grant; use credentialFields() instead')
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return credentials
  }

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return verifyStoreFeederWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parseStoreFeederWebhookEvents(payload)
  }

  private client(credentials: Credentials): StoreFeederClient {
    return new StoreFeederClient(credentials)
  }

  private pageParams(params: QueryParams): Record<string, unknown> {
    return {
      PageSize: params.limit ?? DEFAULT_PAGE_SIZE,
      ...(params.page ? { Page: params.page } : {}),
    }
  }

  // ── Products ──────────────────────────────────────────────────────────────

  async listProducts(credentials: Credentials, params: QueryParams): Promise<Product[]> {
    const res = await this.client(credentials).get<PagedResponse<RawStoreFeederProduct>>(
      '/products',
      this.pageParams(params),
    )
    return (res.Data ?? []).map(transformProduct)
  }

  async getProduct(credentials: Credentials, id: string): Promise<Product> {
    const raw = await this.client(credentials).get<RawStoreFeederProduct>(`/products/${id}`)
    if (!raw?.ProductID && !raw?.ProductGUID) {
      throw new Error(`store-feeder product ${id} not found`)
    }
    return transformProduct(raw)
  }

  // ── Stock Levels ──────────────────────────────────────────────────────────
  // StoreFeeder returns per-stock-location inventory inside the product object
  // when IncludeStockLocations=true. We flatten those into StockLevel records.

  async listStockLevels(credentials: Credentials, params: QueryParams): Promise<StockLevel[]> {
    // A product carries any number of stock levels (one per stock location,
    // or none), so a page of products is not a page of stock levels: sizing
    // it by the caller's limit served a truncated or short page that was not
    // the end. Walk GET /products at the documented maximum and cut exactly
    // the caller's rows out of the flattened stream.
    const client = this.client(credentials)
    const upstream = { PageSize: MAX_PAGE_SIZE, IncludeStockLocations: true }
    const key = cursorPagerKey(pagerScope(credentials), 'stock-levels', upstream)
    const { items } = await pageByRows<StockLevel, number>(key, params, async (page = 1) => {
      const res = await client.get<PagedResponse<RawStoreFeederProduct>>('/products', {
        ...upstream,
        Page: page,
      })
      const products = res.Data ?? []
      return { items: products.flatMap(stockLevelsOf), next: nextPage(res, page, products.length) }
    })
    return items
  }

  async getStockLevel(_credentials: Credentials, id: string): Promise<StockLevel> {
    throw new Error(`store-feeder stock-level fetch is bulk-only; call listStockLevels. id=${id}`)
  }

  // ── Locations (Warehouses) ────────────────────────────────────────────────

  async listLocations(credentials: Credentials, params: QueryParams): Promise<Location[]> {
    // GET /warehouses is unpaginated: "Returns a list of Warehouses", URI
    // Parameters "None.", "Collection of WarehouseModel"
    // (https://rest.storefeeder.com/Help/Api/GET-warehouses). Every request
    // returns every warehouse, so the caller's page is sliced here.
    const res = await this.client(credentials).get<unknown>('/warehouses')
    return pageLocally(
      wholeCollection<RawStoreFeederLocation>(res, '/warehouses').map(transformLocation),
      params,
    )
  }

  async getLocation(credentials: Credentials, id: string): Promise<Location> {
    const raw = await this.client(credentials).get<RawStoreFeederLocation>(`/warehouses/${id}`)
    if (!raw?.WarehouseID && !raw?.WarehouseGuid) {
      throw new Error(`store-feeder warehouse ${id} not found`)
    }
    return transformLocation(raw)
  }

  // ── Suppliers ─────────────────────────────────────────────────────────────

  async listSuppliers(credentials: Credentials, params: QueryParams): Promise<Supplier[]> {
    // GET /suppliers is unpaginated: "Get all suppliers.", URI Parameters
    // "None.", "Collection of SupplierGetModel"
    // (https://rest.storefeeder.com/Help/Api/GET-suppliers). Every request
    // returns every supplier, so the caller's page is sliced here.
    const res = await this.client(credentials).get<unknown>('/suppliers')
    return pageLocally(
      wholeCollection<RawStoreFeederSupplier>(res, '/suppliers').map(transformSupplier),
      params,
    )
  }

  async getSupplier(credentials: Credentials, id: string): Promise<Supplier> {
    const raw = await this.client(credentials).get<RawStoreFeederSupplier>(`/suppliers/${id}`)
    if (!raw?.SupplierID && !raw?.SupplierGUID) {
      throw new Error(`store-feeder supplier ${id} not found`)
    }
    return transformSupplier(raw)
  }

  // ── Purchase Orders ───────────────────────────────────────────────────────

  async listPurchaseOrders(credentials: Credentials, params: QueryParams): Promise<PurchaseOrder[]> {
    const res = await this.client(credentials).get<PagedResponse<RawStoreFeederPurchaseOrder>>(
      '/purchase-orders',
      this.pageParams(params),
    )
    return (res.Data ?? []).map(transformPurchaseOrder)
  }

  async getPurchaseOrder(credentials: Credentials, id: string): Promise<PurchaseOrder> {
    // StoreFeeder doesn't document a GET /purchase-orders/{id} endpoint;
    // fall back to filtering the list by PurchaseOrderID.
    const res = await this.client(credentials).get<PagedResponse<RawStoreFeederPurchaseOrder>>(
      '/purchase-orders',
      { PurchaseOrderRef: id, PageSize: 1 },
    )
    const item = res.Data?.[0]
    if (!item) throw new Error(`store-feeder purchase order ${id} not found`)
    return transformPurchaseOrder(item)
  }

  // ── Stock Adjustments (via inventory logs) ────────────────────────────────
  // There is no global "list all adjustments" endpoint; we must fetch per-product.
  // listStockAdjustments accepts params.productId via QueryParams.filter.

  async listStockAdjustments(credentials: Credentials, params: QueryParams): Promise<import('../../schema/stock-adjustment').StockAdjustment[]> {
    const productId = (params as QueryParams & { filter?: Record<string, unknown> }).filter?.['productId']
    if (!productId) {
      throw new Error(
        'store-feeder listStockAdjustments requires params.filter.productId — the API is per-product only',
      )
    }
    const res = await this.client(credentials).get<PagedResponse<RawStoreFeederInventoryLog>>(
      `/products/${productId}/productinventorylogs`,
      this.pageParams(params),
    )
    return (res.Data ?? []).map(transformStockAdjustment)
  }

  async getStockAdjustment(_credentials: Credentials, id: string): Promise<import('../../schema/stock-adjustment').StockAdjustment> {
    throw new Error(`store-feeder stock-adjustment fetch-by-id not supported; call listStockAdjustments with productId filter. id=${id}`)
  }

  // ── Stock Transfers ───────────────────────────────────────────────────────
  // StoreFeeder only has a write endpoint (POST /stocklocations/create-transfers).
  // No list/read endpoint is documented.

  async listStockTransfers(_credentials: Credentials, _params: QueryParams): Promise<import('../../schema/stock-transfer').StockTransfer[]> {
    throw new Error('store-feeder does not provide a stock-transfer read endpoint')
  }

  async getStockTransfer(_credentials: Credentials, id: string): Promise<import('../../schema/stock-transfer').StockTransfer> {
    throw new Error(`store-feeder does not provide a stock-transfer read endpoint. id=${id}`)
  }
}
