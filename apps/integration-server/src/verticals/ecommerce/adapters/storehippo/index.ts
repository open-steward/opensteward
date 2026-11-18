/**
 * StoreHippo adapter for the ecommerce vertical.
 *
 * Maps the StoreHippo entity API to the canonical ecommerce resources. The
 * API overview (https://help.storehippo.com/api) calls
 *   "https://{storename}.storehippo.com/api/1.1/entity/ms.products"
 * with the `access-key` header ("Authenticate your API requests by passing
 * your access key in the access-key header of your HTTP request."). Every
 * read below is a documented `list` or `get` command on an entity's
 * reference page (https://help.storehippo.com/api/reference/<alias>):
 *
 *   Products      ms.products        list, get
 *   Variants      ms.products        embedded `variants` array
 *   Collections   ms.categories      list, get
 *   Customers     ms.users           list, get
 *   Orders        ms.orders          list, get
 *   Discounts     ms.coupon_codes    list, get
 *   Fulfillments  ms.fulfillments    list, get
 *   Refunds       ms.refunds         list, get
 *   Locations     ms.store_locations list, get
 *
 * Paging ("Pagination": "These list API methods share a common structure for
 * pagination."): `limit` ("Default Value : 50") and `start` ("A limit on the
 * number of records to be skipped before returning."). The response's
 * `paging` object carries "start, limit, count, total etc". No end flag is
 * documented, so a page shorter than the limit sent is the end.
 *
 * Refused (501): inventory levels (a product's `inventory_quantity` is one
 * store-wide number, with no location) and transactions (the only ledger the
 * docs name, ms.store_ledger, "Lists the transactions of store": the store's
 * own platform charges, with no order).
 *
 * Write methods were not part of the list rebuild. Coupon writes still post
 * to ms.coupons, which the reference does not document (it documents
 * ms.coupon_codes); fulfillment writes post to ms.shipments, which only the
 * legacy API feed documents.
 */

import {
  connectionScope,
  customForm,
  pageByRows,
  pageLocally,
  pageOffset,
  reportUpstreamPage,
} from '@opensteward/shared'
import type { Credentials, QueryParams } from '@opensteward/shared'
import type { EcommerceAdapter } from '../../adapter/interface'
import type { Product, ProductVariant } from '../../schema/product'
import type { Collection } from '../../schema/collection'
import type { Customer } from '../../schema/customer'
import type { Order } from '../../schema/order'
import type { Discount } from '../../schema/discount'
import type { Fulfillment } from '../../schema/fulfillment'
import type { Refund } from '../../schema/refund'
import type { Transaction } from '../../schema/transaction'
import type { Location } from '../../schema/location'
import type { InventoryLevel } from '../../schema/inventory'

import { buildAuthUrl, exchangeCode as storehippoExchangeCode } from './auth'
import { StoreHippoClient } from './client'
import { DOCUMENTED_DEFAULT_LIMIT, ENTITY, UNVERIFIED_WRITE_ENTITY } from './constants'
import { currencyCode, numeric, text } from './values'

import {
  transformProduct,
  transformVariant,
  transformVariants,
  untransformProduct,
  untransformVariant,
  type RawStoreHippoProduct,
} from './transform/product'
import {
  transformCollection,
  untransformCollection,
  type RawStoreHippoCategory,
} from './transform/collection'
import {
  transformCustomer,
  untransformCustomer,
  type RawStoreHippoUser,
} from './transform/customer'
import { transformOrder, untransformOrder, type RawStoreHippoOrder } from './transform/order'
import {
  transformDiscount,
  untransformDiscount,
  type RawStoreHippoCouponCode,
} from './transform/discount'
import {
  transformFulfillment,
  untransformFulfillment,
  type RawStoreHippoFulfillment,
} from './transform/fulfillment'
import {
  refundOrderNumber,
  transformRefund,
  untransformRefund,
  type RawStoreHippoRefund,
} from './transform/refund'
import { transformLocation, type RawStoreHippoStoreLocation } from './transform/location'

// ── Credential form ───────────────────────────────────────────────────────────

const CREDENTIAL_FORM = customForm({
  fields: [
    {
      name: 'storename',
      label: 'Store name',
      type: 'text',
      placeholder: 'mystore',
      helpText: 'Your StoreHippo subdomain — e.g. "mystore" for mystore.storehippo.com.',
      required: true,
    },
    {
      name: 'accessKey',
      label: 'API access key',
      type: 'password',
      placeholder: 'sk_live_...',
      helpText: 'Generated in your StoreHippo Dashboard → Developer → API Keys.',
      required: true,
    },
  ],
  async exchange(fields) {
    const storename = (fields['storename'] ?? '').trim()
    const accessKey = (fields['accessKey'] ?? '').trim()
    if (!storename) throw new Error('Store name is required.')
    if (!accessKey) throw new Error('API access key is required.')
    return {
      accessToken: accessKey,
      extra: { storename },
    }
  },
})

function notSupported(message: string): Error {
  return Object.assign(new Error(message), { statusCode: 501, code: 'NOT_SUPPORTED' })
}

/** The documented ms.currencies record: `name` "It contains the currency code.", `default` [number] "It stores the default currency of the store." */
interface RawStoreHippoCurrency {
  _id?: string
  name?: string
  default?: number | string
  [key: string]: unknown
}

/** The documented ms.orders fields a refund's `order_id` resolves through. */
interface RawStoreHippoOrderRef {
  _id?: string
  order_id?: string
  [key: string]: unknown
}

// ── Adapter config ────────────────────────────────────────────────────────────

export interface StoreHippoAdapterConfig {
  /** Store subdomain (e.g. `mystore` for `mystore.storehippo.com`). */
  storename?: string
}

export class StorehippoAdapter implements EcommerceAdapter {
  readonly platform = 'storehippo'
  readonly version = '0.2.0'

  // Connect Link — show a two-field form (storename + access key).
  credentialFields = CREDENTIAL_FORM.credentialFields
  exchangeCredentials = CREDENTIAL_FORM.exchangeCredentials

  private configStorename: string | undefined

  constructor(config: StoreHippoAdapterConfig = {}) {
    this.configStorename = config.storename
  }

  // ── Auth ──────────────────────────────────────────────────────────────────

  getAuthUrl(_state: string): string {
    return buildAuthUrl(this.configStorename ?? '')
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    return storehippoExchangeCode()
  }

  /** StoreHippo API keys do not expire — no-op. */
  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return credentials
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private storename(credentials: Credentials): string {
    const storename =
      (credentials.extra?.['storename'] as string | undefined) ?? this.configStorename
    if (!storename) {
      throw new Error(
        'StoreHippo adapter requires a storename — pass it in credentials.extra.storename ' +
          'or configure it under adapters.storehippo.storename.',
      )
    }
    return storename
  }

  private clientFor(credentials: Credentials): StoreHippoClient {
    const storename = this.storename(credentials)
    return new StoreHippoClient({
      ...credentials,
      extra: { ...credentials.extra, storename },
    })
  }

  /**
   * The store's default currency: the one ms.currencies record whose
   * `default` [number] is set ("It stores the default currency of the
   * store."). Product prices and flat coupon amounts carry no currency of
   * their own; conversion rates are "with respect to the default currency".
   *
   * The docs never show the flag's set value, so every currency is read
   * (pages of the documented default size) and the flag is taken as set when
   * it is a non-zero number or numeric string, rather than filtering on one
   * guessed value. Anything but exactly one such record throws.
   */
  private async storeCurrency(client: StoreHippoClient): Promise<string> {
    const flagged: RawStoreHippoCurrency[] = []
    for (let start = 0; ; start += DOCUMENTED_DEFAULT_LIMIT) {
      const { rows } = await client.list<RawStoreHippoCurrency>(ENTITY.CURRENCY, {
        start,
        limit: DOCUMENTED_DEFAULT_LIMIT,
      })
      for (const r of rows) {
        const flag = numeric(r.default)
        if (flag !== undefined && flag !== 0) flagged.push(r)
      }
      if (rows.length < DOCUMENTED_DEFAULT_LIMIT) break
    }
    if (flagged.length !== 1) {
      throw new Error(
        `StoreHippo store default currency is ambiguous: ms.currencies has ${flagged.length} records with default set`,
      )
    }
    const code = currencyCode(flagged[0]!.name)
    if (!code) throw new Error('StoreHippo default currency record has no currency code name')
    return code
  }

  /**
   * A refund's `order_id` ("This field stores the id of the order.", ex
   * "OID-243") is the order's display number, the ms.orders `order_id`
   * ("The unique id of order. It is made up of two parts: Prefix ...
   * Sequence number", ex "OID100"), not the `_id` listOrders returns as
   * Order.id. Resolve each through the documented `in` filter ("If you need
   * to filter based on multiple values of the same field then use in
   * operator."), in groups of the documented default page size. A number
   * no order carries throws: there is no Order.id to report.
   */
  private async orderIdsFor(
    client: StoreHippoClient,
    displayIds: string[],
  ): Promise<Map<string, string>> {
    const wanted = [...new Set(displayIds)]
    const out = new Map<string, string>()
    for (let i = 0; i < wanted.length; i += DOCUMENTED_DEFAULT_LIMIT) {
      const group = wanted.slice(i, i + DOCUMENTED_DEFAULT_LIMIT)
      const { rows } = await client.list<RawStoreHippoOrderRef>(ENTITY.ORDER, {
        start: 0,
        limit: group.length,
        filters: [{ field: 'order_id', operator: 'in', value: group }],
      })
      for (const o of rows) {
        const display = text(o.order_id)
        const id = text(o._id)
        if (display && id) out.set(display, id)
      }
    }
    const missing = wanted.filter((d) => !out.has(d))
    if (missing.length > 0) {
      throw new Error(
        `StoreHippo refunds name orders that ms.orders does not have: ${missing.join(', ')}`,
      )
    }
    return out
  }

  private async transformRefunds(
    client: StoreHippoClient,
    rows: RawStoreHippoRefund[],
  ): Promise<Refund[]> {
    if (rows.length === 0) return []
    const ids = await this.orderIdsFor(
      client,
      rows.map((r) => refundOrderNumber(r)),
    )
    return rows.map((r) => transformRefund(r, ids.get(refundOrderNumber(r))!))
  }

  /**
   * One caller page of a documented list: `start` = the caller's offset,
   * `limit` = the caller's page size. No maximum page size is documented; if
   * the response's `paging.limit` says the server served a smaller page,
   * the page is re-cut at that size (refetched when the offset differs) and
   * the smaller size is reported, so no row is skipped.
   */
  private async offsetPage<T>(
    client: StoreHippoClient,
    entity: string,
    params: QueryParams,
  ): Promise<T[]> {
    const limit = params.limit ?? DOCUMENTED_DEFAULT_LIMIT
    let page = await client.list<T>(entity, { start: pageOffset(params, limit), limit })
    let size = limit
    const served = page.paging?.limit
    if (typeof served === 'number' && Number.isInteger(served) && served >= 1 && served < limit) {
      size = served
      if (pageOffset(params, size) !== pageOffset(params, limit)) {
        page = await client.list<T>(entity, { start: pageOffset(params, size), limit: size })
      }
    }
    reportUpstreamPage(params, {
      hasMore: page.rows.length >= size,
      ...(size < limit ? { pageSize: size } : {}),
    })
    return page.rows
  }

  // ── Products ──────────────────────────────────────────────────────────────

  /** ms-products `list`: GET /api/1.1/entity/ms.products?start=&limit= */
  async listProducts(credentials: Credentials, params: QueryParams): Promise<Product[]> {
    const client = this.clientFor(credentials)
    const rows = await this.offsetPage<RawStoreHippoProduct>(client, ENTITY.PRODUCT, params)
    if (rows.length === 0) return []
    const currency = await this.storeCurrency(client)
    return rows.map((p) => transformProduct(p, currency))
  }

  /** ms-products `get`: GET /api/1.1/entity/ms.products/{resource_id} */
  async getProduct(credentials: Credentials, id: string): Promise<Product> {
    const client = this.clientFor(credentials)
    const raw = await client.get<RawStoreHippoProduct>(ENTITY.PRODUCT, id)
    return transformProduct(raw, await this.storeCurrency(client))
  }

  async createProduct(credentials: Credentials, data: Partial<Product>): Promise<Product> {
    const client = this.clientFor(credentials)
    // Read the currency first, so a failure cannot follow a committed write.
    const currency = await this.storeCurrency(client)
    const raw = await client.post<RawStoreHippoProduct>(ENTITY.PRODUCT, untransformProduct(data))
    return transformProduct(raw, currency)
  }

  async updateProduct(
    credentials: Credentials,
    id: string,
    data: Partial<Product>,
  ): Promise<Product> {
    const client = this.clientFor(credentials)
    const currency = await this.storeCurrency(client)
    const raw = await client.put<RawStoreHippoProduct>(ENTITY.PRODUCT, id, untransformProduct(data))
    return transformProduct(raw, currency)
  }

  async deleteProduct(credentials: Credentials, id: string): Promise<void> {
    await this.clientFor(credentials).delete(ENTITY.PRODUCT, id)
  }

  // ── Variants ──────────────────────────────────────────────────────────────
  // Variants live in the product's documented `variants` array; a variant's
  // id is `{product _id}:{variant_id}`.

  /**
   * With `productId`: that product's variants (ms-products `get`), sliced
   * locally. Without: every product's variants in product order, cut into the
   * caller's pages by `pageByRows` over ms.products pages of the documented
   * default size (50), since one product page is not one variant page.
   */
  async listVariants(credentials: Credentials, params: QueryParams): Promise<ProductVariant[]> {
    const client = this.clientFor(credentials)
    const productId = (params['productId'] ?? params['product_id']) as string | undefined
    if (productId) {
      const product = await client.get<RawStoreHippoProduct>(ENTITY.PRODUCT, productId)
      const currency = await this.storeCurrency(client)
      return pageLocally(transformVariants(product, currency), params)
    }
    const upstream = DOCUMENTED_DEFAULT_LIMIT
    let currency: Promise<string> | undefined
    const key = connectionScope(
      `storehippo:${this.storename(credentials)}:variants:${upstream}`,
      credentials,
    )
    const { items } = await pageByRows<ProductVariant, number>(key, params, async (cursor) => {
      const start = cursor ?? 0
      const { rows } = await client.list<RawStoreHippoProduct>(ENTITY.PRODUCT, {
        start,
        limit: upstream,
      })
      const withVariants = rows.filter((p) => Array.isArray(p.variants) && p.variants.length > 0)
      if (withVariants.length > 0) currency ??= this.storeCurrency(client)
      const code = withVariants.length > 0 ? await currency! : undefined
      return {
        items: code ? withVariants.flatMap((p) => transformVariants(p, code)) : [],
        next: rows.length >= upstream ? start + upstream : null,
      }
    })
    return items
  }

  /** Reads the parent product (ms-products `get`) and picks the variant by `variant_id`. */
  async getVariant(credentials: Credentials, id: string): Promise<ProductVariant> {
    const { productId, variantId } = splitVariantId(id)
    const client = this.clientFor(credentials)
    const product = await client.get<RawStoreHippoProduct>(ENTITY.PRODUCT, productId)
    const variant = (product.variants ?? []).find((v) => v.variant_id === variantId)
    if (!variant) throw new Error(`Variant ${variantId} not found on product ${productId}`)
    return transformVariant(variant, productId, await this.storeCurrency(client))
  }

  async updateVariant(
    credentials: Credentials,
    id: string,
    data: Partial<ProductVariant>,
  ): Promise<ProductVariant> {
    // StoreHippo does not have a dedicated variant endpoint; update via product.
    const { productId, variantId } = splitVariantId(id)
    const client = this.clientFor(credentials)
    const product = await client.get<RawStoreHippoProduct>(ENTITY.PRODUCT, productId)
    const currency = await this.storeCurrency(client)
    const variants = (product.variants ?? []).map((v) => {
      if (v.variant_id !== variantId) return v
      return { ...v, ...untransformVariant(data) }
    })
    const updated = await client.put<RawStoreHippoProduct>(ENTITY.PRODUCT, productId, {
      variants,
    })
    const updatedVariant = (updated.variants ?? []).find((v) => v.variant_id === variantId)
    if (!updatedVariant) throw new Error(`Variant ${variantId} not found after update`)
    return transformVariant(updatedVariant, productId, currency)
  }

  // ── Collections ───────────────────────────────────────────────────────────

  /** ms-categories `list`: GET /api/1.1/entity/ms.categories?start=&limit= */
  async listCollections(credentials: Credentials, params: QueryParams): Promise<Collection[]> {
    const client = this.clientFor(credentials)
    const rows = await this.offsetPage<RawStoreHippoCategory>(client, ENTITY.CATEGORY, params)
    return rows.map(transformCollection)
  }

  /** ms-categories `get`: GET /api/1.1/entity/ms.categories/{resource_id} */
  async getCollection(credentials: Credentials, id: string): Promise<Collection> {
    const raw = await this.clientFor(credentials).get<RawStoreHippoCategory>(ENTITY.CATEGORY, id)
    return transformCollection(raw)
  }

  async createCollection(credentials: Credentials, data: Partial<Collection>): Promise<Collection> {
    const raw = await this.clientFor(credentials).post<RawStoreHippoCategory>(
      ENTITY.CATEGORY,
      untransformCollection(data),
    )
    return transformCollection(raw)
  }

  async updateCollection(
    credentials: Credentials,
    id: string,
    data: Partial<Collection>,
  ): Promise<Collection> {
    const raw = await this.clientFor(credentials).put<RawStoreHippoCategory>(
      ENTITY.CATEGORY,
      id,
      untransformCollection(data),
    )
    return transformCollection(raw)
  }

  async deleteCollection(credentials: Credentials, id: string): Promise<void> {
    await this.clientFor(credentials).delete(ENTITY.CATEGORY, id)
  }

  // ── Customers ─────────────────────────────────────────────────────────────

  /**
   * ms-users `list` ("Retrieves a list of users"): GET /api/1.1/entity/ms.users?start=&limit=
   *
   * Unfiltered, so sellers and staff come back too: `role` ("Roles are the
   * set of permissions for a specific user.") is documented only by the
   * examples "seller" and "member", not by a value set that names customers.
   */
  async listCustomers(credentials: Credentials, params: QueryParams): Promise<Customer[]> {
    const client = this.clientFor(credentials)
    const rows = await this.offsetPage<RawStoreHippoUser>(client, ENTITY.CUSTOMER, params)
    return rows.map(transformCustomer)
  }

  /** ms-users `get`: GET /api/1.1/entity/ms.users/{resource_id} */
  async getCustomer(credentials: Credentials, id: string): Promise<Customer> {
    const raw = await this.clientFor(credentials).get<RawStoreHippoUser>(ENTITY.CUSTOMER, id)
    return transformCustomer(raw)
  }

  async createCustomer(credentials: Credentials, data: Partial<Customer>): Promise<Customer> {
    const raw = await this.clientFor(credentials).post<RawStoreHippoUser>(
      ENTITY.CUSTOMER,
      untransformCustomer(data),
    )
    return transformCustomer(raw)
  }

  async updateCustomer(
    credentials: Credentials,
    id: string,
    data: Partial<Customer>,
  ): Promise<Customer> {
    const raw = await this.clientFor(credentials).put<RawStoreHippoUser>(
      ENTITY.CUSTOMER,
      id,
      untransformCustomer(data),
    )
    return transformCustomer(raw)
  }

  async deleteCustomer(credentials: Credentials, id: string): Promise<void> {
    await this.clientFor(credentials).delete(ENTITY.CUSTOMER, id)
  }

  // ── Orders ────────────────────────────────────────────────────────────────

  /** ms-orders `list` ("Retrieves a list of orders"): GET /api/1.1/entity/ms.orders?start=&limit= */
  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const client = this.clientFor(credentials)
    const rows = await this.offsetPage<RawStoreHippoOrder>(client, ENTITY.ORDER, params)
    return rows.map(transformOrder)
  }

  /** ms-orders `get` ("Fetch a single Order"): GET /api/1.1/entity/ms.orders/{resource_id} */
  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const raw = await this.clientFor(credentials).get<RawStoreHippoOrder>(ENTITY.ORDER, id)
    return transformOrder(raw)
  }

  async createOrder(credentials: Credentials, data: Partial<Order>): Promise<Order> {
    const raw = await this.clientFor(credentials).post<RawStoreHippoOrder>(
      ENTITY.ORDER,
      untransformOrder(data),
    )
    return transformOrder(raw)
  }

  async updateOrder(credentials: Credentials, id: string, data: Partial<Order>): Promise<Order> {
    const raw = await this.clientFor(credentials).put<RawStoreHippoOrder>(
      ENTITY.ORDER,
      id,
      untransformOrder(data),
    )
    return transformOrder(raw)
  }

  async cancelOrder(
    credentials: Credentials,
    id: string,
    data?: { reason?: string },
  ): Promise<Order> {
    const raw = await this.clientFor(credentials).put<RawStoreHippoOrder>(ENTITY.ORDER, id, {
      orderStatus: 'cancelled',
      cancelReason: data?.reason,
    })
    return transformOrder(raw)
  }

  // ── Discounts ─────────────────────────────────────────────────────────────

  /** ms-coupon_codes `list` ("Retrieves a list of coupon codes"): GET /api/1.1/entity/ms.coupon_codes?start=&limit= */
  async listDiscounts(credentials: Credentials, params: QueryParams): Promise<Discount[]> {
    const client = this.clientFor(credentials)
    const rows = await this.offsetPage<RawStoreHippoCouponCode>(client, ENTITY.COUPON_CODE, params)
    if (rows.length === 0) return []
    const currency = await this.storeCurrency(client)
    return rows.map((r) => transformDiscount(r, currency))
  }

  /** ms-coupon_codes `get`: GET /api/1.1/entity/ms.coupon_codes/{resource_id} */
  async getDiscount(credentials: Credentials, id: string): Promise<Discount> {
    const client = this.clientFor(credentials)
    const raw = await client.get<RawStoreHippoCouponCode>(ENTITY.COUPON_CODE, id)
    return transformDiscount(raw, await this.storeCurrency(client))
  }

  async createDiscount(credentials: Credentials, data: Partial<Discount>): Promise<Discount> {
    const client = this.clientFor(credentials)
    const currency = await this.storeCurrency(client)
    const raw = await client.post<RawStoreHippoCouponCode>(
      UNVERIFIED_WRITE_ENTITY.COUPON,
      untransformDiscount(data),
    )
    return transformDiscount(raw, currency)
  }

  async updateDiscount(
    credentials: Credentials,
    id: string,
    data: Partial<Discount>,
  ): Promise<Discount> {
    const client = this.clientFor(credentials)
    const currency = await this.storeCurrency(client)
    const raw = await client.put<RawStoreHippoCouponCode>(
      UNVERIFIED_WRITE_ENTITY.COUPON,
      id,
      untransformDiscount(data),
    )
    return transformDiscount(raw, currency)
  }

  async deleteDiscount(credentials: Credentials, id: string): Promise<void> {
    await this.clientFor(credentials).delete(UNVERIFIED_WRITE_ENTITY.COUPON, id)
  }

  // ── Fulfillments ──────────────────────────────────────────────────────────

  /** ms-fulfillments `list` ("This command is used to retrieves the list of fulfillments"): GET /api/1.1/entity/ms.fulfillments?start=&limit= */
  async listFulfillments(credentials: Credentials, params: QueryParams): Promise<Fulfillment[]> {
    const client = this.clientFor(credentials)
    const rows = await this.offsetPage<RawStoreHippoFulfillment>(client, ENTITY.FULFILLMENT, params)
    return rows.map(transformFulfillment)
  }

  /** ms-fulfillments `get`: GET /api/1.1/entity/ms.fulfillments/{resource_id} */
  async getFulfillment(credentials: Credentials, id: string): Promise<Fulfillment> {
    const raw = await this.clientFor(credentials).get<RawStoreHippoFulfillment>(
      ENTITY.FULFILLMENT,
      id,
    )
    return transformFulfillment(raw)
  }

  async createFulfillment(
    credentials: Credentials,
    data: Partial<Fulfillment>,
  ): Promise<Fulfillment> {
    const raw = await this.clientFor(credentials).post<RawStoreHippoFulfillment>(
      UNVERIFIED_WRITE_ENTITY.SHIPMENT,
      untransformFulfillment(data),
    )
    return transformFulfillment(raw)
  }

  // ── Refunds ───────────────────────────────────────────────────────────────

  /** ms-refunds `list` ("Retrieves a list of refunds"): GET /api/1.1/entity/ms.refunds?start=&limit= */
  async listRefunds(credentials: Credentials, params: QueryParams): Promise<Refund[]> {
    const client = this.clientFor(credentials)
    const rows = await this.offsetPage<RawStoreHippoRefund>(client, ENTITY.REFUND, params)
    return this.transformRefunds(client, rows)
  }

  /** ms-refunds `get`: GET /api/1.1/entity/ms.refunds/{resource_id} */
  async getRefund(credentials: Credentials, id: string): Promise<Refund> {
    const client = this.clientFor(credentials)
    const raw = await client.get<RawStoreHippoRefund>(ENTITY.REFUND, id)
    return (await this.transformRefunds(client, [raw]))[0]!
  }

  async createRefund(credentials: Credentials, data: Partial<Refund>): Promise<Refund> {
    // order_id is required on ms-refunds; checked before the write, and the
    // caller's Order.id is reported back rather than resolved after it.
    if (!data.orderId) throw new Error('StoreHippo createRefund requires orderId')
    const raw = await this.clientFor(credentials).post<RawStoreHippoRefund>(
      ENTITY.REFUND,
      untransformRefund(data),
    )
    return transformRefund(raw, data.orderId)
  }

  // ── Transactions ──────────────────────────────────────────────────────────

  /**
   * Refused: the API reference (https://help.storehippo.com/api, 43 entities
   * under "API Reference") documents no payments or transactions entity. The
   * legacy API feed's "Transactions" group is ms.store_ledger ("Lists the
   * transactions of store."), whose documented fields (date, posting_type,
   * type, description, amount, taxes) are the store's own platform charges
   * (example: "Shippo charges from 09-18-2016 to 09-21-2016") with no order.
   */
  async listTransactions(_credentials: Credentials, _params: QueryParams): Promise<Transaction[]> {
    throw notSupported(
      'StoreHippo cannot list transactions: the API reference documents no payments or transactions entity, and the legacy "Transactions" entity ms.store_ledger ("Lists the transactions of store.") holds the store\'s platform charges, with no order',
    )
  }

  async getTransaction(_credentials: Credentials, _id: string): Promise<Transaction> {
    throw notSupported(
      'StoreHippo cannot read a transaction: the API reference documents no payments or transactions entity, and the legacy "Transactions" entity ms.store_ledger holds the store\'s platform charges, with no order',
    )
  }

  // ── Locations ─────────────────────────────────────────────────────────────

  /** ms-store_locations `list` ("Retrieves a list of store locations"): GET /api/1.1/entity/ms.store_locations?start=&limit= */
  async listLocations(credentials: Credentials, params: QueryParams): Promise<Location[]> {
    const client = this.clientFor(credentials)
    const rows = await this.offsetPage<RawStoreHippoStoreLocation>(
      client,
      ENTITY.STORE_LOCATION,
      params,
    )
    return rows.map(transformLocation)
  }

  /** ms-store_locations `get` ("Retrieves a single store location"): GET /api/1.1/entity/ms.store_locations/{resource_id} */
  async getLocation(credentials: Credentials, id: string): Promise<Location> {
    const raw = await this.clientFor(credentials).get<RawStoreHippoStoreLocation>(
      ENTITY.STORE_LOCATION,
      id,
    )
    return transformLocation(raw)
  }

  // ── Inventory ─────────────────────────────────────────────────────────────

  /**
   * Refused: stock is documented only as a product's (or variant's)
   * `inventory_quantity`, "The total number of product available in the
   * stock for sale.", one store-wide number with no location, so an
   * inventory level's required locationId has no source.
   */
  async listInventoryLevels(
    _credentials: Credentials,
    _params: QueryParams,
  ): Promise<InventoryLevel[]> {
    throw notSupported(
      'StoreHippo cannot list inventory levels: stock is documented only as a product\'s "inventory_quantity" ("The total number of product available in the stock for sale."), with no location',
    )
  }

  async getInventoryLevel(_credentials: Credentials, _id: string): Promise<InventoryLevel> {
    throw notSupported(
      'StoreHippo cannot read an inventory level: stock is documented only as a product\'s "inventory_quantity", with no location',
    )
  }
}

/** A canonical variant id, `{product _id}:{variant_id}`, split at the first colon. */
function splitVariantId(id: string): { productId: string; variantId: string } {
  const at = id.indexOf(':')
  const productId = at > 0 ? id.slice(0, at) : ''
  const variantId = at > 0 ? id.slice(at + 1) : ''
  if (!productId || !variantId) {
    throw new Error('Invalid variant id: expected `productId:variantId`')
  }
  return { productId, variantId }
}
