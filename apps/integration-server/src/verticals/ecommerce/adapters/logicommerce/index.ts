/**
 * LogiCommerce adapter for the ecommerce vertical.
 *
 * Reads go to LogiCommerce API Sync (https://api-sync.logicommerce.cloud/v1,
 * reference at https://api-sync.logicommerce.cloud/docs/reference.cfm) with
 * the `appId` + `Authorization: Basic <token>` headers its authentication
 * guide documents (see ./auth.ts and ./api-sync-client.ts). API Sync is not
 * OAuth: a connection is an appId and appKey entered on the Connect page.
 *
 *  - products: GET /products, GET /products/{id}
 *  - collections: categories, GET /categories, GET /categories/{id}
 *  - locations: GET /physicalLocations, GET /physicalLocations/{id}
 *  - customers: accounts, GET /accounts, GET /accounts/{id}
 *  - orders: GET /orders, GET /orders/{id}
 *  - fulfillments: an order's shipments, GET /orders/{id}/shipments
 *  - refunds: an order's returns, GET /orders/{id}/returns, GET /returns/{id}
 *
 * Every list pages with the documented `page` ("Requested page number.") and
 * `perPage` ("Quantity of elements per page.", default 100). No maximum
 * `perPage` is documented, so the caller's limit is sent as is.
 *
 * Variants, discounts, inventory levels and transactions refuse with 501
 * before sending anything; each refusal quotes why.
 *
 * The write methods and the webhook verifier below still carry the Shopify
 * adapter this one was copied from (Shopify Admin REST paths on
 * `{shop}.myshopify.com`, Shopify's webhook HMAC). They are out of scope for
 * this read rebuild and do not exist at LogiCommerce. The write methods refuse
 * with 501 before building their client, so the API Sync appKey is never sent
 * to a Shopify host.
 */

import {
  callerLimit,
  pageLocally,
  pageOffset,
  reportUpstreamPage,
  simpleApiKey,
} from '@opensteward/shared'
import type { CredentialField, Credentials, QueryParams } from '@opensteward/shared'
import type { EcommerceAdapter } from '../../adapter/interface'
import type { Product, ProductVariant } from '../../schema/product'
import type { Collection } from '../../schema/collection'
import type { Location } from '../../schema/location'
import type { InventoryLevel } from '../../schema/inventory'
import type { Customer } from '../../schema/customer'
import type { Order } from '../../schema/order'
import type { Fulfillment } from '../../schema/fulfillment'
import type { Refund } from '../../schema/refund'
import type { Transaction } from '../../schema/transaction'
import type { Discount } from '../../schema/discount'
import type { WebhookEvent } from '../../schema/webhook'

import { LogicommerceSyncClient } from './api-sync-client'
import { ShopifyClient } from './client'
import { verifyShopifyWebhook, parseShopifyWebhookEvents } from './webhook'

import { transformLogicommerceProduct, type RawLogicommerceProduct } from './transform/lc-product'
import {
  transformLogicommerceCategory,
  type RawLogicommerceCategory,
} from './transform/lc-collection'
import {
  transformLogicommerceLocation,
  type RawLogicommercePhysicalLocation,
} from './transform/lc-location'
import { transformLogicommerceAccount, type RawLogicommerceAccount } from './transform/lc-customer'
import { transformLogicommerceOrder, type RawLogicommerceOrder } from './transform/lc-order'
import {
  transformLogicommerceShipment,
  type RawLogicommerceShipment,
} from './transform/lc-fulfillment'
import { transformLogicommerceReturn, type RawLogicommerceReturn } from './transform/lc-refund'

import {
  transformProduct,
  untransformProduct,
  transformVariant,
  untransformVariant,
  type RawShopifyProduct,
  type RawShopifyVariant,
} from './transform/product'
import {
  transformCollection,
  untransformCollection,
  type RawShopifyCollection,
} from './transform/collection'
import { transformInventoryLevel, type RawShopifyInventoryLevel } from './transform/inventory'
import {
  transformCustomer,
  untransformCustomer,
  type RawShopifyCustomer,
} from './transform/customer'
import { transformOrder, untransformOrder, type RawShopifyOrder } from './transform/order'
import {
  transformFulfillment,
  untransformFulfillment,
  type RawShopifyFulfillment,
} from './transform/fulfillment'
import { transformRefund, untransformRefund, type RawShopifyRefund } from './transform/refund'
import {
  transformTransaction,
  untransformTransaction,
  type RawShopifyTransaction,
} from './transform/transaction'
import {
  transformDiscount,
  untransformDiscount,
  type RawShopifyPriceRule,
  type RawShopifyDiscountCode,
} from './transform/discount'

export interface LogicommerceAdapterConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
  /** Store subdomain, used only by the write methods' Shopify-era client. */
  shop: string
  scopes?: string[]
}

/** The error the router and sync worker treat as "this platform cannot do that". */
function notSupported(message: string): Error {
  return Object.assign(new Error(message), { statusCode: 501, code: 'NOT_SUPPORTED' })
}

function notFound(message: string): Error {
  return Object.assign(new Error(message), { statusCode: 404, code: 'NOT_FOUND' })
}

/**
 * The paging block of GET /products, /categories and /physicalLocations, e.g.
 * `"CURSORS": { "NEXT" :"http://api-sync.logicommerce.cloud/v1/products?page=3&perPage=100",
 * "PREVIOUS" :"http://api-sync.logicommerce.cloud/v1/products?page=1&perPage=100" }`.
 * The categories example shows a missing neighbour as an empty string
 * (`"PREVIOUS" :""`).
 */
interface Cursors {
  NEXT?: string
  PREVIOUS?: string
}

/** Whether a `CURSORS` block names a next page; `undefined` when the response carries none. */
function nextPageFromCursors(cursors: Cursors | undefined): boolean | undefined {
  if (!cursors || typeof cursors !== 'object') return undefined
  return typeof cursors.NEXT === 'string' && cursors.NEXT !== ''
}

/**
 * GET /accounts pages with its own block: `"PAGINATION": { "PAGE" : 0,
 * "PERPAGE" : 0, "TOTALITEMS" : 0, "TOTALPAGES" : 0 }`.
 */
interface AccountsPagination {
  PAGE?: number
  PERPAGE?: number
  TOTALITEMS?: number
  TOTALPAGES?: number
}

/**
 * Every GET /orders status. The endpoint's `statuses` parameter: "Filters by
 * order status. If this parameter is not defined, it will return the orders
 * on Incoming status. Allowed values: 0 - Incidents, 1 - Incoming, 2 - In
 * process, 4 - Completed, 6 - Deleted.-1 - Denied, -2 - Pending approval,
 * -11 - Confirm delete." Unset, the list would hold only Incoming orders.
 * The comma-separated form is the one the same module documents as the
 * default of `statuses` on GET /orders/pending: "1,2,3,4,5".
 */
const ALL_ORDER_STATUSES = '0,1,2,4,6,-1,-2,-11'

const NO_VARIANT_PRICE =
  'LogiCommerce cannot list variants: its variants are option value combinations, and GET /products/{id}/combinations ("Returns information on the option value combinations of the the stated product") documents only EAN, ID, ISBN, JAN, OPTIONSVALUES, PID, SKU and UPC, with no price, which the canonical variant requires'

const NO_DISCOUNTS =
  'LogiCommerce cannot list discounts: API Sync has no promotion endpoint, and its "Discount Vouchers" module (GET /vouchers, "Returns the gift vouchers information") holds gift vouchers with a stored balance that "can be used in different purchases until its balance runs out or expires", not discount rules'

const NO_INVENTORY_LIST =
  'LogiCommerce cannot list inventory levels: stock is documented only per product (GET /products/{id}/stocks, "Returns the stock of the stated product."), keyed by a WAREHOUSE that API Sync documents no list of and that is not a physical location, with the combination named only by its PID'

const NO_TRANSACTIONS =
  'LogiCommerce cannot list transactions: API Sync documents no payment or transaction endpoint (its sales module covers orders, invoices, credit notes, delivery notes, returns, RMAs and shipments)'

export class LogicommerceAdapter implements EcommerceAdapter {
  readonly platform = 'logicommerce'
  readonly version = '0.2.0'

  private shop: string

  constructor(config: LogicommerceAdapterConfig) {
    this.shop = config.shop
  }

  // ── Auth ──────────────────────────────────────────────────────────────────

  /**
   * API Sync documents no OAuth. Its authentication guide: "With the appId
   * and the appKey obtained in the credentials section, we will proceed to
   * the creation of the authentication token."
   */
  getAuthUrl(_state: string, _overrideScopes?: string[]): string {
    throw notSupported(
      'LogiCommerce API Sync has no OAuth flow: it authenticates with an appId and appKey entered on the Connect page',
    )
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    throw notSupported(
      'LogiCommerce API Sync has no OAuth flow: it authenticates with an appId and appKey entered on the Connect page',
    )
  }

  credentialFields(): CredentialField[] {
    return [
      {
        name: 'appId',
        label: 'App ID',
        type: 'text',
        helpText:
          'The API Sync appId from the credentials section of your LogiCommerce back office.',
        required: true,
      },
      ...APP_KEY_FORM.credentialFields(),
    ]
  }

  /** Stores the appKey (the secret) as `accessToken` and the appId in `extra.appId`. */
  async exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
    const appId = (fields?.['appId'] ?? '').trim()
    if (!appId) throw new Error('App ID is required.')
    const { accessToken } = await APP_KEY_FORM.exchangeCredentials(fields)
    return { accessToken, extra: { appId } }
  }

  /** An appId/appKey pair does not expire; there is nothing to refresh. */
  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return credentials
  }

  // ── Webhooks ──────────────────────────────────────────────────────────────

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return verifyShopifyWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    const topic =
      (payload['__topic'] as string | undefined) ?? (payload['topic'] as string | undefined)
    return parseShopifyWebhookEvents(payload, topic)
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private api(credentials: Credentials): LogicommerceSyncClient {
    return new LogicommerceSyncClient(credentials)
  }

  /**
   * The write methods' Shopify-era client. It refuses before it is built:
   * `credentials.accessToken` now holds the LogiCommerce API Sync appKey, and
   * the Shopify client would send it as `X-Shopify-Access-Token` to
   * `{shop}.myshopify.com`. The write methods' Shopify Admin REST paths do not
   * exist at LogiCommerce, so no write could succeed there anyway.
   */
  private client(_credentials: Credentials): ShopifyClient {
    throw notSupported(
      `LogiCommerce writes are not supported: this adapter's write methods target Shopify Admin REST paths on ${this.shop}.myshopify.com, which do not exist at LogiCommerce API Sync`,
    )
  }

  /** The caller's 1-based page and exact limit, as `page` and `perPage`. */
  private pageParams(params: QueryParams): { page: number; perPage: number } {
    const perPage = callerLimit(params)
    return { page: pageOffset(params, perPage) / perPage + 1, perPage }
  }

  /**
   * One page of a list that answers with a `CURSORS` block (GET /products,
   * /categories, /physicalLocations): `hasMore` is whether `CURSORS.NEXT`
   * names a page.
   */
  private async cursorsPage<R>(
    credentials: Credentials,
    params: QueryParams,
    path: string,
    rowsKey: string,
  ): Promise<R[]> {
    const body = await this.api(credentials).get<Record<string, unknown> | undefined>(
      path,
      this.pageParams(params),
    )
    const hasMore = nextPageFromCursors(body?.['CURSORS'] as Cursors | undefined)
    if (hasMore !== undefined) reportUpstreamPage(params, { hasMore })
    return (body?.[rowsKey] as R[] | undefined) ?? []
  }

  /** The order id an order-scoped list needs, as the adapter always took it. */
  private orderIdParam(params: QueryParams, what: string, path: string): string {
    const orderId = params['order_id'] ?? params['orderId']
    if (orderId === undefined || orderId === null || String(orderId) === '') {
      throw notSupported(`LogiCommerce lists ${what} only per order (${path}); pass order_id`)
    }
    return String(orderId)
  }

  /** Split a `<orderId>:<childId>` id. */
  private splitId(id: string, what: string): [string, string] {
    const [orderId, childId, ...rest] = id.split(':')
    if (!orderId || !childId || rest.length > 0) {
      throw new Error(`Invalid ${what} id format: expected \`orderId:${what}Id\``)
    }
    return [orderId, childId]
  }

  // ── Products ──────────────────────────────────────────────────────────────

  async listProducts(credentials: Credentials, params: QueryParams): Promise<Product[]> {
    const rows = await this.cursorsPage<RawLogicommerceProduct>(
      credentials,
      params,
      '/products',
      'PRODUCTS',
    )
    return rows.map(transformLogicommerceProduct)
  }

  async getProduct(credentials: Credentials, id: string): Promise<Product> {
    const raw = await this.api(credentials).get<RawLogicommerceProduct>(
      `/products/${encodeURIComponent(id)}`,
    )
    return transformLogicommerceProduct(raw)
  }

  async createProduct(credentials: Credentials, data: Partial<Product>): Promise<Product> {
    const res = await this.client(credentials).post<{ product: RawShopifyProduct }>(
      'products.json',
      { product: untransformProduct(data) },
    )
    return transformProduct(res.product)
  }

  async updateProduct(
    credentials: Credentials,
    id: string,
    data: Partial<Product>,
  ): Promise<Product> {
    const res = await this.client(credentials).put<{ product: RawShopifyProduct }>(
      `products/${id}.json`,
      { product: { id, ...untransformProduct(data) } },
    )
    return transformProduct(res.product)
  }

  async deleteProduct(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`products/${id}.json`)
  }

  // ── Variants ──────────────────────────────────────────────────────────────

  async listVariants(_credentials: Credentials, _params: QueryParams): Promise<ProductVariant[]> {
    throw notSupported(NO_VARIANT_PRICE)
  }

  /** GET /products/combinations/{id} documents the same priceless combination. */
  async getVariant(_credentials: Credentials, _id: string): Promise<ProductVariant> {
    throw notSupported(NO_VARIANT_PRICE)
  }

  async updateVariant(
    credentials: Credentials,
    id: string,
    data: Partial<ProductVariant>,
  ): Promise<ProductVariant> {
    const res = await this.client(credentials).put<{ variant: RawShopifyVariant }>(
      `variants/${id}.json`,
      { variant: { id, ...untransformVariant(data) } },
    )
    return transformVariant(res.variant)
  }

  // ── Collections ───────────────────────────────────────────────────────────

  async listCollections(credentials: Credentials, params: QueryParams): Promise<Collection[]> {
    const rows = await this.cursorsPage<RawLogicommerceCategory>(
      credentials,
      params,
      '/categories',
      'CATEGORIES',
    )
    return rows.map(transformLogicommerceCategory)
  }

  async getCollection(credentials: Credentials, id: string): Promise<Collection> {
    const raw = await this.api(credentials).get<RawLogicommerceCategory>(
      `/categories/${encodeURIComponent(id)}`,
    )
    return transformLogicommerceCategory(raw)
  }

  async createCollection(credentials: Credentials, data: Partial<Collection>): Promise<Collection> {
    // Only manual (custom) collections are creatable via the REST API.
    const res = await this.client(credentials).post<{
      custom_collection: RawShopifyCollection
    }>('custom_collections.json', { custom_collection: untransformCollection(data) })
    return transformCollection(res.custom_collection, 'MANUAL')
  }

  async updateCollection(
    credentials: Credentials,
    id: string,
    data: Partial<Collection>,
  ): Promise<Collection> {
    const res = await this.client(credentials).put<{
      custom_collection: RawShopifyCollection
    }>(`custom_collections/${id}.json`, {
      custom_collection: { id, ...untransformCollection(data) },
    })
    return transformCollection(res.custom_collection, 'MANUAL')
  }

  async deleteCollection(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`custom_collections/${id}.json`)
  }

  // ── Locations ─────────────────────────────────────────────────────────────

  async listLocations(credentials: Credentials, params: QueryParams): Promise<Location[]> {
    const rows = await this.cursorsPage<RawLogicommercePhysicalLocation>(
      credentials,
      params,
      '/physicalLocations',
      'PHYSICALLOCATIONS',
    )
    return rows.map(transformLogicommerceLocation)
  }

  async getLocation(credentials: Credentials, id: string): Promise<Location> {
    const raw = await this.api(credentials).get<RawLogicommercePhysicalLocation>(
      `/physicalLocations/${encodeURIComponent(id)}`,
    )
    return transformLogicommerceLocation(raw)
  }

  // ── Inventory ─────────────────────────────────────────────────────────────

  async listInventoryLevels(
    _credentials: Credentials,
    _params: QueryParams,
  ): Promise<InventoryLevel[]> {
    throw notSupported(NO_INVENTORY_LIST)
  }

  async adjustInventoryLevel(
    credentials: Credentials,
    data: { variantId: string; locationId: string; delta: number },
  ): Promise<InventoryLevel> {
    // `variantId` here is really the inventory_item_id — this matches the
    // transform layer which uses the item id in place of the variant id.
    const res = await this.client(credentials).post<{
      inventory_level: RawShopifyInventoryLevel
    }>('inventory_levels/adjust.json', {
      inventory_item_id: data.variantId,
      location_id: data.locationId,
      available_adjustment: data.delta,
    })
    return transformInventoryLevel(res.inventory_level)
  }

  async setInventoryLevel(
    credentials: Credentials,
    data: { variantId: string; locationId: string; available: number },
  ): Promise<InventoryLevel> {
    const res = await this.client(credentials).post<{
      inventory_level: RawShopifyInventoryLevel
    }>('inventory_levels/set.json', {
      inventory_item_id: data.variantId,
      location_id: data.locationId,
      available: data.available,
    })
    return transformInventoryLevel(res.inventory_level)
  }

  // ── Customers ─────────────────────────────────────────────────────────────

  /**
   * GET /accounts: "Gets a collection of accounts by applying the provided
   * filters and parameters." `lastUsedFrom`: "The returned items must have
   * been updated on the specified date or later. Format ISO-8601
   * ('YYYY-MM-DDThh:mm:ssZ')". Its `PAGINATION.TOTALITEMS` gives the total.
   */
  async listCustomers(credentials: Credentials, params: QueryParams): Promise<Customer[]> {
    const { page, perPage } = this.pageParams(params)
    const query: Record<string, unknown> = { page, perPage }
    if (params.updatedAfter) {
      query.lastUsedFrom = params.updatedAfter.toISOString().replace(/\.\d{3}Z$/, 'Z')
    }
    const body = await this.api(credentials).get<
      { ITEMS?: RawLogicommerceAccount[]; PAGINATION?: AccountsPagination } | undefined
    >('/accounts', query)
    const total = body?.PAGINATION?.TOTALITEMS
    if (typeof total === 'number' && Number.isFinite(total)) {
      reportUpstreamPage(params, { totalCount: total, hasMore: page * perPage < total })
    }
    return (body?.ITEMS ?? []).map(transformLogicommerceAccount)
  }

  async getCustomer(credentials: Credentials, id: string): Promise<Customer> {
    const raw = await this.api(credentials).get<RawLogicommerceAccount>(
      `/accounts/${encodeURIComponent(id)}`,
    )
    return transformLogicommerceAccount(raw)
  }

  async createCustomer(credentials: Credentials, data: Partial<Customer>): Promise<Customer> {
    const res = await this.client(credentials).post<{ customer: RawShopifyCustomer }>(
      'customers.json',
      { customer: untransformCustomer(data) },
    )
    return transformCustomer(res.customer)
  }

  async updateCustomer(
    credentials: Credentials,
    id: string,
    data: Partial<Customer>,
  ): Promise<Customer> {
    const res = await this.client(credentials).put<{ customer: RawShopifyCustomer }>(
      `customers/${id}.json`,
      { customer: { id, ...untransformCustomer(data) } },
    )
    return transformCustomer(res.customer)
  }

  async deleteCustomer(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`customers/${id}.json`)
  }

  // ── Orders ────────────────────────────────────────────────────────────────

  /**
   * GET /orders: "Returns the information of the orders." Its documented
   * response has no `CURSORS` block (only `ITEMS` and `PAGERPARAMETERS`,
   * neither described), so no end of the list is reported and the caller
   * reads it from a short page.
   */
  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const body = await this.api(credentials).get<{ ORDERS?: RawLogicommerceOrder[] } | undefined>(
      '/orders',
      { ...this.pageParams(params), statuses: ALL_ORDER_STATUSES },
    )
    return (body?.ORDERS ?? []).map(transformLogicommerceOrder)
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const raw = await this.api(credentials).get<RawLogicommerceOrder>(
      `/orders/${encodeURIComponent(id)}`,
    )
    return transformLogicommerceOrder(raw)
  }

  async createOrder(credentials: Credentials, data: Partial<Order>): Promise<Order> {
    const res = await this.client(credentials).post<{ order: RawShopifyOrder }>('orders.json', {
      order: untransformOrder(data),
    })
    return transformOrder(res.order)
  }

  async updateOrder(credentials: Credentials, id: string, data: Partial<Order>): Promise<Order> {
    const res = await this.client(credentials).put<{ order: RawShopifyOrder }>(
      `orders/${id}.json`,
      { order: { id, ...untransformOrder(data) } },
    )
    return transformOrder(res.order)
  }

  async cancelOrder(
    credentials: Credentials,
    id: string,
    data?: { reason?: string },
  ): Promise<Order> {
    const res = await this.client(credentials).post<{ order: RawShopifyOrder }>(
      `orders/${id}/cancel.json`,
      { reason: data?.reason },
    )
    return transformOrder(res.order)
  }

  // ── Fulfillments ──────────────────────────────────────────────────────────

  /**
   * GET /orders/{id}/shipments, "Returns the shipments of the order with the
   * indicated identifier.", documents no paging parameters: the whole list
   * comes back and is paged here.
   */
  async listFulfillments(credentials: Credentials, params: QueryParams): Promise<Fulfillment[]> {
    const orderId = this.orderIdParam(params, 'shipments', 'GET /orders/{id}/shipments')
    const body = await this.api(credentials).get<
      { SHIPMENTS?: RawLogicommerceShipment[] } | undefined
    >(`/orders/${encodeURIComponent(orderId)}/shipments`)
    const rows = (body?.SHIPMENTS ?? []).map((s) => transformLogicommerceShipment(s, orderId))
    return pageLocally(rows, params)
  }

  /** Reads the shipment back from its order's list: ids are `<orderId>:<shipmentId>`. */
  async getFulfillment(credentials: Credentials, id: string): Promise<Fulfillment> {
    const [orderId, shipmentId] = this.splitId(id, 'fulfillment')
    const body = await this.api(credentials).get<
      { SHIPMENTS?: RawLogicommerceShipment[] } | undefined
    >(`/orders/${encodeURIComponent(orderId)}/shipments`)
    const raw = (body?.SHIPMENTS ?? []).find((s) => String(s.ID) === shipmentId)
    if (!raw) throw notFound(`LogiCommerce order ${orderId} has no shipment ${shipmentId}`)
    return transformLogicommerceShipment(raw, orderId)
  }

  async createFulfillment(
    credentials: Credentials,
    data: Partial<Fulfillment>,
  ): Promise<Fulfillment> {
    if (!data.orderId) throw new Error('createFulfillment requires orderId')
    const res = await this.client(credentials).post<{ fulfillment: RawShopifyFulfillment }>(
      'fulfillments.json',
      {
        fulfillment: {
          ...untransformFulfillment(data),
          line_items_by_fulfillment_order: [
            // The caller should provide platform-specific details in metadata
            // for nontrivial cases; this is a minimal default.
          ],
        },
      },
    )
    return transformFulfillment(res.fulfillment)
  }

  async updateFulfillment(
    credentials: Credentials,
    id: string,
    data: Partial<Fulfillment>,
  ): Promise<Fulfillment> {
    const res = await this.client(credentials).post<{ fulfillment: RawShopifyFulfillment }>(
      `fulfillments/${id}/update_tracking.json`,
      {
        fulfillment: {
          notify_customer: data.notifyCustomer,
          tracking_info: {
            number: data.trackingNumber,
            url: data.trackingUrl,
            company: data.carrier,
          },
        },
      },
    )
    return transformFulfillment(res.fulfillment)
  }

  async cancelFulfillment(credentials: Credentials, id: string): Promise<Fulfillment> {
    const res = await this.client(credentials).post<{ fulfillment: RawShopifyFulfillment }>(
      `fulfillments/${id}/cancel.json`,
    )
    return transformFulfillment(res.fulfillment)
  }

  // ── Refunds ───────────────────────────────────────────────────────────────

  /**
   * GET /orders/{id}/returns, "Returns information on the returns of an
   * order.", documents no paging parameters: the whole list comes back and is
   * paged here. Its documented response key is lowercase: `"returns": [ … ]`.
   */
  async listRefunds(credentials: Credentials, params: QueryParams): Promise<Refund[]> {
    const orderId = this.orderIdParam(params, 'returns', 'GET /orders/{id}/returns')
    const body = await this.api(credentials).get<{ returns?: RawLogicommerceReturn[] } | undefined>(
      `/orders/${encodeURIComponent(orderId)}/returns`,
    )
    const rows = (body?.returns ?? []).map((r) => transformLogicommerceReturn(r, orderId))
    return pageLocally(rows, params)
  }

  /**
   * Reads the return back from its order's list (GET /orders/{id}/returns);
   * ids are `<orderId>:<returnId>`. GET /returns/{id} documents no field that
   * names the return's order, so reading it there could not check that the
   * return belongs to the order in the id.
   */
  async getRefund(credentials: Credentials, id: string): Promise<Refund> {
    const [orderId, returnId] = this.splitId(id, 'refund')
    const body = await this.api(credentials).get<{ returns?: RawLogicommerceReturn[] } | undefined>(
      `/orders/${encodeURIComponent(orderId)}/returns`,
    )
    const raw = (body?.returns ?? []).find((r) => String(r.ID) === returnId)
    if (!raw) throw notFound(`LogiCommerce order ${orderId} has no return ${returnId}`)
    return transformLogicommerceReturn(raw, orderId)
  }

  async createRefund(credentials: Credentials, data: Partial<Refund>): Promise<Refund> {
    if (!data.orderId) throw new Error('createRefund requires orderId')
    const res = await this.client(credentials).post<{ refund: RawShopifyRefund }>(
      `orders/${data.orderId}/refunds.json`,
      { refund: untransformRefund(data) },
    )
    return transformRefund(res.refund)
  }

  // ── Transactions ──────────────────────────────────────────────────────────

  async listTransactions(_credentials: Credentials, _params: QueryParams): Promise<Transaction[]> {
    throw notSupported(NO_TRANSACTIONS)
  }

  async getTransaction(_credentials: Credentials, _id: string): Promise<Transaction> {
    throw notSupported(NO_TRANSACTIONS)
  }

  async createTransaction(
    credentials: Credentials,
    data: Partial<Transaction>,
  ): Promise<Transaction> {
    if (!data.orderId) throw new Error('createTransaction requires orderId')
    const res = await this.client(credentials).post<{
      transaction: RawShopifyTransaction
    }>(`orders/${data.orderId}/transactions.json`, {
      transaction: untransformTransaction(data),
    })
    return transformTransaction(res.transaction)
  }

  // ── Discounts ─────────────────────────────────────────────────────────────

  async listDiscounts(_credentials: Credentials, _params: QueryParams): Promise<Discount[]> {
    throw notSupported(NO_DISCOUNTS)
  }

  async getDiscount(_credentials: Credentials, _id: string): Promise<Discount> {
    throw notSupported(NO_DISCOUNTS)
  }

  async createDiscount(credentials: Credentials, data: Partial<Discount>): Promise<Discount> {
    const client = this.client(credentials)
    const rule = await client.post<{ price_rule: RawShopifyPriceRule }>('price_rules.json', {
      price_rule: untransformDiscount(data),
    })
    let code: RawShopifyDiscountCode | undefined
    if (data.code) {
      const cr = await client.post<{ discount_code: RawShopifyDiscountCode }>(
        `price_rules/${rule.price_rule.id}/discount_codes.json`,
        { discount_code: { code: data.code } },
      )
      code = cr.discount_code
    }
    return transformDiscount(rule.price_rule, code)
  }

  async updateDiscount(
    credentials: Credentials,
    id: string,
    data: Partial<Discount>,
  ): Promise<Discount> {
    const res = await this.client(credentials).put<{ price_rule: RawShopifyPriceRule }>(
      `price_rules/${id}.json`,
      { price_rule: { id, ...untransformDiscount(data) } },
    )
    return transformDiscount(res.price_rule)
  }

  async deleteDiscount(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`price_rules/${id}.json`)
  }
}

/** The appKey half of the Connect form: the secret, stored as `accessToken`. */
const APP_KEY_FORM = simpleApiKey({
  fieldName: 'appKey',
  label: 'App key',
  helpText: 'The API Sync appKey from the credentials section of your LogiCommerce back office.',
})
