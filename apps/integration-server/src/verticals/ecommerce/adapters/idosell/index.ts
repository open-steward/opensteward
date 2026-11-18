/**
 * IdoSell adapter for the ecommerce vertical.
 *
 * Maps the IdoSell Admin REST API (v8, `X-API-KEY` header — see
 * `./connect-form.ts`) to the canonical ecommerce resources. All doc URLs
 * cited here are `https://idosell.readme.io/reference/<slug>` unless noted.
 *
 * Every list method accepts only `{ page, limit }`: `page` (1-indexed, the
 * canonical convention) maps to IdoSell's 0-indexed `resultsPage`, `limit`
 * clamps to IdoSell's documented 1–100 (`resultsLimit`/`results_limit`).
 *
 * Resources with no verified shape are declared unavailable in
 * `./metadata.ts` rather than implemented by analogy — see that file for
 * the specific endpoints checked and why each was insufficient.
 */

import type { Credentials, QueryParams } from '@opensteward/shared'
import { reportUpstreamPage } from '@opensteward/shared'
import type { EcommerceAdapter } from '../../adapter/interface'
import type { Product } from '../../schema/product'
import type { Collection } from '../../schema/collection'
import type { Location } from '../../schema/location'
import type { InventoryLevel } from '../../schema/inventory'
import type { Customer } from '../../schema/customer'
import type { Order } from '../../schema/order'
import type { Refund } from '../../schema/refund'

import { CONNECT_FORM } from './connect-form'
import { buildAuthUrl, exchangeCode as idosellExchangeCode } from './auth'
import { IdosellClient } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, CANCELLED_ORDER_STATUS } from './constants'

import {
  transformProduct,
  untransformProduct,
  type RawIdosellProduct,
} from './transform/product'
import {
  transformCollection,
  untransformCollection,
  type RawIdosellCategory,
} from './transform/collection'
import {
  transformClient,
  untransformClientForUpdate,
  type RawIdosellClient,
} from './transform/customer'
import { transformOrder, untransformOrderStatus, type RawIdosellOrder } from './transform/order'
import { transformRefund, untransformRefund, type RawIdosellReturn } from './transform/refund'
import { transformLocation, type RawIdosellWmsLocation } from './transform/location'
import { extractInventoryLevels } from './transform/inventory'

export class IdosellAdapter implements EcommerceAdapter {
  readonly platform = 'idosell'
  readonly version = '0.1.0'
  readonly capabilities = { maxPageSize: MAX_PAGE_SIZE }

  credentialFields = CONNECT_FORM.credentialFields
  exchangeCredentials = CONNECT_FORM.exchangeCredentials

  // ── Auth ──────────────────────────────────────────────────────────────────

  getAuthUrl(_state: string): string {
    // No OAuth authorize URL exists for this flow — informational only, see ./auth.ts.
    return buildAuthUrl('your-shop.idosell.com')
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    return idosellExchangeCode()
  }

  /** IdoSell Admin API keys are not documented to expire or rotate. */
  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return credentials
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private client(credentials: Credentials): IdosellClient {
    return new IdosellClient(credentials)
  }

  /** Canonical 1-indexed `{page, limit}` → IdoSell's 0-indexed resultsPage/resultsLimit. */
  private page(params: QueryParams): { resultsPage: number; resultsLimit: number } {
    const resultsLimit = Math.min(Math.max(params.limit ?? DEFAULT_PAGE_SIZE, 1), MAX_PAGE_SIZE)
    const resultsPage = Math.max((params.page ?? 1) - 1, 0)
    return { resultsPage, resultsLimit }
  }

  private reportPage(
    params: QueryParams,
    res: { totalCount?: number; currentPage?: number; limit?: number },
  ): void {
    const hasMore =
      res.totalCount != null && res.limit != null && res.currentPage != null
        ? (res.currentPage + 1) * res.limit < res.totalCount
        : undefined
    reportUpstreamPage(params, { totalCount: res.totalCount, currentPage: res.currentPage, hasMore })
  }

  /** `style: form, explode: false` array query params are comma-joined, per
   *  every id-batch parameter's OpenAPI fragment (productIds, clientsIds,
   *  ids, ordersIds, return_ids, …) — never repeated keys or JSON. */
  private static csv(ids: Array<string | number>): string {
    return ids.join(',')
  }

  // ── Products (productsproductsget / productsproductssearchpost / productsproductsput / productsproductspost / productsproductsdeletepost) ──

  async listProducts(credentials: Credentials, params: QueryParams): Promise<Product[]> {
    const { resultsPage, resultsLimit } = this.page(params)
    const res = await this.client(credentials).listSearch<RawIdosellProduct>(
      '/products/products/search',
      {},
      resultsPage,
      resultsLimit,
      'results',
    )
    this.reportPage(params, res)
    return res.items.map((p) => transformProduct(p))
  }

  async getProduct(credentials: Credentials, id: string): Promise<Product> {
    const res = await this.client(credentials).get<{ results?: RawIdosellProduct[] }>(
      '/products/products',
      { productIds: IdosellAdapter.csv([id]) },
    )
    const raw = res.results?.[0]
    if (!raw) throw new Error(`IdoSell product ${id} not found`)
    return transformProduct(raw)
  }

  async createProduct(credentials: Credentials, data: Partial<Product>): Promise<Product> {
    const client = this.client(credentials)
    const res = await client.post<{ results?: { productsResults?: Array<{ productId: number }> } }>(
      '/products/products',
      { params: { products: [untransformProduct(data)] } },
    )
    const productId = res.results?.productsResults?.[0]?.productId
    if (productId == null) throw new Error('IdoSell did not return a productId for the created product')
    return this.getProduct(credentials, String(productId))
  }

  async updateProduct(
    credentials: Credentials,
    id: string,
    data: Partial<Product>,
  ): Promise<Product> {
    const client = this.client(credentials)
    await client.put('/products/products', {
      params: { products: [{ ...untransformProduct(data), productId: Number(id) }] },
    })
    return this.getProduct(credentials, id)
  }

  async deleteProduct(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).post('/products/products/delete', {
      params: { products: [{ productId: Number(id) }] },
    })
  }

  // ── Collections (productscategoriesget / productscategoriesput) ────────────

  async listCollections(credentials: Credentials, params: QueryParams): Promise<Collection[]> {
    const { resultsPage, resultsLimit } = this.page(params)
    const res = await this.client(credentials).listGet<RawIdosellCategory>(
      '/products/categories',
      {},
      resultsPage,
      resultsLimit,
      'categories',
    )
    this.reportPage(params, res)
    return res.items.map((c) => transformCollection(c))
  }

  async getCollection(credentials: Credentials, id: string): Promise<Collection> {
    const res = await this.client(credentials).get<{ categories?: RawIdosellCategory[] }>(
      '/products/categories',
      { ids: IdosellAdapter.csv([id]) },
    )
    const raw = res.categories?.[0]
    if (!raw) throw new Error(`IdoSell category ${id} not found`)
    return transformCollection(raw)
  }

  async createCollection(
    credentials: Credentials,
    data: Partial<Collection>,
  ): Promise<Collection> {
    const client = this.client(credentials)
    const res = await client.put<{ result?: { categories?: Array<{ id: number }> } }>(
      '/products/categories',
      { params: { categories: [{ ...untransformCollection(data), operation: 'add' }] } },
    )
    const id = res.result?.categories?.[0]?.id
    if (id == null) throw new Error('IdoSell did not return an id for the created category')
    return this.getCollection(credentials, String(id))
  }

  async updateCollection(
    credentials: Credentials,
    id: string,
    data: Partial<Collection>,
  ): Promise<Collection> {
    const client = this.client(credentials)
    await client.put('/products/categories', {
      params: {
        categories: [{ ...untransformCollection(data), id: Number(id), operation: 'edit' }],
      },
    })
    return this.getCollection(credentials, id)
  }

  async deleteCollection(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).put('/products/categories', {
      params: { categories: [{ id: Number(id), operation: 'del' }] },
    })
  }

  // ── Locations (wmslocationsget) ─────────────────────────────────────────────

  async listLocations(credentials: Credentials, params: QueryParams): Promise<Location[]> {
    const { resultsPage, resultsLimit } = this.page(params)
    const res = await this.client(credentials).listGet<RawIdosellWmsLocation>(
      '/wms/locations',
      {},
      resultsPage,
      resultsLimit,
      'results',
    )
    this.reportPage(params, res)
    return res.items.map(transformLocation)
  }

  async getLocation(credentials: Credentials, id: string): Promise<Location> {
    const res = await this.client(credentials).get<{ results?: RawIdosellWmsLocation[] }>(
      '/wms/locations',
      { locationId: id },
    )
    const raw = res.results?.[0]
    if (!raw) throw new Error(`IdoSell WMS location ${id} not found`)
    return transformLocation(raw)
  }

  // ── Inventory (embedded productStocksData — see transform/inventory.ts) ────

  async listInventoryLevels(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<InventoryLevel[]> {
    const { resultsPage, resultsLimit } = this.page(params)
    const res = await this.client(credentials).listSearch<RawIdosellProduct>(
      '/products/products/search',
      {},
      resultsPage,
      resultsLimit,
      'results',
    )
    this.reportPage(params, res)
    return res.items.flatMap((p) =>
      extractInventoryLevels(
        String(p.productId),
        p.productStocksData,
        p.productModificationTime,
      ),
    )
  }

  async getInventoryLevel(credentials: Credentials, id: string): Promise<InventoryLevel> {
    const [productId, sizeId, stockId] = id.split(':')
    if (!productId || !sizeId || !stockId) {
      throw new Error('Invalid inventory level id format: expected `productId:sizeId:stockId`')
    }
    const res = await this.client(credentials).get<{ results?: RawIdosellProduct[] }>(
      '/products/products',
      { productIds: IdosellAdapter.csv([productId]) },
    )
    const raw = res.results?.[0]
    if (!raw) throw new Error(`IdoSell product ${productId} not found`)
    const levels = extractInventoryLevels(
      productId,
      raw.productStocksData,
      raw.productModificationTime,
    )
    const match = levels.find((l) => l.variantId === `${productId}:${sizeId}` && l.locationId === stockId)
    if (!match) throw new Error(`IdoSell inventory level ${id} not found`)
    return match
  }

  /**
   * `PUT /products/stocks` (productsstocksput) models a stock change as a
   * relative `quantity_operation` — `add` / `substract` / `set` — targeting
   * one product size at one warehouse (`stock_id`).
   */
  async adjustInventoryLevel(
    credentials: Credentials,
    data: { variantId: string; locationId: string; delta: number },
  ): Promise<InventoryLevel> {
    const [productId, sizeId] = data.variantId.split(':')
    if (!productId || !sizeId) {
      throw new Error('adjustInventoryLevel requires composite variantId `productId:sizeId`')
    }
    await this.client(credentials).put('/products/stocks', {
      params: {
        products: [
          {
            ident: { identType: 'id', identValue: productId },
            sizes: [
              {
                ident: { identType: 'id', identValue: sizeId },
                quantity: {
                  stocks: [
                    {
                      stock_id: Number(data.locationId),
                      quantity_operation: {
                        operation: data.delta >= 0 ? 'add' : 'substract',
                        quantity: Math.abs(data.delta),
                      },
                    },
                  ],
                },
              },
            ],
          },
        ],
      },
    })
    return this.getInventoryLevel(credentials, `${productId}:${sizeId}:${data.locationId}`)
  }

  async setInventoryLevel(
    credentials: Credentials,
    data: { variantId: string; locationId: string; available: number },
  ): Promise<InventoryLevel> {
    const [productId, sizeId] = data.variantId.split(':')
    if (!productId || !sizeId) {
      throw new Error('setInventoryLevel requires composite variantId `productId:sizeId`')
    }
    await this.client(credentials).put('/products/stocks', {
      params: {
        products: [
          {
            ident: { identType: 'id', identValue: productId },
            sizes: [
              {
                ident: { identType: 'id', identValue: sizeId },
                quantity: {
                  stocks: [
                    {
                      stock_id: Number(data.locationId),
                      quantity_operation: { operation: 'set', quantity: data.available },
                    },
                  ],
                },
              },
            ],
          },
        ],
      },
    })
    return this.getInventoryLevel(credentials, `${productId}:${sizeId}:${data.locationId}`)
  }

  // ── Customers (clientsclientsget / clientsclientsput / clientsremovedelete-1) ──
  //
  // No createCustomer: `POST /clients/clients` requires `login`, and its own
  // documented error code 2 restricts it to "only small letters" — no
  // canonical Customer field maps to a valid login without inventing one.

  async listCustomers(credentials: Credentials, params: QueryParams): Promise<Customer[]> {
    const { resultsPage, resultsLimit } = this.page(params)
    const res = await this.client(credentials).listGet<RawIdosellClient>(
      '/clients/clients',
      {},
      resultsPage,
      resultsLimit,
      'results',
    )
    this.reportPage(params, res)
    return res.items.map(transformClient)
  }

  async getCustomer(credentials: Credentials, id: string): Promise<Customer> {
    const res = await this.client(credentials).get<{ results?: RawIdosellClient[] }>(
      '/clients/clients',
      { clientsIds: IdosellAdapter.csv([id]) },
    )
    const raw = res.results?.[0]
    if (!raw) throw new Error(`IdoSell client ${id} not found`)
    return transformClient(raw)
  }

  /**
   * `PUT /clients/clients` (clientsclientsput) has no `clientId` property —
   * the customer is identified by `clientLogin`, so the current record is
   * read first to recover it.
   */
  async updateCustomer(
    credentials: Credentials,
    id: string,
    data: Partial<Customer>,
  ): Promise<Customer> {
    const client = this.client(credentials)
    const res = await client.get<{ results?: RawIdosellClient[] }>('/clients/clients', {
      clientsIds: IdosellAdapter.csv([id]),
    })
    const current = res.results?.[0]
    if (!current?.clientLogin) {
      throw new Error(`IdoSell client ${id} not found or has no clientLogin`)
    }
    await client.put('/clients/clients', {
      params: { clients: [untransformClientForUpdate(data, current.clientLogin)] },
    })
    return this.getCustomer(credentials, id)
  }

  async deleteCustomer(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete('/clients/remove', { clientId: Number(id) })
  }

  // ── Orders (ordersordersget / ordersorderssearchpost / ordersordersput) ────
  //
  // No createOrder/updateOrder: the search/status-update scope from the task
  // brief. `cancelOrder` writes the one unambiguous `orderStatus` value.

  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const { resultsPage, resultsLimit } = this.page(params)
    const res = await this.client(credentials).listSearch<RawIdosellOrder>(
      '/orders/orders/search',
      {},
      resultsPage,
      resultsLimit,
      'Results',
    )
    this.reportPage(params, res)
    return res.items.map(transformOrder)
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const res = await this.client(credentials).get<{ Results?: RawIdosellOrder[] }>(
      '/orders/orders',
      { ordersIds: IdosellAdapter.csv([id]) },
    )
    const raw = res.Results?.[0]
    if (!raw) throw new Error(`IdoSell order ${id} not found`)
    return transformOrder(raw)
  }

  async cancelOrder(credentials: Credentials, id: string): Promise<Order> {
    await this.client(credentials).put('/orders/orders', {
      params: { orders: [untransformOrderStatus(id, CANCELLED_ORDER_STATUS)] },
    })
    return this.getOrder(credentials, id)
  }

  // ── Refunds (returnsreturnsget / returnsreturnspost-1) ──────────────────────
  //
  // This endpoint's pagination/response fields are snake_case
  // (`results_page`, `results_limit`, `returns`, `results_number_all`) —
  // unlike every other list endpoint on this platform — so it is called
  // directly rather than through the camelCase `listGet` helper.

  async listRefunds(credentials: Credentials, params: QueryParams): Promise<Refund[]> {
    const { resultsPage, resultsLimit } = this.page(params)
    const data = await this.client(credentials).get<{
      returns?: RawIdosellReturn[]
      results_number_all?: number
    }>('/returns/returns', { results_page: resultsPage, results_limit: resultsLimit })
    const totalCount = data.results_number_all
    reportUpstreamPage(params, {
      totalCount,
      currentPage: resultsPage,
      hasMore: totalCount != null ? (resultsPage + 1) * resultsLimit < totalCount : undefined,
    })
    return (data.returns ?? []).map(transformRefund)
  }

  async getRefund(credentials: Credentials, id: string): Promise<Refund> {
    const res = await this.client(credentials).get<{ returns?: RawIdosellReturn[] }>(
      '/returns/returns',
      { return_ids: IdosellAdapter.csv([id]) },
    )
    const raw = res.returns?.[0]
    if (!raw) throw new Error(`IdoSell return ${id} not found`)
    return transformRefund(raw)
  }

  async createRefund(credentials: Credentials, data: Partial<Refund>): Promise<Refund> {
    if (!data.orderId) throw new Error('createRefund requires orderId')
    const res = await this.client(credentials).post<{ return_id?: number }>('/returns/returns', {
      params: untransformRefund(data),
    })
    if (res.return_id == null) throw new Error('IdoSell did not return a return_id for the created return')
    return this.getRefund(credentials, String(res.return_id))
  }
}
