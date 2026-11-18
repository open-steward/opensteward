/**
 * Billbee adapter — inventory vertical.
 *
 * Billbee is a multi-channel e-commerce management platform (Germany).
 * Auth: X-Billbee-Api-Key header + HTTP Basic Auth (username + API password).
 * Base URL: https://app.billbee.io/api/v1
 *
 * Supported resources:
 *   - products  (GET /products, GET /products/{id})
 *   - stock-levels  (derived from product Stocks[] array)
 *   - locations  (GET /products/stocks — warehouse definitions)
 *
 * Not supported (no Billbee REST endpoints exist):
 *   - suppliers, purchase-orders, stock-transfers, stock-adjustments
 *
 * Schema-firewall: no product images, no BOM, no order data.
 *
 * ── Resource coverage ──────────────────────────────────────────────
 * Unavailable: purchase-order   — Billbee REST API has no purchase-order endpoints; inbound procurement is not part of the platform API
 * Unavailable: stock-adjustment — Billbee REST API exposes only write-only stock update endpoints (POST /products/updatestock); no GET endpoint exists for listing or retrieving stock adjustment history
 * Unavailable: stock-transfer   — Billbee REST API has no stock-transfer endpoints; warehouse-to-warehouse transfers are not exposed via the API
 * Unavailable: supplier         — Billbee REST API has no supplier endpoints; vendor/supplier management is not part of the platform API
 */
import {
  connectionScope,
  cursorPagerKey,
  pageByRows,
  pageLocally,
  reportUpstreamPage,
  type UpstreamPageMeta,
} from '@opensteward/shared'
import type { CredentialField, Credentials, QueryParams } from '@opensteward/shared'
import type { InventoryAdapter } from '../../adapter/interface'
import type { Product } from '../../schema/product'
import type { StockLevel } from '../../schema/stock-level'
import type { Location } from '../../schema/location'

import {
  credentialFields as billbeeCredentialFields,
  exchangeCredentials as billbeeExchangeCredentials,
  getAuthUrlUnsupported,
} from './auth'
import {BillbeeClient} from './client'
import {DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE} from './constants'

import {transformProduct, type RawBillbeeProduct, type BillbeeStockArticle} from './transform/product'
import {transformStockLevel, type RawBillbeeStockEntry} from './transform/stock-level'
import {transformLocation, type RawBillbeeLocation} from './transform/location'

export interface BillbeeAdapterConfig {
  /** Not used — Billbee uses API key + Basic Auth, no OAuth client. */
  [key: string]: unknown
}

/** The status fields every Billbee response carries beside its Data. */
interface BillbeeStatus {
  ErrorCode?: number
  ErrorMessage?: string | null
}

/** Billbee's ApiPagedResult `PagingInformation` block. */
interface BillbeePaging {
  /** "Currently delivered page". */
  Page?: number
  /** "Total count of pages available with the given PageSize". */
  TotalPages?: number
  /** "Total count of available datasets". */
  TotalRows?: number
  PageSize?: number
}

/**
 * Billbee paged response wrapper: { Paging: {...}, Data: T[], ErrorCode, ErrorMessage }
 */
interface BillbeePagedResponse<T> extends BillbeeStatus {
  Data?: T[]
  Paging?: BillbeePaging
}

/**
 * Single-item Billbee response: { Data: T, ErrorCode, ErrorMessage }
 */
interface BillbeeSingleResponse<T> extends BillbeeStatus {
  Data?: T
}

/**
 * Throw when a 200 response carries a Billbee failure.
 *
 * Billbee reports some failures in the body of a 200. Its own SDK counts a
 * result as a success only when `ErrorCode` is 0 (`NoError`) and
 * `ErrorMessage` is blank (`ApiResult.Success` in billbeeio/billbee-csharp-sdk).
 * Such a body has no `Data`, and read as data it looked like an empty list,
 * which a list method then reported as a whole collection of 0 rows.
 */
function assertBillbeeOk<T extends BillbeeStatus>(res: T, what: string): T {
  const code = res.ErrorCode
  const message = typeof res.ErrorMessage === 'string' ? res.ErrorMessage.trim() : ''
  if ((typeof code === 'number' && code !== 0) || message !== '') {
    const detail = message !== '' ? `: ${message}` : ''
    throw new Error(`billbee: ${what} failed with ErrorCode ${code ?? 'unknown'}${detail}`)
  }
  return res
}

/**
 * Whether more pages follow page `asked`, and the total, as Billbee's Paging
 * block states them. Judged from the page the adapter asked for rather than the
 * echoed `Page`, so a page past the end never reads as having more. Nothing is
 * reported for a field the block lacks: an unknown end stays unknown.
 */
function pagingMeta(paging: BillbeePaging | undefined, asked: number): UpstreamPageMeta {
  const meta: UpstreamPageMeta = {}
  if (typeof paging?.TotalPages === 'number') meta.hasMore = asked < paging.TotalPages
  if (typeof paging?.TotalRows === 'number') meta.totalCount = paging.TotalRows
  return meta
}

/**
 * One stock-level row per entry of each product's Stocks[], or one aggregate
 * row for a product with none. Products without an Id are skipped.
 */
function flattenStockLevels(products: readonly RawBillbeeProduct[]): StockLevel[] {
  const levels: StockLevel[] = []
  for (const product of products) {
    const productId = String(product.Id ?? '')
    if (!productId) continue
    const stocks: BillbeeStockArticle[] = product.Stocks ?? []
    if (stocks.length === 0) {
      // Product has no per-warehouse breakdown; emit a single aggregate entry
      const entry: RawBillbeeStockEntry = {
        productId,
        StockId: 0,
        Name: 'default',
        StockCurrent: product.StockCurrent,
        StockDesired: product.StockDesired,
        StockWarning: product.StockWarning,
      }
      levels.push(transformStockLevel(entry))
    } else {
      for (const s of stocks) {
        const entry: RawBillbeeStockEntry = { productId, ...s }
        levels.push(transformStockLevel(entry))
      }
    }
  }
  return levels
}

export class BillbeeAdapter implements InventoryAdapter {
  readonly platform = 'billbee'
  readonly version = '0.1.0'

  /**
   * GET /api/v1/products documents `pageSize` as "Values between 1 and 250
   * are allowed". Every list method keeps the promise this declaration makes:
   * listProducts pages at the size asked and reports Billbee's own end,
   * listStockLevels cuts its rows out of product pages with `pageByRows`, and
   * listLocations slices a whole-collection fetch with `pageLocally`.
   */
  readonly capabilities = { maxPageSize: MAX_PAGE_SIZE }

  constructor(_config: BillbeeAdapterConfig = {}) {}

  credentialFields(): CredentialField[] {
    return billbeeCredentialFields()
  }

  async exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
    return billbeeExchangeCredentials(fields)
  }

  getAuthUrl(_state: string, _scopes?: string[]): string {
    return getAuthUrlUnsupported()
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    throw new Error('billbee uses API key + Basic Auth; use credentialFields() instead')
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return credentials
  }

  private client(credentials: Credentials): BillbeeClient {
    return new BillbeeClient(credentials)
  }

  /**
   * Pager scope for one connection. The API key identifies the developer's
   * application, not the Billbee account ("a Billbee API Key identifying the
   * application you develop"), so every connection made through one
   * deployment shares it. The account is the Billbee username, and the
   * fingerprint covers the key and the API password together, so the row
   * pager never serves one connection's rows to another.
   */
  private pagerScope(credentials: Credentials): string {
    const username = String(credentials.extra?.['username'] ?? '')
    const apiPassword = String(credentials.extra?.['apiPassword'] ?? '')
    return connectionScope(`billbee:${username}`, {
      accessToken: `${credentials.accessToken}\u0000${apiPassword}`,
    })
  }

  // ── Products ──────────────────────────────────────────────────────────────

  async listProducts(credentials: Credentials, params: QueryParams): Promise<Product[]> {
    const page = params.page ?? 1
    const pageSize = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
    const res = assertBillbeeOk(
      await this.client(credentials).get<BillbeePagedResponse<RawBillbeeProduct>>('/products', {
        page,
        pageSize,
      }),
      'GET /products',
    )
    // The router caps `limit` at the declared 250. A direct call above it is
    // sent as 250, and reports that size so the page is judged at it.
    const sentLess = typeof params.limit === 'number' && pageSize < params.limit
    reportUpstreamPage(params, {
      ...pagingMeta(res.Paging, page),
      ...(sentLess ? { pageSize } : {}),
    })
    return (res.Data ?? []).map(transformProduct)
  }

  async getProduct(credentials: Credentials, id: string): Promise<Product> {
    const res = await this.client(credentials).get<BillbeeSingleResponse<RawBillbeeProduct>>(
      `/products/${id}`,
    )
    if (!res.Data) throw new Error(`billbee: product ${id} not found`)
    return transformProduct(res.Data)
  }

  // ── Stock Levels ──────────────────────────────────────────────────────────
  //
  // Billbee does not have a dedicated stock-level list endpoint.
  // Stock per warehouse is embedded in each product's Stocks[] array.
  // We expand all products and flatten their per-warehouse entries.

  /**
   * A page of products flattened into stock levels holds one row per warehouse
   * per product, so it is not one caller page. Served as it came, a
   * page of `limit` products gave more than `limit` rows, the router cut the
   * surplus, and the next page started at the next products: those rows were
   * never served. `pageByRows` cuts exactly rows [(page-1)×limit, page×limit)
   * out of the flattened stream and reports `hasMore`.
   *
   * Upstream pages are always the documented maximum of 250 products, so the
   * key carries that size and not the caller's limit, and walks at any limit
   * share one set of positions.
   */
  async listStockLevels(credentials: Credentials, params: QueryParams): Promise<StockLevel[]> {
    const client = this.client(credentials)
    const { items } = await pageByRows<StockLevel, number>(
      cursorPagerKey(this.pagerScope(credentials), '/products#stock-levels', {
        pageSize: MAX_PAGE_SIZE,
      }),
      params,
      async (cursor) => {
        const page = cursor ?? 1
        const res = assertBillbeeOk(
          await client.get<BillbeePagedResponse<RawBillbeeProduct>>('/products', {
            page,
            pageSize: MAX_PAGE_SIZE,
          }),
          'GET /products',
        )
        const products = res.Data ?? []
        // Billbee's Paging block decides. Without it, only a full page can
        // have more after it.
        const more = pagingMeta(res.Paging, page).hasMore ?? products.length >= MAX_PAGE_SIZE
        return { items: flattenStockLevels(products), next: more ? page + 1 : undefined }
      },
      { defaultLimit: DEFAULT_PAGE_SIZE },
    )
    return items
  }

  async getStockLevel(_credentials: Credentials, id: string): Promise<StockLevel> {
    throw new Error(`billbee: stock-level fetch is derived from product data; call listStockLevels. id=${id}`)
  }

  // ── Locations (warehouses) ────────────────────────────────────────────────

  async listLocations(credentials: Credentials, params: QueryParams): Promise<Location[]> {
    // GET /products/stocks ("Query all defined stock locations") takes no
    // parameters and returns every location in one ApiResult, with no Paging
    // block. Paged locally so page 2 is the next slice, not page 1 again.
    return pageLocally(await this.fetchAllLocations(credentials), params)
  }

  private async fetchAllLocations(credentials: Credentials): Promise<Location[]> {
    const res = assertBillbeeOk(
      await this.client(credentials).get<BillbeeSingleResponse<RawBillbeeLocation[]>>(
        '/products/stocks',
      ),
      'GET /products/stocks',
    )
    return (res.Data ?? []).map(transformLocation)
  }

  async getLocation(credentials: Credentials, id: string): Promise<Location> {
    // Searches the whole list: a sliced page would miss ids past the first.
    const all = await this.fetchAllLocations(credentials)
    const found = all.find((l) => l.id === id)
    if (!found) throw new Error(`billbee: location ${id} not found`)
    return found
  }
}
