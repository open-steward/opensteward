/**
 * Erplain adapter — inventory vertical.
 *
 * Erplain is a B2B inventory and order management SaaS for small businesses.
 * Transport: the v2 GraphQL API, one endpoint, https://api.erplain.app/graphql
 * ("GraphQL (and therefore our API) only uses **one** endpoint",
 * https://erplain.readme.io/v2.0/reference/setup), authenticated with a
 * personal bearer token ("You will then receive a **bearer token**", same page).
 *
 * Paging: every plural query used here takes `first` and `page` and returns a
 * `*Paginator { paginatorInfo, data }`
 * (https://erplain.readme.io/v2.0/reference/pagination):
 *   | page  | Page number                 | int  | 1             |
 *   | first | Number of results to return | int  | 50 (max: 250) |
 *   | hasMorePages | Are there more pages after this one? | bool |
 *   | total        | Number of total available items.     | int  |
 *
 * Schema-firewall: no product images, no supplier banking details.
 * Not supported: stock transfers, stock adjustments, webhooks.
 */
import {
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

import {
  credentialFields as erplainCredentialFields,
  exchangeCredentials as erplainExchangeCredentials,
  getAuthUrlUnsupported,
} from './auth'
import { ErplainClient } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

import { transformProduct, type RawErplainProduct } from './transform/product'
import { transformStockLevel, type RawErplainStockLevel } from './transform/stock-level'
import { transformLocation, type RawErplainLocation } from './transform/location'
import { transformSupplier, type RawErplainSupplier } from './transform/supplier'
import { transformPurchaseOrder, type RawErplainPurchase } from './transform/purchase-order'

// ── Selections (documented fields only; see each transform) ────────────────

const PRODUCT_FIELDS = `id label active sku type description supplier_description
  country_of_origin default_supplier_id brand { label } created_at updated_at`

const STOCK_LEVEL_FIELDS = `id on_hand available incoming reserved reorder_point
  bin_location to_reorder location { id label } variant { id sku product { id } }`

const LOCATION_FIELDS = `id label active type phone shipping_cost
  address { address_1 address_2 city state postal_code country }`

const SUPPLIER_FIELDS = `id label email phone active supplier_number currency { label }`

const PURCHASE_FIELDS = `id label status delivery_status dated_at shipping_at created_at
  subtotal total location_label currency { label } supplier { id }
  line_items { id quantity variant { id product { id } } }`

/** `paginatorInfo`, https://erplain.readme.io/v2.0/reference/pagination. */
interface PaginatorInfo {
  currentPage?: number
  hasMorePages?: boolean
  total?: number
}

interface Paginator<T> {
  paginatorInfo?: PaginatorInfo | null
  data?: T[] | null
}

export interface ErplainAdapterConfig {
  // No OAuth — config is a no-op placeholder for interface parity.
  _unused?: never
}

export class ErplainAdapter implements InventoryAdapter {
  readonly platform = 'erplain'
  readonly version = '0.2.0'
  /** "50 (max: 250)" — https://erplain.readme.io/v2.0/reference/pagination. */
  readonly capabilities = { maxPageSize: MAX_PAGE_SIZE }

  constructor(_config?: ErplainAdapterConfig) {}

  credentialFields(): CredentialField[] {
    return erplainCredentialFields()
  }

  async exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
    return erplainExchangeCredentials(fields)
  }

  getAuthUrl(_state: string, _scopes?: string[]): string {
    return getAuthUrlUnsupported()
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    throw new Error('erplain uses a personal bearer token; use credentialFields() instead')
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return credentials
  }

  private client(credentials: Credentials): ErplainClient {
    return new ErplainClient(credentials)
  }

  /**
   * One upstream page per caller page: `page` is Erplain's 1-based page
   * number (default 1) and `first` the caller's limit, clamped to the
   * documented 250. The end comes from `paginatorInfo.hasMorePages`.
   *
   * Every walk is ordered by id so page N is stable across calls. Each list
   * page documents `id` as a sort field ("You can sort results using the
   * `orderBy` parameter: * `id`"; Locations: "You can sort data based on
   * following fields: id, label, active"), and locations-queries shows the
   * inline form `orderBy: [{ column: LABEL, order: ASC }]`.
   */
  private async listPage<T>(
    credentials: Credentials,
    params: QueryParams,
    root: 'Products' | 'StockLevels' | 'Locations' | 'Suppliers' | 'Purchases',
    fields: string,
  ): Promise<T[]> {
    const limit = params.limit ?? DEFAULT_PAGE_SIZE
    const first = Math.min(limit, MAX_PAGE_SIZE)
    const page = Math.max(params.page ?? 1, 1)
    const data = await this.client(credentials).query<Record<string, Paginator<T> | null>>(
      `query List${root}($first: Int!, $page: Int) {
        ${root}(first: $first, page: $page, orderBy: [{ column: ID, order: ASC }]) {
          paginatorInfo { currentPage hasMorePages total }
          data { ${fields} }
        }
      }`,
      { first, page },
    )
    const result = data[root]
    const info = result?.paginatorInfo
    reportUpstreamPage(params, {
      ...(first < limit ? { pageSize: first } : {}),
      ...(typeof info?.hasMorePages === 'boolean' ? { hasMore: info.hasMorePages } : {}),
      ...(typeof info?.total === 'number' ? { totalCount: info.total } : {}),
      ...(typeof info?.currentPage === 'number' ? { currentPage: info.currentPage } : {}),
    })
    return result?.data ?? []
  }

  private async getOne<T>(
    credentials: Credentials,
    root: 'Product' | 'Location' | 'Supplier' | 'Purchase',
    fields: string,
    id: string,
  ): Promise<T> {
    const data = await this.client(credentials).query<Record<string, T | null>>(
      `query Get${root}($id: ID) { ${root}(id: $id) { ${fields} } }`,
      { id },
    )
    const row = data[root]
    if (!row) {
      throw Object.assign(new Error(`erplain ${root} ${id} not found`), { statusCode: 404 })
    }
    return row
  }

  // ── Products ──────────────────────────────────────────────────────────────

  /** `Products(first, page)`, https://erplain.readme.io/v2.0/reference/products-queries. */
  async listProducts(credentials: Credentials, params: QueryParams): Promise<Product[]> {
    const rows = await this.listPage<RawErplainProduct>(
      credentials,
      params,
      'Products',
      PRODUCT_FIELDS,
    )
    return rows.map(transformProduct)
  }

  /** `Product(id)` — "Returns a single product by `id`". */
  async getProduct(credentials: Credentials, id: string): Promise<Product> {
    return transformProduct(
      await this.getOne<RawErplainProduct>(credentials, 'Product', PRODUCT_FIELDS, id),
    )
  }

  // ── Stock levels ──────────────────────────────────────────────────────────

  /** `StockLevels(first, page)`, https://erplain.readme.io/v2.0/reference/stock-levels-queries. */
  async listStockLevels(credentials: Credentials, params: QueryParams): Promise<StockLevel[]> {
    const rows = await this.listPage<RawErplainStockLevel>(
      credentials,
      params,
      'StockLevels',
      STOCK_LEVEL_FIELDS,
    )
    return rows.map(transformStockLevel)
  }

  /**
   * "Querying a single `StockLevel` by ID is not publicly supported. Use this
   * query to retrieve inventory levels." So this reads one row of
   * `StockLevels` through its documented `id` filter,
   * `{ "column": "ID", "operator": "EQ", "value": 200050 }`
   * (https://erplain.readme.io/v2.0/reference/stock-levels-queries, "Filters").
   */
  async getStockLevel(credentials: Credentials, id: string): Promise<StockLevel> {
    // StockLevel.id is an Int ("Unique identifier.", same page).
    if (!/^\d+$/.test(id)) {
      throw Object.assign(new Error(`erplain StockLevel ${id} not found`), { statusCode: 404 })
    }
    const data = await this.client(credentials).query<{
      StockLevels?: Paginator<RawErplainStockLevel> | null
    }>(
      `query GetStockLevel($where: QueryStockLevelsWhereWhereConditions) {
        StockLevels(first: 1, page: 1, where: $where) {
          data { ${STOCK_LEVEL_FIELDS} }
        }
      }`,
      { where: { column: 'ID', operator: 'EQ', value: Number(id) } },
    )
    const row = data.StockLevels?.data?.[0]
    if (!row) {
      throw Object.assign(new Error(`erplain StockLevel ${id} not found`), { statusCode: 404 })
    }
    return transformStockLevel(row)
  }

  // ── Locations ─────────────────────────────────────────────────────────────

  /**
   * `Locations`, https://erplain.readme.io/v2.0/reference/locations-queries.
   * The page's example omits paging arguments; the live schema declares
   * `Locations(..., first: Int! = 50, page: Int, ...): LocationPaginator`,
   * the same paging as every other plural query.
   */
  async listLocations(credentials: Credentials, params: QueryParams): Promise<Location[]> {
    const rows = await this.listPage<RawErplainLocation>(
      credentials,
      params,
      'Locations',
      LOCATION_FIELDS,
    )
    return rows.map(transformLocation)
  }

  /** `Location(id)` — "Returns a single location based on the `id` provided". */
  async getLocation(credentials: Credentials, id: string): Promise<Location> {
    return transformLocation(
      await this.getOne<RawErplainLocation>(credentials, 'Location', LOCATION_FIELDS, id),
    )
  }

  // ── Suppliers ─────────────────────────────────────────────────────────────

  /** `Suppliers(first, page)`, https://erplain.readme.io/v2.0/reference/suppliers-queries. */
  async listSuppliers(credentials: Credentials, params: QueryParams): Promise<Supplier[]> {
    const rows = await this.listPage<RawErplainSupplier>(
      credentials,
      params,
      'Suppliers',
      SUPPLIER_FIELDS,
    )
    return rows.map(transformSupplier)
  }

  /** `Supplier(id)` — "Returns a single supplier by `id`". */
  async getSupplier(credentials: Credentials, id: string): Promise<Supplier> {
    return transformSupplier(
      await this.getOne<RawErplainSupplier>(credentials, 'Supplier', SUPPLIER_FIELDS, id),
    )
  }

  // ── Purchase orders ───────────────────────────────────────────────────────

  /** `Purchases(first, page)`, https://erplain.readme.io/v2.0/reference/purchases-queries. */
  async listPurchaseOrders(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<PurchaseOrder[]> {
    const rows = await this.listPage<RawErplainPurchase>(
      credentials,
      params,
      'Purchases',
      PURCHASE_FIELDS,
    )
    return rows.map(transformPurchaseOrder)
  }

  /** `Purchase(id)` — "Returns a single purchase order by `id`". */
  async getPurchaseOrder(credentials: Credentials, id: string): Promise<PurchaseOrder> {
    return transformPurchaseOrder(
      await this.getOne<RawErplainPurchase>(credentials, 'Purchase', PURCHASE_FIELDS, id),
    )
  }
}
