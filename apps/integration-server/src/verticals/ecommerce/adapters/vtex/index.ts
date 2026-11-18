/**
 * VTEX adapter for the ecommerce vertical.
 *
 * Maps the VTEX REST APIs (Orders, Catalog, Master Data, Logistics,
 * Promotions) to the canonical ecommerce resources.
 *
 * Auth: X-VTEX-API-AppKey + X-VTEX-API-AppToken header pair.
 * There is no OAuth code-exchange flow.
 *
 * Resources supported:
 *  - Products (Catalog API — product + SKU)
 *  - Variants (Catalog SKU API)
 *  - Collections (Catalog Category API)
 *  - Locations (Logistics Warehouse API)
 *  - Inventory (Logistics Inventory API)
 *  - Customers (Master Data CL entity)
 *  - Orders (OMS API)
 *  - Refunds (Returns App API)
 *  - Discounts (Promotions & Taxes coupon API)
 *
 * Webhooks: VTEX uses a Feed/Hook model rather than HTTP webhook signatures.
 * The `verifyWebhook` and `parseWebhookEvents` methods are not implemented
 * (auto-501 via interface defaults).
 *
 * Docs: https://developers.vtex.com/docs/guides/getting-started
 */

import { CONNECT_FORM } from './connect-form'
import type { Credentials, QueryParams } from '@opensteward/shared'
import type { EcommerceAdapter } from '../../adapter/interface'
import type { Product, ProductVariant } from '../../schema/product'
import type { Collection } from '../../schema/collection'
import type { Location } from '../../schema/location'
import type { InventoryLevel } from '../../schema/inventory'
import type { Customer } from '../../schema/customer'
import type { Order } from '../../schema/order'
import type { Fulfillment } from '../../schema/fulfillment'
import type { Transaction } from '../../schema/transaction'
import type { Refund } from '../../schema/refund'
import type { Discount } from '../../schema/discount'

import { buildAuthUrl, exchangeCode as vtexExchangeCode } from './auth'
import { VtexClient } from './client'
import { DEFAULT_PAGE_SIZE } from './constants'

import {
  transformProduct,
  untransformProduct,
  transformProductVariant,
  untransformProductVariant,
  type RawVtexProduct,
  type RawVtexSku,
} from './transform/product'
import {
  transformCollection,
  untransformCollection,
  type RawVtexCategory,
} from './transform/collection'
import {
  transformCustomer,
  untransformCustomer,
  type RawVtexCustomer,
} from './transform/customer'
import {
  transformOrder,
  transformOrderSummary,
  type RawVtexOrder,
  type RawVtexOrderSummary,
} from './transform/order'
import {
  transformRefund,
  untransformRefund,
  type RawVtexReturnRequest,
} from './transform/refund'
import {
  transformDiscount,
  untransformDiscount,
  type RawVtexCoupon,
} from './transform/discount'
import {
  transformLocation,
  type RawVtexWarehouse,
} from './transform/location'
import {
  transformInventoryLevels,
  transformInventoryLevel,
  type RawVtexInventory,
  type RawVtexWarehouseBalance,
} from './transform/inventory'
import {
  transformFulfillment,
  untransformFulfillment,
  type RawVtexPackage,
} from './transform/fulfillment'
import {
  transformTransaction,
  type RawVtexTransaction,
  type RawVtexPayment,
} from './transform/transaction'

export interface VtexAdapterConfig {
  /** VTEX account name (e.g. "mystore"). Overridden per-connection. */
  accountName?: string
  /** VTEX AppKey for X-VTEX-API-AppKey. Overridden per-connection. */
  appKey?: string
  /** VTEX environment suffix (default: "vtexcommercestable"). */
  environment?: string
}


/** Customer (CL) fields to fetch from Master Data v2. */
const CL_FIELDS = [
  'id', 'email', 'firstName', 'lastName', 'phone', 'homePhone',
  'totalOrders', 'createdIn', 'updatedIn',
  'homeStreet', 'homeNumber', 'homeComplement',
  'homeCity', 'homeState', 'homeCountry', 'homePostalCode',
]

export class VtexAdapter implements EcommerceAdapter {
  // Connect Link support — see ./connect-form.ts for the fields collected.
  credentialFields = CONNECT_FORM.credentialFields
  exchangeCredentials = CONNECT_FORM.exchangeCredentials

  readonly platform = 'vtex'
  readonly version = '0.1.0'

  private configAccountName: string | undefined
  private configAppKey: string | undefined
  private configEnvironment: string | undefined

  constructor(config: VtexAdapterConfig = {}) {
    this.configAccountName = config.accountName
    this.configAppKey = config.appKey
    this.configEnvironment = config.environment
  }

  // ── Auth ──────────────────────────────────────────────────────────────────

  getAuthUrl(_state: string): string {
    return buildAuthUrl(this.configAccountName ?? 'your-vtex-account')
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    return vtexExchangeCode()
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    // VTEX AppKey/AppToken pairs do not expire — pass through unchanged.
    return credentials
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private clientFor(credentials: Credentials): VtexClient {
    // appToken lives in accessToken; appKey + accountName in extra.
    const appKey =
      (credentials.extra?.['appKey'] as string | undefined) ?? this.configAppKey
    const accountName =
      (credentials.extra?.['accountName'] as string | undefined) ?? this.configAccountName
    const environment =
      (credentials.extra?.['environment'] as string | undefined) ?? this.configEnvironment

    const merged: Credentials = {
      ...credentials,
      extra: {
        ...credentials.extra,
        ...(appKey != null ? { appKey } : {}),
        ...(accountName != null ? { accountName } : {}),
        ...(environment != null ? { environment } : {}),
      },
    }
    return new VtexClient(merged)
  }

  private listParams(params: QueryParams): Record<string, unknown> {
    const out: Record<string, unknown> = {
      per_page: params.limit ?? DEFAULT_PAGE_SIZE,
    }
    if (params.page != null) out['page'] = params.page
    return out
  }

  // ── Products ──────────────────────────────────────────────────────────────

  /**
   * List products via `GET /api/catalog_system/pvt/products/GetProductAndSkuIds`.
   * Returns minimal product + SKU id pairs; fetches SKU context for each product.
   */
  async listProducts(credentials: Credentials, params: QueryParams): Promise<Product[]> {
    const client = this.clientFor(credentials)
    const page = (params.page as number | undefined) ?? 1
    const perPage = params.limit ?? DEFAULT_PAGE_SIZE

    // This endpoint paginates with _from/_to (0-indexed item ranges).
    const from = (page - 1) * perPage + 1
    const to = from + perPage - 1

    const res = await client.get<Record<string, number[]>>(
      '/api/catalog_system/pvt/products/GetProductAndSkuIds',
      { _from: from, _to: to },
    )

    const productEntries = Object.entries(res ?? {})
    const products: Product[] = []

    for (const [productId, skuIds] of productEntries) {
      try {
        const product = await client.get<RawVtexProduct>(
          `/api/catalog/pvt/product/${productId}`,
        )
        const skus = await Promise.all(
          (skuIds ?? []).slice(0, 50).map((skuId) =>
            client
              .get<RawVtexSku>(
                `/api/catalog_system/pvt/sku/stockkeepingunitbyid/${skuId}`,
              )
              .catch(() => null),
          ),
        )
        products.push(
          transformProduct(
            product,
            skus.filter((s): s is RawVtexSku => s !== null),
          ),
        )
      } catch {
        // Skip products that fail to load — transforms never throw.
      }
    }

    return products
  }

  async getProduct(credentials: Credentials, id: string): Promise<Product> {
    const client = this.clientFor(credentials)
    const product = await client.get<RawVtexProduct>(`/api/catalog/pvt/product/${id}`)
    // Fetch SKU ids for this product.
    const skuIds = await client
      .get<number[]>(`/api/catalog_system/pvt/sku/stockkeepingunitByProductId/${id}`)
      .catch(() => [] as number[])
    const skus = await Promise.all(
      (skuIds ?? []).slice(0, 50).map((skuId) =>
        client
          .get<RawVtexSku>(`/api/catalog_system/pvt/sku/stockkeepingunitbyid/${skuId}`)
          .catch(() => null),
      ),
    )
    return transformProduct(
      product,
      skus.filter((s): s is RawVtexSku => s !== null),
    )
  }

  async createProduct(credentials: Credentials, data: Partial<Product>): Promise<Product> {
    const client = this.clientFor(credentials)
    const res = await client.post<RawVtexProduct>(
      '/api/catalog/pvt/product',
      untransformProduct(data),
    )
    return transformProduct(res)
  }

  async updateProduct(
    credentials: Credentials,
    id: string,
    data: Partial<Product>,
  ): Promise<Product> {
    const client = this.clientFor(credentials)
    const res = await client.put<RawVtexProduct>(
      `/api/catalog/pvt/product/${id}`,
      untransformProduct(data),
    )
    return transformProduct(res)
  }

  // ── Variants (SKUs) ───────────────────────────────────────────────────────

  async listVariants(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<ProductVariant[]> {
    const productId = (params['productId'] ?? params['product_id']) as
      | string
      | number
      | undefined
    if (productId == null) {
      throw new Error('VTEX requires ?productId= for listVariants — SKUs are nested under products.')
    }
    const pid = String(productId)
    const client = this.clientFor(credentials)
    const skuIds = await client
      .get<number[]>(`/api/catalog_system/pvt/sku/stockkeepingunitByProductId/${pid}`)
      .catch(() => [] as number[])

    const skus = await Promise.all(
      (skuIds ?? []).map((skuId) =>
        client
          .get<RawVtexSku>(`/api/catalog_system/pvt/sku/stockkeepingunitbyid/${skuId}`)
          .catch(() => null),
      ),
    )
    return skus
      .filter((s): s is RawVtexSku => s !== null)
      .map((sku) => transformProductVariant(sku, pid))
  }

  async getVariant(credentials: Credentials, id: string): Promise<ProductVariant> {
    const client = this.clientFor(credentials)
    const sku = await client.get<RawVtexSku>(
      `/api/catalog_system/pvt/sku/stockkeepingunitbyid/${id}`,
    )
    const productId = sku.ProductId != null ? String(sku.ProductId) : id
    return transformProductVariant(sku, productId)
  }

  async createVariant(
    credentials: Credentials,
    data: Partial<ProductVariant>,
  ): Promise<ProductVariant> {
    const client = this.clientFor(credentials)
    const res = await client.post<RawVtexSku>(
      '/api/catalog/pvt/stockkeepingunit',
      untransformProductVariant(data),
    )
    const productId = data.productId ?? (res.ProductId != null ? String(res.ProductId) : String(res.Id))
    return transformProductVariant(res, productId)
  }

  async updateVariant(
    credentials: Credentials,
    id: string,
    data: Partial<ProductVariant>,
  ): Promise<ProductVariant> {
    const client = this.clientFor(credentials)
    const res = await client.put<RawVtexSku>(
      `/api/catalog/pvt/stockkeepingunit/${id}`,
      untransformProductVariant(data),
    )
    const productId = data.productId ?? (res.ProductId != null ? String(res.ProductId) : id)
    return transformProductVariant(res, productId)
  }

  // ── Collections (Categories) ──────────────────────────────────────────────

  async listCollections(
    credentials: Credentials,
    _params: QueryParams,
  ): Promise<Collection[]> {
    const client = this.clientFor(credentials)
    // Returns the full category tree; flatten it to a list.
    const tree = await client.get<RawVtexCategory[]>(
      '/api/catalog_system/pub/category/tree/5',
    )
    const flat: RawVtexCategory[] = []
    const flatten = (cats: RawVtexCategory[]) => {
      for (const cat of cats) {
        flat.push(cat)
        if (Array.isArray((cat as Record<string, unknown>)['children'])) {
          flatten((cat as Record<string, unknown>)['children'] as RawVtexCategory[])
        }
      }
    }
    flatten(tree ?? [])
    return flat.map(transformCollection)
  }

  async getCollection(credentials: Credentials, id: string): Promise<Collection> {
    const client = this.clientFor(credentials)
    const res = await client.get<RawVtexCategory>(`/api/catalog/pvt/category/${id}`)
    return transformCollection(res)
  }

  async createCollection(
    credentials: Credentials,
    data: Partial<Collection>,
  ): Promise<Collection> {
    const client = this.clientFor(credentials)
    const res = await client.post<RawVtexCategory>(
      '/api/catalog/pvt/category',
      untransformCollection(data),
    )
    return transformCollection(res)
  }

  async updateCollection(
    credentials: Credentials,
    id: string,
    data: Partial<Collection>,
  ): Promise<Collection> {
    const client = this.clientFor(credentials)
    const res = await client.put<RawVtexCategory>(
      `/api/catalog/pvt/category/${id}`,
      untransformCollection(data),
    )
    return transformCollection(res)
  }

  // ── Locations (Warehouses) ────────────────────────────────────────────────

  async listLocations(
    credentials: Credentials,
    _params: QueryParams,
  ): Promise<Location[]> {
    const client = this.clientFor(credentials)
    const warehouses = await client.get<RawVtexWarehouse[]>(
      '/api/logistics/pvt/configuration/warehouses',
    )
    return (warehouses ?? []).map(transformLocation)
  }

  async getLocation(credentials: Credentials, id: string): Promise<Location> {
    const client = this.clientFor(credentials)
    const warehouse = await client.get<RawVtexWarehouse>(
      `/api/logistics/pvt/configuration/warehouses/${id}`,
    )
    return transformLocation(warehouse)
  }

  // ── Inventory ─────────────────────────────────────────────────────────────

  async listInventoryLevels(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<InventoryLevel[]> {
    const skuId = (params['skuId'] ?? params['sku_id'] ?? params['variantId']) as
      | string
      | undefined
    if (!skuId) {
      throw new Error('VTEX listInventoryLevels requires ?skuId= in query params.')
    }
    const client = this.clientFor(credentials)
    const res = await client.get<RawVtexInventory>(
      `/api/logistics/pvt/inventory/skus/${skuId}`,
    )
    return transformInventoryLevels(res)
  }

  async getInventoryLevel(credentials: Credentials, id: string): Promise<InventoryLevel> {
    // id format: skuId:warehouseId
    const [skuId, warehouseId] = id.split(':')
    if (!skuId || !warehouseId) {
      throw new Error('Invalid inventory level id: expected `skuId:warehouseId`')
    }
    const client = this.clientFor(credentials)
    const res = await client.get<RawVtexInventory>(
      `/api/logistics/pvt/inventory/skus/${skuId}`,
    )
    const balance = (res.balance ?? []).find(
      (b: RawVtexWarehouseBalance) => b.warehouseId === warehouseId,
    )
    if (!balance) {
      throw new Error(
        `VTEX: no inventory found for skuId=${skuId} warehouseId=${warehouseId}`,
      )
    }
    return transformInventoryLevel(balance, skuId)
  }

  async setInventoryLevel(
    credentials: Credentials,
    data: { variantId: string; locationId: string; available: number },
  ): Promise<InventoryLevel> {
    const client = this.clientFor(credentials)
    await client.put(
      `/api/logistics/pvt/inventory/skus/${data.variantId}/warehouses/${data.locationId}`,
      { unlimitedQuantity: false, dateUtcOnBalanceSystem: null, quantity: data.available },
    )
    // Re-fetch to return the updated canonical shape.
    const res = await client.get<RawVtexInventory>(
      `/api/logistics/pvt/inventory/skus/${data.variantId}`,
    )
    const balance = (res.balance ?? []).find(
      (b: RawVtexWarehouseBalance) => b.warehouseId === data.locationId,
    )
    if (!balance) {
      // Return a synthetic level if the warehouse isn't in the balance response.
      return {
        id: `${data.variantId}:${data.locationId}`,
        variantId: data.variantId,
        locationId: data.locationId,
        available: data.available,
        metadata: {},
      }
    }
    return transformInventoryLevel(balance, data.variantId)
  }

  // ── Customers ─────────────────────────────────────────────────────────────

  async listCustomers(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<Customer[]> {
    const client = this.clientFor(credentials)
    const limit = params.limit ?? DEFAULT_PAGE_SIZE
    const page = (params.page as number | undefined) ?? 1
    const offset = (page - 1) * limit
    const res = await client.searchMasterData<RawVtexCustomer>(
      'CL',
      CL_FIELDS,
      { limit },
      offset,
    )
    return res.items.map(transformCustomer)
  }

  async getCustomer(credentials: Credentials, id: string): Promise<Customer> {
    const client = this.clientFor(credentials)
    const res = await client.get<RawVtexCustomer>(`/api/dataentities/CL/documents/${id}`, {
      _fields: CL_FIELDS.join(','),
    })
    return transformCustomer(res)
  }

  async createCustomer(
    credentials: Credentials,
    data: Partial<Customer>,
  ): Promise<Customer> {
    const client = this.clientFor(credentials)
    const body = untransformCustomer(data)
    // Master Data returns a minimal { Id, Href, DocumentId } on POST.
    const created = await client.post<{ Id: string; DocumentId: string }>(
      '/api/dataentities/CL/documents',
      body,
    )
    const docId = created.DocumentId ?? created.Id
    return this.getCustomer(credentials, docId)
  }

  async updateCustomer(
    credentials: Credentials,
    id: string,
    data: Partial<Customer>,
  ): Promise<Customer> {
    const client = this.clientFor(credentials)
    await client.patch(`/api/dataentities/CL/documents/${id}`, untransformCustomer(data))
    return this.getCustomer(credentials, id)
  }

  // ── Orders ────────────────────────────────────────────────────────────────

  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const client = this.clientFor(credentials)
    const res = await client.listOrders<RawVtexOrderSummary>(this.listParams(params))
    return res.items.map(transformOrderSummary)
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const client = this.clientFor(credentials)
    const res = await client.get<RawVtexOrder>(`/api/oms/pvt/orders/${id}`)
    return transformOrder(res)
  }

  async cancelOrder(
    credentials: Credentials,
    id: string,
    data?: { reason?: string },
  ): Promise<Order> {
    const client = this.clientFor(credentials)
    await client.post(`/api/oms/pvt/orders/${id}/cancel`, {
      reason: data?.reason ?? 'Cancelled via API',
    })
    return this.getOrder(credentials, id)
  }

  // ── Refunds ───────────────────────────────────────────────────────────────

  async listRefunds(credentials: Credentials, params: QueryParams): Promise<Refund[]> {
    const orderId = (params['orderId'] ?? params['order_id']) as string | undefined
    const client = this.clientFor(credentials)
    const query: Record<string, unknown> = {
      _page: (params.page as number | undefined) ?? 1,
      _perPage: params.limit ?? DEFAULT_PAGE_SIZE,
    }
    if (orderId) query['orderId'] = orderId
    const res = await client.get<{ data: RawVtexReturnRequest[] }>(
      '/api/rma/pub/return-requests',
      query,
    )
    return (res.data ?? []).map((r) => transformRefund(r))
  }

  async getRefund(credentials: Credentials, id: string): Promise<Refund> {
    const client = this.clientFor(credentials)
    const res = await client.get<RawVtexReturnRequest>(
      `/api/rma/pub/return-requests/${id}`,
    )
    return transformRefund(res)
  }

  async createRefund(credentials: Credentials, data: Partial<Refund>): Promise<Refund> {
    if (!data.orderId) throw new Error('createRefund requires orderId')
    const client = this.clientFor(credentials)
    const res = await client.post<RawVtexReturnRequest>(
      '/api/rma/pub/return-requests',
      untransformRefund(data),
    )
    return transformRefund(res)
  }

  // ── Discounts (Coupons) ───────────────────────────────────────────────────

  async listDiscounts(credentials: Credentials, params: QueryParams): Promise<Discount[]> {
    const client = this.clientFor(credentials)
    const page = (params.page as number | undefined) ?? 1
    const perPage = params.limit ?? DEFAULT_PAGE_SIZE
    const res = await client.get<{ items: RawVtexCoupon[] }>(
      '/api/rnb/pvt/coupon',
      { page, perPage },
    )
    return (res.items ?? []).map(transformDiscount)
  }

  async getDiscount(credentials: Credentials, id: string): Promise<Discount> {
    const client = this.clientFor(credentials)
    // VTEX coupon endpoint uses the coupon code as the id.
    const res = await client.get<RawVtexCoupon>(`/api/rnb/pvt/coupon/${id}`)
    return transformDiscount(res)
  }

  async createDiscount(
    credentials: Credentials,
    data: Partial<Discount>,
  ): Promise<Discount> {
    const client = this.clientFor(credentials)
    const res = await client.post<RawVtexCoupon>(
      '/api/rnb/pvt/coupon',
      untransformDiscount(data),
    )
    return transformDiscount(res)
  }

  async updateDiscount(
    credentials: Credentials,
    id: string,
    data: Partial<Discount>,
  ): Promise<Discount> {
    const client = this.clientFor(credentials)
    const res = await client.put<RawVtexCoupon>(
      `/api/rnb/pvt/coupon/${id}`,
      untransformDiscount(data),
    )
    return transformDiscount(res)
  }

  // ── Fulfillments (invoiced packages) ──────────────────────────────────────

  /**
   * List fulfillments for a given order.
   * Requires `params.orderId`; returns [] if absent.
   * Each fulfilled package on the order maps to one Fulfillment.
   */
  async listFulfillments(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<Fulfillment[]> {
    const orderId = (params['orderId'] ?? params['order_id']) as string | undefined
    if (!orderId) return []
    const client = this.clientFor(credentials)
    const order = await client.get<{
      packageAttachment?: { packages?: RawVtexPackage[] }
    }>(`/api/oms/pvt/orders/${orderId}`)
    const packages = order.packageAttachment?.packages ?? []
    return packages.map((pkg) => transformFulfillment(pkg, orderId))
  }

  async getFulfillment(credentials: Credentials, id: string): Promise<Fulfillment> {
    // id format: `{orderId}:{invoiceNumber}`
    const colonIdx = id.indexOf(':')
    if (colonIdx < 0) throw new Error(`Invalid VTEX fulfillment id: ${id}. Expected "orderId:invoiceNumber".`)
    const orderId = id.slice(0, colonIdx)
    const invoiceNumber = id.slice(colonIdx + 1)
    const client = this.clientFor(credentials)
    const order = await client.get<{
      packageAttachment?: { packages?: RawVtexPackage[] }
    }>(`/api/oms/pvt/orders/${orderId}`)
    const packages = order.packageAttachment?.packages ?? []
    const pkg = packages.find((p) => p.invoiceNumber === invoiceNumber)
    if (!pkg) throw new Error(`VTEX: no fulfillment found for id=${id}`)
    return transformFulfillment(pkg, orderId)
  }

  async createFulfillment(
    credentials: Credentials,
    data: Partial<Fulfillment>,
  ): Promise<Fulfillment> {
    if (!data.orderId) throw new Error('createFulfillment requires orderId')
    const client = this.clientFor(credentials)
    await client.post(
      `/api/oms/pvt/orders/${data.orderId}/invoice`,
      untransformFulfillment(data),
    )
    // Re-fetch the order to return the created package record.
    const order = await client.get<{
      packageAttachment?: { packages?: RawVtexPackage[] }
    }>(`/api/oms/pvt/orders/${data.orderId}`)
    const packages = order.packageAttachment?.packages ?? []
    const last = packages[packages.length - 1]
    if (!last) throw new Error(`VTEX: createFulfillment succeeded but no package found`)
    return transformFulfillment(last, data.orderId)
  }

  // ── Transactions (payment records) ────────────────────────────────────────

  /**
   * List payment transactions for a given order.
   * Requires `params.orderId`; returns [] if absent.
   */
  async listTransactions(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<Transaction[]> {
    const orderId = (params['orderId'] ?? params['order_id']) as string | undefined
    if (!orderId) return []
    const client = this.clientFor(credentials)
    const order = await client.get<{
      paymentData?: { transactions?: RawVtexTransaction[] }
    }>(`/api/oms/pvt/orders/${orderId}`)
    const transactions = order.paymentData?.transactions ?? []
    const results: Transaction[] = []
    for (const txn of transactions) {
      for (const payment of txn.payments ?? []) {
        results.push(transformTransaction(payment as RawVtexPayment, txn, orderId))
      }
    }
    return results
  }

  async getTransaction(credentials: Credentials, id: string): Promise<Transaction> {
    // id format: `{orderId}:{transactionId}:{paymentId}`
    const parts = id.split(':')
    if (parts.length < 2) throw new Error(`Invalid VTEX transaction id: ${id}`)
    const orderId = parts[0]
    const txnId = parts[1]
    const paymentId = parts[2]
    const transactions = await this.listTransactions(credentials, { orderId })
    const found = transactions.find((t) => {
      const tParts = t.id.split(':')
      return tParts[1] === txnId && (!paymentId || tParts[2] === paymentId)
    })
    if (!found) throw new Error(`VTEX: transaction ${id} not found`)
    return found
  }
}
