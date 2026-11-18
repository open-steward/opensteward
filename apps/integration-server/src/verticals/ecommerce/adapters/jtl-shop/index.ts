/**
 * JTL-Shop adapter for the ecommerce vertical.
 *
 * Maps the JTL-Shop REST API (`{baseUrl}/api/v1`) to the canonical ecommerce
 * resources. JTL-Shop uses a static API key (generated in the admin panel)
 * passed as the `x-api-key` request header. There is no OAuth flow.
 *
 * Routes are JTL-Shop 5.8.0's own (the complete REST route table is the
 * registerRoutes() of the 25 controllers Registrator::$classes lists):
 * https://gitlab.com/jtl-software/jtl-shop/core/-/tree/v5.8.0/includes/src/REST/Controllers
 *
 *  - Products     GET /product, /product/{id}      → listProducts, getProduct
 *  - Collections  GET /category, /category/{id}    → listCollections, getCollection
 *  - Customers    GET /customer, /customer/{id}    → listCustomers, getCustomer
 *  - Orders       GET /order, /order/{id}          → listOrders, getOrder
 *  - Inventory    GET /stock/product/{productID}   → listInventoryLevels
 *
 * Lists page by id keyset (`limit` + `cursor`, see client.ts). The index
 * reads no other query parameter, so neither `search` nor `updatedAfter`
 * can be sent: search is not declared, and a call with `updatedAfter` is
 * served the unfiltered list (a superset, never a gap).
 *
 * Refused (501 NOT_SUPPORTED, before any request): variants, fulfillments,
 * refunds and discounts. No controller registers a variant, shipment, refund
 * or coupon route; see each method.
 *
 * The write methods below are unchanged by the paging rebuild and still call
 * the paths they always did; several of those paths do not exist upstream.
 *
 * ── Resource coverage ──────────────────────────────────────────────
 * Unavailable: transaction — payment transactions are stored in JTL-Wawi ERP, not exposed by the JTL-Shop REST API
 *
 * Credentials are configured via POST /v1/connections:
 *   {
 *     platform: "jtl-shop",
 *     credentials: {
 *       accessToken: "<api-key>",
 *       extra: { baseUrl: "https://myshop.example.com" }
 *     }
 *   }
 */

import { CONNECT_FORM } from './connect-form'
import {
  connectionScope,
  cursorPagerKey,
  pageByCursor,
  pageLocally,
  reportUpstreamPage,
  type Credentials,
  type QueryParams,
} from '@opensteward/shared'
import type { EcommerceAdapter } from '../../adapter/interface'
import type { Product, ProductVariant } from '../../schema/product'
import type { Collection } from '../../schema/collection'
import type { Location } from '../../schema/location'
import type { InventoryLevel } from '../../schema/inventory'
import type { Customer } from '../../schema/customer'
import type { Order } from '../../schema/order'
import type { Fulfillment } from '../../schema/fulfillment'
import type { Refund } from '../../schema/refund'
import type { Discount } from '../../schema/discount'

import { getAuthUrl, exchangeCode as jtlExchangeCode, refreshCredentials } from './auth'
import { JtlShopClient } from './client'
import { DEFAULT_LIMIT } from './constants'
import { transformProductModel, type JtlProductModel } from './transform/product-model'
import { transformCategoryModel, type JtlCategoryModel } from './transform/category-model'
import { transformCustomerModel, type JtlCustomerModel } from './transform/customer-model'
import { transformOrderModel, type JtlOrderModel } from './transform/order-model'
import { transformStockModel, type JtlStockModel } from './transform/stock-model'

import {
  transformProduct,
  untransformProduct,
  transformVariant,
  untransformVariant,
  type RawJtlShopArticle,
  type RawJtlShopVariant,
} from './transform/product'
import {
  transformCollection,
  untransformCollection,
  type RawJtlShopCategory,
} from './transform/collection'
import { syntheticDefaultLocation } from './transform/location'
import { transformInventoryLevel, type RawJtlShopStock } from './transform/inventory'
import {
  transformCustomer,
  untransformCustomer,
  type RawJtlShopCustomer,
} from './transform/customer'
import { transformOrder, untransformOrder, type RawJtlShopOrder } from './transform/order'
import {
  transformFulfillment,
  untransformFulfillment,
  type RawJtlShopFulfillment,
} from './transform/fulfillment'
import { transformRefund, untransformRefund, type RawJtlShopRefund } from './transform/refund'
import { transformDiscount, untransformDiscount, type RawJtlShopCoupon } from './transform/discount'

// ── Config ────────────────────────────────────────────────────────────────────

export interface JtlShopAdapterConfig {
  /** Optional fallback API key (per-connection credentials take precedence). */
  apiKey?: string
  /** JTL-Shop base URL, e.g. `https://myshop.example.com`. */
  baseUrl?: string
}

// ── Adapter ───────────────────────────────────────────────────────────────────

export class JtlShopAdapter implements EcommerceAdapter {
  readonly platform = 'jtl-shop'
  readonly version = '0.1.0'
  /**
   * The list index reads only `limit` and `cursor`, so a search term is
   * not honoured and the router refuses it. No page maximum is documented
   * (only the floor in "\max(1, (int)(...['limit'] ?? 10))"), so none is declared.
   */
  readonly capabilities = { search: false }

  // Connect Link support — see ./connect-form.ts for the fields collected.
  credentialFields = CONNECT_FORM.credentialFields
  exchangeCredentials = CONNECT_FORM.exchangeCredentials

  private configApiKey: string | undefined
  private configBaseUrl: string | undefined

  constructor(config: JtlShopAdapterConfig = {}) {
    this.configApiKey = config.apiKey
    this.configBaseUrl = config.baseUrl
  }

  // ── Auth ──────────────────────────────────────────────────────────────────

  getAuthUrl(_state: string): string {
    return getAuthUrl(_state)
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    return jtlExchangeCode(_code, _redirectUri)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return refreshCredentials(credentials)
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private clientFor(credentials: Credentials): JtlShopClient {
    const apiKey = credentials.accessToken || this.configApiKey
    const baseUrl = (credentials.extra?.['baseUrl'] as string | undefined) ?? this.configBaseUrl

    if (!apiKey) {
      throw new Error(
        'JTL-Shop adapter: API key missing — configure via /v1/connections with ' +
          '`credentials: {accessToken: "<api-key>", extra: {baseUrl: "https://myshop.example.com"}}`.',
      )
    }
    if (!baseUrl) {
      throw new Error(
        'JTL-Shop adapter: base URL missing — configure via /v1/connections with ' +
          '`credentials: {extra: {baseUrl: "https://myshop.example.com"}}`.',
      )
    }

    const mergedCreds: Credentials = {
      ...credentials,
      accessToken: apiKey,
      extra: { ...credentials.extra, baseUrl },
    }
    return new JtlShopClient(mergedCreds)
  }

  private baseUrl(credentials: Credentials): string {
    return (credentials.extra?.['baseUrl'] as string | undefined) ?? this.configBaseUrl ?? 'default'
  }

  /**
   * One caller page of an id-keyset list (see JtlShopClient.listPage): the
   * caller's exact `limit` (the documented default of 10 when it is absent or
   * not a number ≥ 1; no maximum is documented, so none is applied), walked
   * to the caller's 1-based `page` through the shared cursor pager, with
   * `hasMore` from the platform's own end signal.
   */
  private async listKeyset<Raw, Out>(
    credentials: Credentials,
    params: QueryParams,
    path: string,
    map: (raw: Raw) => Out,
  ): Promise<Out[]> {
    const client = this.clientFor(credentials)
    const limit =
      typeof params.limit === 'number' && Number.isFinite(params.limit) && params.limit >= 1
        ? Math.floor(params.limit)
        : DEFAULT_LIMIT
    const scope = connectionScope(client.apiBase, {
      accessToken: credentials.accessToken || this.configApiKey || '',
    })
    const res = await pageByCursor<Raw, number>(
      cursorPagerKey(scope, path, { limit }),
      params.page,
      (cursor) => client.listPage<Raw>(path, limit, cursor),
    )
    reportUpstreamPage(params, { hasMore: res.hasMore })
    return res.items.map(map)
  }

  private refuse(message: string): never {
    throw Object.assign(new Error(message), { statusCode: 501, code: 'NOT_SUPPORTED' })
  }

  // ── Products ──────────────────────────────────────────────────────────────

  /**
   * GET /product — https://gitlab.com/jtl-software/jtl-shop/core/-/raw/v5.8.0/includes/src/REST/Controllers/ProductController.php:
   * "$routeGroup->get('/product', $this->index(...));"
   */
  async listProducts(credentials: Credentials, params: QueryParams): Promise<Product[]> {
    return this.listKeyset<JtlProductModel, Product>(
      credentials,
      params,
      'product',
      transformProductModel,
    )
  }

  /** "$routeGroup->get('/product/{id}[/{full:full}]', $this->show(...));" */
  async getProduct(credentials: Credentials, id: string): Promise<Product> {
    const raw = await this.clientFor(credentials).getItem<JtlProductModel>(
      `product/${encodeURIComponent(id)}`,
    )
    return transformProductModel(raw)
  }

  async createProduct(credentials: Credentials, data: Partial<Product>): Promise<Product> {
    const raw = await this.clientFor(credentials).post<RawJtlShopArticle>(
      'articles',
      untransformProduct(data),
    )
    return transformProduct(raw)
  }

  async updateProduct(
    credentials: Credentials,
    id: string,
    data: Partial<Product>,
  ): Promise<Product> {
    const raw = await this.clientFor(credentials).put<RawJtlShopArticle>(
      `articles/${id}`,
      untransformProduct(data),
    )
    return transformProduct(raw)
  }

  async deleteProduct(credentials: Credentials, id: string): Promise<void> {
    await this.clientFor(credentials).delete(`articles/${id}`)
  }

  // ── Variants ──────────────────────────────────────────────────────────────

  /**
   * Refused. ProductController registers only "/product", "/product/{id}[/{full:full}]"
   * and their PUT/POST/DELETE; no controller in Registrator::$classes registers a
   * variant route (the adapter's `articles/{id}/variants` does not exist).
   */
  async listVariants(_credentials: Credentials, _params: QueryParams): Promise<ProductVariant[]> {
    return this.refuse(
      'JTL-Shop cannot list variants: its REST API registers no variant route (ProductController serves only "/product" and "/product/{id}[/{full:full}]")',
    )
  }

  async getVariant(_credentials: Credentials, _id: string): Promise<ProductVariant> {
    return this.refuse(
      'JTL-Shop cannot read a variant: its REST API registers no variant route (ProductController serves only "/product" and "/product/{id}[/{full:full}]")',
    )
  }

  async updateVariant(
    credentials: Credentials,
    id: string,
    data: Partial<ProductVariant>,
  ): Promise<ProductVariant> {
    const [productId, variantId] = id.split(':')
    if (!productId || !variantId) {
      throw new Error('Invalid variant id format: expected `productId:variantId`')
    }
    const raw = await this.clientFor(credentials).put<RawJtlShopVariant>(
      `articles/${productId}/variants/${variantId}`,
      untransformVariant(data),
    )
    return transformVariant(raw, productId, 'EUR')
  }

  // ── Collections ───────────────────────────────────────────────────────────

  /**
   * GET /category — https://gitlab.com/jtl-software/jtl-shop/core/-/raw/v5.8.0/includes/src/REST/Controllers/CategoryController.php:
   * "$routeGroup->get('/category', $this->index(...));"
   */
  async listCollections(credentials: Credentials, params: QueryParams): Promise<Collection[]> {
    return this.listKeyset<JtlCategoryModel, Collection>(
      credentials,
      params,
      'category',
      transformCategoryModel,
    )
  }

  /** "$routeGroup->get('/category/{id}', $this->show(...));" */
  async getCollection(credentials: Credentials, id: string): Promise<Collection> {
    const raw = await this.clientFor(credentials).getItem<JtlCategoryModel>(
      `category/${encodeURIComponent(id)}`,
    )
    return transformCategoryModel(raw)
  }

  async createCollection(credentials: Credentials, data: Partial<Collection>): Promise<Collection> {
    const raw = await this.clientFor(credentials).post<RawJtlShopCategory>(
      'categories',
      untransformCollection(data),
    )
    return transformCollection(raw)
  }

  async updateCollection(
    credentials: Credentials,
    id: string,
    data: Partial<Collection>,
  ): Promise<Collection> {
    const raw = await this.clientFor(credentials).put<RawJtlShopCategory>(
      `categories/${id}`,
      untransformCollection(data),
    )
    return transformCollection(raw)
  }

  async deleteCollection(credentials: Credentials, id: string): Promise<void> {
    await this.clientFor(credentials).delete(`categories/${id}`)
  }

  // ── Locations ─────────────────────────────────────────────────────────────

  async listLocations(credentials: Credentials, _params: QueryParams): Promise<Location[]> {
    return [syntheticDefaultLocation(this.baseUrl(credentials))]
  }

  async getLocation(credentials: Credentials, id: string): Promise<Location> {
    if (id !== 'default') {
      throw new Error(`JTL-Shop has no native locations endpoint; unknown location id '${id}'`)
    }
    return syntheticDefaultLocation(this.baseUrl(credentials))
  }

  // ── Inventory ─────────────────────────────────────────────────────────────

  /**
   * GET /stock/product/{productID} — https://gitlab.com/jtl-software/jtl-shop/core/-/raw/v5.8.0/includes/src/REST/Controllers/StockController.php:
   * "$routeGroup->get('/stock/product/{productID}', $this->show(...));"
   *
   * That route answers every warehouse row of one product in one unpaginated
   * collection ("'SELECT * FROM ' . $model->getTableName() . ' WHERE kArtikel = :pid'"),
   * so it is paged locally. The all-products index (GET /stock) has no primary
   * key to page by ("$this->primaryKeyName = '';" → "'SELECT * FROM ' .
   * $model->getTableName() . ' LIMIT :lmt'", no cursor): only its first
   * `limit` rows are reachable, so an unfiltered call is refused rather than
   * served as a complete list.
   */
  async listInventoryLevels(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<InventoryLevel[]> {
    const productId = (params['productId'] ?? params['product_id']) as string | undefined
    if (!productId) {
      return this.refuse(
        'JTL-Shop cannot list inventory levels without product_id: GET /stock has no cursor ("$this->primaryKeyName = \'\';"), so only its first `limit` rows are reachable. Pass product_id to read GET /stock/product/{productID}.',
      )
    }
    const rows = await this.clientFor(credentials).getCollection<JtlStockModel>(
      `stock/product/${encodeURIComponent(productId)}`,
    )
    return pageLocally(rows.map(transformStockModel), params)
  }

  async adjustInventoryLevel(
    credentials: Credentials,
    data: { variantId: string; locationId: string; delta: number },
  ): Promise<InventoryLevel> {
    // variantId may be "articleId:variantId" or just "articleId"
    const [articleId, variantId] = data.variantId.includes(':')
      ? data.variantId.split(':')
      : [data.variantId, undefined]

    const client = this.clientFor(credentials)
    const article = await client.get<RawJtlShopArticle>(`articles/${articleId}`)

    if (variantId) {
      const variant = (article.variants ?? []).find((v) => String(v.id) === variantId)
      const currentStock = (variant?.stock as number | null | undefined) ?? 0
      const newStock = Math.max(0, currentStock + data.delta)
      await client.patch(`articles/${articleId}/variants/${variantId}`, { stock: newStock })
      const stock: RawJtlShopStock = { variantId, articleId, available: newStock }
      return transformInventoryLevel(stock, data.variantId)
    }

    const currentStock = article.stock ?? 0
    const newStock = currentStock + data.delta
    await client.patch(`articles/${articleId}`, { stock: Math.max(0, newStock) })
    const stock: RawJtlShopStock = { articleId, available: Math.max(0, newStock) }
    return transformInventoryLevel(stock, data.variantId)
  }

  async setInventoryLevel(
    credentials: Credentials,
    data: { variantId: string; locationId: string; available: number },
  ): Promise<InventoryLevel> {
    const [articleId, variantId] = data.variantId.includes(':')
      ? data.variantId.split(':')
      : [data.variantId, undefined]

    const client = this.clientFor(credentials)

    if (variantId) {
      await client.patch(`articles/${articleId}/variants/${variantId}`, {
        stock: data.available,
      })
      const stock: RawJtlShopStock = { variantId, articleId, available: data.available }
      return transformInventoryLevel(stock, data.variantId)
    }

    await client.patch(`articles/${articleId}`, { stock: data.available })
    const stock: RawJtlShopStock = { articleId, available: data.available }
    return transformInventoryLevel(stock, data.variantId)
  }

  // ── Customers ─────────────────────────────────────────────────────────────

  /**
   * GET /customer — https://gitlab.com/jtl-software/jtl-shop/core/-/raw/v5.8.0/includes/src/REST/Controllers/CustomerController.php:
   * "$routeGroup->get('/customer', $this->index(...));". Its index override
   * keeps the keyset paging and decrypts surname, company, additional and street.
   */
  async listCustomers(credentials: Credentials, params: QueryParams): Promise<Customer[]> {
    return this.listKeyset<JtlCustomerModel, Customer>(credentials, params, 'customer', (raw) =>
      transformCustomerModel(raw, { decrypted: true }),
    )
  }

  /**
   * "$routeGroup->get('/customer/{id}', $this->show(...));". show() does not
   * decrypt, so the encrypted fields are left out (see transform/customer-model.ts).
   */
  async getCustomer(credentials: Credentials, id: string): Promise<Customer> {
    const raw = await this.clientFor(credentials).getItem<JtlCustomerModel>(
      `customer/${encodeURIComponent(id)}`,
    )
    return transformCustomerModel(raw, { decrypted: false })
  }

  async createCustomer(credentials: Credentials, data: Partial<Customer>): Promise<Customer> {
    const raw = await this.clientFor(credentials).post<RawJtlShopCustomer>(
      'customers',
      untransformCustomer(data),
    )
    return transformCustomer(raw)
  }

  async updateCustomer(
    credentials: Credentials,
    id: string,
    data: Partial<Customer>,
  ): Promise<Customer> {
    const raw = await this.clientFor(credentials).put<RawJtlShopCustomer>(
      `customers/${id}`,
      untransformCustomer(data),
    )
    return transformCustomer(raw)
  }

  async deleteCustomer(credentials: Credentials, id: string): Promise<void> {
    await this.clientFor(credentials).delete(`customers/${id}`)
  }

  // ── Orders ────────────────────────────────────────────────────────────────

  /**
   * GET /order — https://gitlab.com/jtl-software/jtl-shop/core/-/raw/v5.8.0/includes/src/REST/Controllers/OrderController.php:
   * "$routeGroup->get('/order', $this->index(...));"
   */
  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    return this.listKeyset<JtlOrderModel, Order>(credentials, params, 'order', transformOrderModel)
  }

  /** "$routeGroup->get('/order/{id}', $this->show(...));" */
  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const raw = await this.clientFor(credentials).getItem<JtlOrderModel>(
      `order/${encodeURIComponent(id)}`,
    )
    return transformOrderModel(raw)
  }

  async createOrder(credentials: Credentials, data: Partial<Order>): Promise<Order> {
    const raw = await this.clientFor(credentials).post<RawJtlShopOrder>(
      'orders',
      untransformOrder(data),
    )
    return transformOrder(raw)
  }

  async updateOrder(credentials: Credentials, id: string, data: Partial<Order>): Promise<Order> {
    const raw = await this.clientFor(credentials).put<RawJtlShopOrder>(
      `orders/${id}`,
      untransformOrder(data),
    )
    return transformOrder(raw)
  }

  async cancelOrder(
    credentials: Credentials,
    id: string,
    _data?: { reason?: string },
  ): Promise<Order> {
    // JTL-Shop cancellation is done by setting status to 4 (cancelled)
    const raw = await this.clientFor(credentials).put<RawJtlShopOrder>(`orders/${id}`, {
      status: 4,
      cancelReason: _data?.reason,
    })
    return transformOrder(raw)
  }

  // ── Fulfillments ──────────────────────────────────────────────────────────

  /** Refused: OrderController registers only "/order" and "/order/{id}"; no shipment route exists. */
  async listFulfillments(_credentials: Credentials, _params: QueryParams): Promise<Fulfillment[]> {
    return this.refuse(
      'JTL-Shop cannot list fulfillments: its REST API registers no shipment route (the route table is the registerRoutes() of the 25 controllers in Registrator::$classes, and none serves shipments)',
    )
  }

  async getFulfillment(_credentials: Credentials, _id: string): Promise<Fulfillment> {
    return this.refuse(
      'JTL-Shop cannot read a fulfillment: its REST API registers no shipment route (the route table is the registerRoutes() of the 25 controllers in Registrator::$classes, and none serves shipments)',
    )
  }

  async createFulfillment(
    credentials: Credentials,
    data: Partial<Fulfillment>,
  ): Promise<Fulfillment> {
    if (!data.orderId) throw new Error('createFulfillment requires orderId')
    const raw = await this.clientFor(credentials).post<RawJtlShopFulfillment>(
      `orders/${data.orderId}/shipments`,
      untransformFulfillment(data),
    )
    return transformFulfillment(raw)
  }

  async updateFulfillment(
    credentials: Credentials,
    id: string,
    data: Partial<Fulfillment>,
  ): Promise<Fulfillment> {
    const [orderId, fulfillmentId] = id.split(':')
    if (!orderId || !fulfillmentId) {
      throw new Error('Invalid fulfillment id format: expected `orderId:fulfillmentId`')
    }
    const raw = await this.clientFor(credentials).put<RawJtlShopFulfillment>(
      `orders/${orderId}/shipments/${fulfillmentId}`,
      untransformFulfillment(data),
    )
    return transformFulfillment(raw)
  }

  // ── Refunds ───────────────────────────────────────────────────────────────

  /** Refused: OrderController registers only "/order" and "/order/{id}"; no refund route exists. */
  async listRefunds(_credentials: Credentials, _params: QueryParams): Promise<Refund[]> {
    return this.refuse(
      'JTL-Shop cannot list refunds: its REST API registers no refund route (the route table is the registerRoutes() of the 25 controllers in Registrator::$classes, and none serves refunds)',
    )
  }

  async getRefund(_credentials: Credentials, _id: string): Promise<Refund> {
    return this.refuse(
      'JTL-Shop cannot read a refund: its REST API registers no refund route (the route table is the registerRoutes() of the 25 controllers in Registrator::$classes, and none serves refunds)',
    )
  }

  async createRefund(credentials: Credentials, data: Partial<Refund>): Promise<Refund> {
    if (!data.orderId) throw new Error('createRefund requires orderId')
    const raw = await this.clientFor(credentials).post<RawJtlShopRefund>(
      `orders/${data.orderId}/refunds`,
      untransformRefund(data),
    )
    return transformRefund(raw, data.orderId)
  }

  // ── Discounts ─────────────────────────────────────────────────────────────

  /**
   * Refused. Registrator.php v5.8.0 builds the route group only from its
   * controller list ("$classes = Dispatcher::getInstance()->getData(\HOOK_RESTAPI_REGISTER_CONTROLLER, self::$classes);"),
   * and none of those controllers is a coupon, voucher or discount controller.
   */
  async listDiscounts(_credentials: Credentials, _params: QueryParams): Promise<Discount[]> {
    return this.refuse(
      'JTL-Shop cannot list discounts: its REST API registers no coupon route (the route table is the registerRoutes() of the 25 controllers in Registrator::$classes, and none serves coupons)',
    )
  }

  async getDiscount(_credentials: Credentials, _id: string): Promise<Discount> {
    return this.refuse(
      'JTL-Shop cannot read a discount: its REST API registers no coupon route (the route table is the registerRoutes() of the 25 controllers in Registrator::$classes, and none serves coupons)',
    )
  }

  async createDiscount(credentials: Credentials, data: Partial<Discount>): Promise<Discount> {
    const raw = await this.clientFor(credentials).post<RawJtlShopCoupon>(
      'coupons',
      untransformDiscount(data),
    )
    return transformDiscount(raw)
  }

  async updateDiscount(
    credentials: Credentials,
    id: string,
    data: Partial<Discount>,
  ): Promise<Discount> {
    const raw = await this.clientFor(credentials).put<RawJtlShopCoupon>(
      `coupons/${id}`,
      untransformDiscount(data),
    )
    return transformDiscount(raw)
  }

  async deleteDiscount(credentials: Credentials, id: string): Promise<void> {
    await this.clientFor(credentials).delete(`coupons/${id}`)
  }
}
