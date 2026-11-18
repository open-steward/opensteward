/**
 * Toast adapter for the ecommerce vertical.
 *
 * Maps the Toast POS API to canonical ecommerce resources. Toast is a
 * restaurant/hospitality POS platform (40k+ restaurants). All URLs are
 * restaurant-scoped via the `Toast-Restaurant-External-ID` header.
 *
 * Mapping (every path from the first-party OpenAPI specs on doc.toasttab.com):
 *  - Products     ← Configuration API GET /config/v2/menuItems (pageToken chain)
 *  - Collections  ← Configuration API GET /config/v2/menuGroups (pageToken chain)
 *  - Locations    ← Restaurants API GET /restaurants/v1/restaurants/{restaurantGUID}
 *  - Inventory    ← Stock API GET /stock/v1/inventory (whole set, sliced locally)
 *  - Orders       ← Orders API GET /orders/v2/ordersBulk (pageSize/page)
 *  - Transactions ← Orders API GET /orders/v2/payments?paidBusinessDate + /payments/{guid}
 *  - Refunds      ← Orders API GET /orders/v2/payments?refundBusinessDate + /payments/{guid}
 *  - Discounts    ← Configuration API GET /config/v2/discounts (pageToken chain)
 *
 * Money: Toast amounts are decimals in the restaurant's currency, which only
 * the Restaurants API names (`General.currencyCode`); see transform/order.ts.
 *
 * ── Resource coverage ──────────────────────────────────────────────────────
 * Unavailable: fulfillment — Toast is a restaurant POS with no shipping
 *   model; order delivery state (dine-in/takeout/delivery) does not map to
 *   the canonical Fulfillment resource (tracking number, carrier, shipment).
 * Refused (501 NOT_SUPPORTED): listCustomers / getCustomer — no Toast API
 *   lists or reads guests; guest details exist only on order checks
 *   (`Check.customer`).
 * Write methods other than POST /orders/v2/orders and the order void target
 *   paths Toast does not document (the Configuration API is GET-only, and
 *   there is no /customers or /payments/v1 API); they are unchanged here.
 */

import type { Credentials, QueryParams } from '@opensteward/shared'
import type { EcommerceAdapter } from '../../adapter/interface'
import type { Product } from '../../schema/product'
import type { Collection } from '../../schema/collection'
import type { Location } from '../../schema/location'
import type { InventoryLevel } from '../../schema/inventory'
import type { Customer } from '../../schema/customer'
import type { Order } from '../../schema/order'
import type { Refund } from '../../schema/refund'
import type { Transaction } from '../../schema/transaction'
import type { Discount } from '../../schema/discount'
import type { WebhookEvent } from '../../schema/webhook'

import type { AxiosError } from 'axios'
import type { CredentialField } from '@opensteward/shared'
import {
  DEFAULT_PAGE_LIMIT,
  connectionScope,
  cursorPagerKey,
  pageByRows,
  pageLocally,
  pageOffset,
  reportUpstreamPage,
} from '@opensteward/shared'
import {
  CREDENTIAL_FIELDS,
  exchangeCode as toastExchangeCode,
  exchangeCredentials as toastExchangeCredentials,
  refreshAccessToken,
} from './auth'
import { ToastClient } from './client'
import { ORDERS_BULK_MAX_PAGE_SIZE, ORDERS_BULK_START_FLOOR } from './constants'
import { verifyToastWebhook, parseToastWebhookEvents } from './webhook'

import { transformProduct, untransformProduct, type RawToastMenuItem } from './transform/product'
import {
  transformCollection,
  untransformCollection,
  type RawToastMenuGroup,
} from './transform/collection'
import { transformLocation, type RawToastRestaurant } from './transform/location'
import { transformCustomer, untransformCustomer, type RawToastCustomer } from './transform/customer'
import {
  restaurantCurrency,
  transformOrder,
  untransformOrder,
  type RawToastOrder,
} from './transform/order'
import { transformRefund, untransformRefund } from './transform/refund'
import { transformTransaction, type RawToastPayment } from './transform/transaction'
import { transformDiscount, untransformDiscount, type RawToastDiscount } from './transform/discount'
import { transformInventoryLevel, type RawToastInventoryItem } from './transform/inventory'

/** A deliberate refusal the sync worker skips a resource on. */
function notSupported(message: string): Error {
  return Object.assign(new Error(message), { statusCode: 501, code: 'NOT_SUPPORTED' })
}

const DAY_MS = 86_400_000

/** A UTC calendar day as a Toast business date string, `yyyyMMdd`. */
function businessDate(at: Date): string {
  return at.toISOString().slice(0, 10).replace(/-/g, '')
}

/** The business date one calendar day before `yyyymmdd`. */
function previousBusinessDate(yyyymmdd: string): string {
  const at = Date.UTC(+yyyymmdd.slice(0, 4), +yyyymmdd.slice(4, 6) - 1, +yyyymmdd.slice(6, 8))
  return businessDate(new Date(at - DAY_MS))
}

/** The next UTC midnight after `now`. */
function nextUtcMidnight(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1))
}

/**
 * `lastModified` in the documented example format, "`2024-06-20T00:00:00.000%2B0000`"
 * (the %2B is the URL-encoded +; axios encodes it).
 */
function toastTimestamp(at: Date): string {
  return at.toISOString().replace('Z', '+0000')
}

/** Run `fn` over `items` at most `width` at a time, keeping order. */
async function mapLimited<T, R>(
  items: T[],
  width: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const out: R[] = new Array(items.length)
  for (let i = 0; i < items.length; i += width) {
    const batch = await Promise.all(items.slice(i, i + width).map(fn))
    batch.forEach((r, j) => (out[i + j] = r))
  }
  return out
}

export interface ToastAdapterConfig {
  /** Reserved for future configuration. */
  [key: string]: unknown
}

export class ToastAdapter implements EcommerceAdapter {
  readonly platform = 'toast'
  readonly version = '0.1.0'

  credentialFields(): CredentialField[] {
    return CREDENTIAL_FIELDS
  }

  exchangeCredentials(input: Record<string, string>): Promise<Credentials> {
    return toastExchangeCredentials(input)
  }

  // ── Auth ──────────────────────────────────────────────────────────────────

  getAuthUrl(_state: string): string {
    throw new Error(
      'Toast adapter v1 does not support interactive OAuth. ' +
        'Use POST /v1/connections with pre-generated tokens.',
    )
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    return toastExchangeCode()
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return refreshAccessToken(credentials)
  }

  // ── Webhooks ──────────────────────────────────────────────────────────────

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return verifyToastWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parseToastWebhookEvents(payload)
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private client(credentials: Credentials): ToastClient {
    return new ToastClient(credentials)
  }

  /**
   * GET /restaurants/v1/restaurants/{restaurantGUID} with `includeArchived`:
   * "Set `includeArchived` to `true` if the API should return information
   * about the restaurant even if it is archived. The `General` object in the
   * response includes an `archived` value that your integration can use to
   * determine whether a restaurant is archived or not." Without it, "The API
   * will also return an HTTP 404 response if you provided the GUID of an
   * archived restaurant", and `archived` could never be true.
   * https://doc.toasttab.com/openapi/restaurants/operation/restaurantsRestaurantGuidGet/
   */
  private restaurantInfo(client: ToastClient, guid: string): Promise<RawToastRestaurant> {
    return client.get<RawToastRestaurant>(`/restaurants/v1/restaurants/${guid}`, {
      includeArchived: true,
    })
  }

  /** The connection's own restaurant. */
  private restaurant(client: ToastClient): Promise<RawToastRestaurant> {
    return this.restaurantInfo(client, client.restaurantId)
  }

  /** The restaurant's documented `general.currencyCode`, or undefined. */
  private async currency(client: ToastClient): Promise<string | undefined> {
    return restaurantCurrency(await this.restaurant(client))
  }

  /**
   * A Configuration API list: pageToken only, pages sized by data volume, so
   * pageByRows cuts the caller's rows out of the chain. The one documented
   * filter, `lastModified` ("Limits the return data to objects created or
   * modified after a specific date and time"), carries `updatedAfter` and is
   * part of the key; the caller's limit is not, since no size is sent. A 409
   * means the configuration was republished mid-walk: "re-submit the request
   * ... without the pageToken query parameter".
   * https://doc.toasttab.com/doc/devguide/apiResponseDataPagination.html
   */
  private async configList<R, T>(
    credentials: Credentials,
    params: QueryParams,
    path: string,
    collection: string,
    transform: (raw: R) => T,
  ): Promise<T[]> {
    const client = this.client(credentials)
    const filters: Record<string, string> = params.updatedAfter
      ? { lastModified: toastTimestamp(params.updatedAfter) }
      : {}
    const key = cursorPagerKey(
      connectionScope(`toast:${client.restaurantId}`, credentials),
      collection,
      filters,
    )
    const { items } = await pageByRows<T>(
      key,
      params,
      async (cursor) => {
        const page = await client.tokenPage<R>(path, cursor, filters)
        return { items: page.items.map(transform), next: page.next }
      },
      { restartOn: (err) => (err as AxiosError).response?.status === 409 },
    )
    return items
  }

  /**
   * Payment GUIDs from GET /orders/v2/payments, one business day per request,
   * walked newest-first, then each caller-page GUID read with
   * GET /orders/v2/payments/{guid}.
   *
   * "You must include one of the `paidBusinessDate`, `refundBusinessDate`,
   * or `voidBusinessDate` query parameters", each naming one day
   * ("Specify the business day in the format yyyyMMdd"), and the response is
   * "A JSON array of the GUID identifiers for the payments" with no paging.
   * https://doc.toasttab.com/openapi/orders/operation/paymentsGet/
   *
   * Days are UTC calendar days, from tomorrow (a restaurant east of UTC is
   * already on it) back to the day before `updatedAfter` (a business day can
   * trail the UTC date: it is local, and "the business day cutoff ... is set
   * to a value from 0-12 (midnight to noon)"). Both ends are in the key, so
   * page N is stable for a UTC day. Toast documents no retention limit to
   * walk back to, so a call without `updatedAfter` is refused.
   */
  private async paymentsByBusinessDay(
    credentials: Credentials,
    params: QueryParams,
    filter: 'paidBusinessDate' | 'refundBusinessDate',
    resource: string,
  ): Promise<{ client: ToastClient; payments: RawToastPayment[] }> {
    if (!params.updatedAfter) {
      throw notSupported(
        `Toast cannot list ${resource} without updated_after: GET /orders/v2/payments needs ` +
          `"one of the paidBusinessDate, refundBusinessDate, or voidBusinessDate query parameters", ` +
          'one business day per request, and Toast documents no retention limit to walk back to. ' +
          'Pass updated_after to bound the walk.',
      )
    }
    const client = this.client(credentials)
    const newest = businessDate(new Date(Date.now() + DAY_MS))
    const oldest = businessDate(new Date(params.updatedAfter.getTime() - DAY_MS))
    const key = cursorPagerKey(
      connectionScope(`toast:${client.restaurantId}`, credentials),
      `payments:${filter}`,
      { from: oldest, to: newest },
    )
    const { items: guids } = await pageByRows<string>(key, params, async (cursor) => {
      const day = cursor ?? newest
      if (day < oldest) return { items: [], next: undefined }
      const res = await client.get<unknown>('/orders/v2/payments', { [filter]: day })
      const rows = Array.isArray(res) ? res.filter((g): g is string => typeof g === 'string') : []
      return { items: rows, next: day > oldest ? previousBusinessDate(day) : undefined }
    })
    const payments = await mapLimited(guids, 5, (guid) =>
      client.get<RawToastPayment>(`/orders/v2/payments/${guid}`),
    )
    return { client, payments }
  }

  // ── Products (Menu Items) ─────────────────────────────────────────────────

  /**
   * GET /config/v2/menuItems: "Returns an array of `MenuItem` objects
   * containing information about the items and modifiers available from a
   * restaurant." (There is no /menus/v2/menuItems: Menus V2 documents only
   * GET /menus and GET /metadata.)
   * https://doc.toasttab.com/openapi/configuration/operation/menuItemsGet/
   */
  async listProducts(credentials: Credentials, params: QueryParams): Promise<Product[]> {
    return this.configList<RawToastMenuItem, Product>(
      credentials,
      params,
      '/config/v2/menuItems',
      'menuItems',
      transformProduct,
    )
  }

  /** GET /config/v2/menuItems/{guid}: "Returns a `MenuItem` object". */
  async getProduct(credentials: Credentials, id: string): Promise<Product> {
    const client = this.client(credentials)
    const res = await client.get<RawToastMenuItem>(`/config/v2/menuItems/${id}`)
    return transformProduct(res)
  }

  async createProduct(credentials: Credentials, data: Partial<Product>): Promise<Product> {
    const client = this.client(credentials)
    const body = untransformProduct(data)
    const res = await client.post<RawToastMenuItem>('/menus/v2/menuItems', body)
    return transformProduct(res)
  }

  async updateProduct(
    credentials: Credentials,
    id: string,
    data: Partial<Product>,
  ): Promise<Product> {
    const client = this.client(credentials)
    const body = untransformProduct(data)
    const res = await client.patch<RawToastMenuItem>(`/menus/v2/menuItems/${id}`, body)
    return transformProduct(res)
  }

  async deleteProduct(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`/menus/v2/menuItems/${id}`)
  }

  // ── Collections (Menu Groups) ─────────────────────────────────────────────

  /**
   * GET /config/v2/menuGroups: "Returns an array of `MenuGroup` objects
   * containing information about the subsections of the menus configured for
   * a restaurant." https://doc.toasttab.com/openapi/configuration/operation/menuGroupsGet/
   */
  async listCollections(credentials: Credentials, params: QueryParams): Promise<Collection[]> {
    return this.configList<RawToastMenuGroup, Collection>(
      credentials,
      params,
      '/config/v2/menuGroups',
      'menuGroups',
      transformCollection,
    )
  }

  /** GET /config/v2/menuGroups/{guid}: "Returns a `MenuGroup` object". */
  async getCollection(credentials: Credentials, id: string): Promise<Collection> {
    const client = this.client(credentials)
    const res = await client.get<RawToastMenuGroup>(`/config/v2/menuGroups/${id}`)
    return transformCollection(res)
  }

  async createCollection(credentials: Credentials, data: Partial<Collection>): Promise<Collection> {
    const client = this.client(credentials)
    const body = untransformCollection(data)
    const res = await client.post<RawToastMenuGroup>('/menus/v2/menuGroups', body)
    return transformCollection(res)
  }

  async updateCollection(
    credentials: Credentials,
    id: string,
    data: Partial<Collection>,
  ): Promise<Collection> {
    const client = this.client(credentials)
    const body = untransformCollection(data)
    const res = await client.patch<RawToastMenuGroup>(`/menus/v2/menuGroups/${id}`, body)
    return transformCollection(res)
  }

  async deleteCollection(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`/menus/v2/menuGroups/${id}`)
  }

  // ── Locations (Restaurants) ───────────────────────────────────────────────

  /**
   * The connection's one restaurant. The Restaurants API documents only
   * GET /restaurants/{restaurantGUID} ("Returns a `RestaurantInfo` object
   * that contains detailed information about the configuration of a
   * restaurant.") and GET /groups/{managementGroupGUID}/restaurants; there is
   * no bare /restaurants list, and the adapter holds no management group.
   * https://doc.toasttab.com/openapi/restaurants/operation/restaurantsRestaurantGuidGet/
   */
  async listLocations(credentials: Credentials, params: QueryParams): Promise<Location[]> {
    const client = this.client(credentials)
    const res = await this.restaurant(client)
    return pageLocally([transformLocation(res, client.restaurantId)], params)
  }

  async getLocation(credentials: Credentials, id: string): Promise<Location> {
    const client = this.client(credentials)
    const res = await this.restaurantInfo(client, id)
    return transformLocation(res, id)
  }

  // ── Inventory (Stock levels) ──────────────────────────────────────────────

  async listInventoryLevels(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<InventoryLevel[]> {
    const client = this.client(credentials)
    // /stock/v1/inventory returns items with OUT_OF_STOCK or QUANTITY status by
    // default (IN_STOCK items are omitted). Its only parameter is `status`; the
    // response is a plain array of the whole set (no paging), so the caller's
    // page is sliced locally.
    // https://doc.toasttab.com/openapi/stock/operation/getInventory/
    const items = await client.get<RawToastInventoryItem[]>('/stock/v1/inventory')
    const restaurantId = client.restaurantId
    const all = (Array.isArray(items) ? items : []).map((item) =>
      transformInventoryLevel(item, restaurantId),
    )
    return pageLocally(all, params)
  }

  async getInventoryLevel(credentials: Credentials, id: string): Promise<InventoryLevel> {
    // id is synthesised as `${menuItemGuid}:${restaurantId}` — extract the guid
    const menuItemGuid = id.split(':')[0]
    const client = this.client(credentials)
    const items = await client.post<RawToastInventoryItem[]>('/stock/v1/inventory/search', {
      menuItemGuids: [menuItemGuid],
    })
    const item = Array.isArray(items) ? items[0] : undefined
    if (!item) throw new Error(`Inventory level not found: ${id}`)
    return transformInventoryLevel(item, client.restaurantId)
  }

  // ── Customers ─────────────────────────────────────────────────────────────

  /**
   * No Toast API lists or reads guests: the API reference
   * (https://doc.toasttab.com/openapi/) has no customers operation, and guest
   * details exist only on order checks (`Check.customer`: "The email address
   * is the key that identifies a unique restaurant guest.").
   */
  async listCustomers(_credentials: Credentials, _params: QueryParams): Promise<Customer[]> {
    throw notSupported(
      'Toast cannot list customers: its API reference documents no customers or guests ' +
        'endpoint; guest details appear only on order checks (Check.customer).',
    )
  }

  async getCustomer(_credentials: Credentials, _id: string): Promise<Customer> {
    throw notSupported(
      'Toast cannot read customers: its API reference documents no customers or guests ' +
        'endpoint; guest details appear only on order checks (Check.customer).',
    )
  }

  async createCustomer(credentials: Credentials, data: Partial<Customer>): Promise<Customer> {
    const client = this.client(credentials)
    const body = untransformCustomer(data)
    const res = await client.post<RawToastCustomer>('/customers/v1/customers', body)
    return transformCustomer(res)
  }

  async updateCustomer(
    credentials: Credentials,
    id: string,
    data: Partial<Customer>,
  ): Promise<Customer> {
    const client = this.client(credentials)
    const body = untransformCustomer(data)
    const res = await client.patch<RawToastCustomer>(`/customers/v1/customers/${id}`, body)
    return transformCustomer(res)
  }

  async deleteCustomer(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`/customers/v1/customers/${id}`)
  }

  // ── Orders ────────────────────────────────────────────────────────────────

  /**
   * GET /orders/v2/ordersBulk "Returns an array of `Order` objects". (GET
   * /orders/v2/orders returns only "A JSON array of the GUID identifiers for
   * orders" for a window of "up to one hour or ... one business day".)
   * https://doc.toasttab.com/openapi/orders/operation/ordersBulkGet/
   *
   * Window: `startDate` ("The results include orders with a modified date
   * and time that occur at or after the `startDate`") is `updatedAfter`, or
   * the documented floor ("The date must be after
   * 2015-12-01T00:00:00.000+0000."); `endDate` (exclusive) is the next UTC
   * midnight, so page N is the same request all day.
   *
   * Paging: "if you set the `pageSize` parameter to `10`, and you set
   * `page` to `2`, the API returns a set of objects that starts with the
   * eleventh object", and "The maximum `pageSize` is `100`." A clamped size
   * is reported. The end signal is the Link header: "The response header
   * fields for the /ordersBulk endpoint include a set of response pagination
   * links", with `rel="next"` for "the first set of objects immediately after
   * the current set" (https://doc.toasttab.com/doc/devguide/apiOrdersGetDetailedInfoAboutMultipleOrders.html).
   */
  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const client = this.client(credentials)
    const limit = params.limit ?? DEFAULT_PAGE_LIMIT
    const pageSize = Math.min(limit, ORDERS_BULK_MAX_PAGE_SIZE)
    if (pageSize < limit) reportUpstreamPage(params, { pageSize })
    const page = pageOffset(params, pageSize) / pageSize + 1

    const floor = new Date(ORDERS_BULK_START_FLOOR)
    const start =
      params.updatedAfter && params.updatedAfter.getTime() > floor.getTime()
        ? params.updatedAfter
        : floor
    const end = nextUtcMidnight(new Date())
    if (start.getTime() >= end.getTime()) {
      // "The `endDate` date and time must be later than the `startDate`".
      reportUpstreamPage(params, { hasMore: false })
      return []
    }

    const { data, headers } = await client.getWithHeaders<RawToastOrder[]>(
      '/orders/v2/ordersBulk',
      {
        startDate: start.toISOString(),
        endDate: end.toISOString(),
        pageSize,
        page,
      },
    )
    const link = headers['link']
    const linkText = Array.isArray(link) ? link.join(', ') : link
    if (typeof linkText === 'string') {
      reportUpstreamPage(params, { hasMore: /rel="?next"?/.test(linkText) })
    }
    const orders = Array.isArray(data) ? data : []
    if (orders.length === 0) return []
    const currency = await this.currency(client)
    return orders.map((o) => transformOrder(o, currency))
  }

  /** GET /orders/v2/orders/{guid}: "Retrieves detailed information about a single order". */
  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const client = this.client(credentials)
    const res = await client.get<RawToastOrder>(`/orders/v2/orders/${id}`)
    return transformOrder(res, await this.currency(client))
  }

  async createOrder(credentials: Credentials, data: Partial<Order>): Promise<Order> {
    const client = this.client(credentials)
    const body = untransformOrder(data)
    const res = await client.post<RawToastOrder>('/orders/v2/orders', body)
    return transformOrder(res, await this.currency(client))
  }

  async updateOrder(credentials: Credentials, id: string, data: Partial<Order>): Promise<Order> {
    const client = this.client(credentials)
    const body = untransformOrder(data)
    const res = await client.patch<RawToastOrder>(`/orders/v2/orders/${id}`, body)
    return transformOrder(res, await this.currency(client))
  }

  async cancelOrder(
    credentials: Credentials,
    id: string,
    _data?: { reason?: string },
  ): Promise<Order> {
    const client = this.client(credentials)
    const res = await client.post<RawToastOrder>(`/orders/v2/orders/${id}/void`, {})
    return transformOrder(res, await this.currency(client))
  }

  // ── Refunds ───────────────────────────────────────────────────────────────

  /**
   * Refunded payments: GET /orders/v2/payments?refundBusinessDate "Returns a
   * list of the payments that were refunded during one business day." There
   * is no /payments/v1 API. Each refund is the `refund` of one payment, so
   * its id is the payment GUID.
   * https://doc.toasttab.com/openapi/orders/operation/paymentsGet/
   */
  async listRefunds(credentials: Credentials, params: QueryParams): Promise<Refund[]> {
    const { client, payments } = await this.paymentsByBusinessDay(
      credentials,
      params,
      'refundBusinessDate',
      'refunds',
    )
    if (payments.length === 0) return []
    const currency = await this.currency(client)
    return payments.map((p) => transformRefund(p, currency))
  }

  /** The refund on payment `id`: GET /orders/v2/payments/{guid}. */
  async getRefund(credentials: Credentials, id: string): Promise<Refund> {
    const client = this.client(credentials)
    const res = await client.get<RawToastPayment>(`/orders/v2/payments/${id}`)
    return transformRefund(res, await this.currency(client))
  }

  async createRefund(credentials: Credentials, data: Partial<Refund>): Promise<Refund> {
    const client = this.client(credentials)
    const body = untransformRefund(data)
    const res = await client.post<RawToastPayment>('/payments/v1/refunds', body)
    return transformRefund(res, await this.currency(client))
  }

  // ── Transactions (Payments) ───────────────────────────────────────────────

  /**
   * Payments: GET /orders/v2/payments?paidBusinessDate "Returns a list of the
   * payments that were made during one business day." There is no
   * /payments/v1 API.
   * https://doc.toasttab.com/openapi/orders/operation/paymentsGet/
   */
  async listTransactions(credentials: Credentials, params: QueryParams): Promise<Transaction[]> {
    const { client, payments } = await this.paymentsByBusinessDay(
      credentials,
      params,
      'paidBusinessDate',
      'transactions',
    )
    if (payments.length === 0) return []
    const currency = await this.currency(client)
    return payments.map((p) => transformTransaction(p, currency))
  }

  /** GET /orders/v2/payments/{guid}: "Returns a JSON `Payment` object". */
  async getTransaction(credentials: Credentials, id: string): Promise<Transaction> {
    const client = this.client(credentials)
    const res = await client.get<RawToastPayment>(`/orders/v2/payments/${id}`)
    return transformTransaction(res, await this.currency(client))
  }

  // ── Discounts ─────────────────────────────────────────────────────────────

  /**
   * GET /config/v2/discounts pages by `pageToken` only, with pages sized by
   * data volume rather than a count, so one upstream page is not one caller
   * page: pageByRows cuts the caller's rows out of the token chain. No size
   * parameter exists, so the caller's limit stays out of the key. A 409 means
   * the restaurant republished its configuration mid-walk; the docs say to
   * "re-submit the request ... without the pageToken query parameter, so that
   * the response restarts from the first page", which `restartOn` does.
   * https://doc.toasttab.com/doc/devguide/apiResponseDataPagination.html
   */
  async listDiscounts(credentials: Credentials, params: QueryParams): Promise<Discount[]> {
    const client = this.client(credentials)
    const key = cursorPagerKey(
      connectionScope(`toast:${client.restaurantId}`, credentials),
      'discounts',
      {},
    )
    const { items } = await pageByRows<Discount>(
      key,
      params,
      async (cursor) => {
        const page = await client.tokenPage<RawToastDiscount>('/config/v2/discounts', cursor)
        return { items: page.items.map(transformDiscount), next: page.next }
      },
      { restartOn: (err) => (err as AxiosError).response?.status === 409 },
    )
    return items
  }

  async getDiscount(credentials: Credentials, id: string): Promise<Discount> {
    const client = this.client(credentials)
    const res = await client.get<RawToastDiscount>(`/config/v2/discounts/${id}`)
    return transformDiscount(res)
  }

  async createDiscount(credentials: Credentials, data: Partial<Discount>): Promise<Discount> {
    const client = this.client(credentials)
    const body = untransformDiscount(data)
    const res = await client.post<RawToastDiscount>('/config/v2/discounts', body)
    return transformDiscount(res)
  }

  async updateDiscount(
    credentials: Credentials,
    id: string,
    data: Partial<Discount>,
  ): Promise<Discount> {
    const client = this.client(credentials)
    const body = untransformDiscount(data)
    const res = await client.patch<RawToastDiscount>(`/config/v2/discounts/${id}`, body)
    return transformDiscount(res)
  }

  async deleteDiscount(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`/config/v2/discounts/${id}`)
  }
}
