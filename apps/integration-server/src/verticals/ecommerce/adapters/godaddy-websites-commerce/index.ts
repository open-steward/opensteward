/**
 * GoDaddy Websites + Commerce adapter for the ecommerce vertical.
 *
 * The read methods for products (SKU groups), variants (SKUs), collections
 * (catalog lists), locations, customers and orders call GoDaddy's documented
 * Commerce API on https://api.godaddy.com with a Personal Access Token
 * (`Authorization: Bearer <PAT>`) and the connection's `storeId`
 * (`credentials.extra.storeId`, else `config.storeId`). See
 * `commerce-client.ts` for the endpoints and their doc quotes. Discounts are
 * refused: the Commerce API documents no discount query.
 *
 * Every other method is still an unverified copy of the Shopify adapter
 * (`ShopifyClient`, `{shop}.myshopify.com`) and is out of this rebuild's
 * scope; see the rebuild record for the list.
 */

import {
  connectionScope,
  cursorPagerKey,
  pageByCursor,
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
import type { Transaction } from '../../schema/transaction'
import type { Discount } from '../../schema/discount'
import type { WebhookEvent } from '../../schema/webhook'

import { buildAuthUrl, exchangeCode as shopifyExchangeCode } from './auth'
import { ShopifyClient } from './client'
import { GoDaddyCommerceClient, type GraphqlConnection } from './commerce-client'
import { DEFAULT_PAGE_SIZE, DEFAULT_SCOPES } from './constants'
import { verifyShopifyWebhook, parseShopifyWebhookEvents } from './webhook'

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
import { transformLocation, LOCATION_FIELDS, type RawGoDaddyLocation } from './transform/location'
import { transformSkuGroup, SKU_GROUP_FIELDS, type RawGoDaddySkuGroup } from './transform/sku-group'
import { transformSku, SKU_FIELDS, type RawGoDaddySku } from './transform/sku'
import { transformList, LIST_FIELDS, type RawGoDaddyList } from './transform/list'
import { transformCommerceCustomer, type RawGoDaddyCustomer } from './transform/commerce-customer'
import {
  transformCommerceOrder,
  ORDER_FIELDS,
  type RawGoDaddyOrder,
} from './transform/commerce-order'
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

export interface GodaddyWebsitesCommerceAdapterConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
  /** Store subdomain, e.g. `mystore` (not `mystore.myshopify.com`). */
  shop: string
  scopes?: string[]
  /**
   * GoDaddy Commerce store ID, used when a connection's credentials carry no
   * `extra.storeId`. "your `storeId`" is a prerequisite of every Commerce
   * call (https://developer.godaddy.com/docs/api-users/commerce/manage-catalog).
   */
  storeId?: string
}

/** Page size when the caller names none; GoDaddy documents no GraphQL maximum. */
const COMMERCE_DEFAULT_PAGE_SIZE = 50

/**
 * Customers `pageSize`: "Maximum number of items to return" with
 * `"default": 25, "maximum": 500` (https://developer.godaddy.com/openapi/customers.json).
 */
const CUSTOMERS_MAX_PAGE_SIZE = 500

/**
 * Customers `page`: "Only supported up to the first 10 000 records of a result
 * set." (https://developer.godaddy.com/openapi/customers.json)
 */
const CUSTOMERS_PAGE_RECORD_CEILING = 10_000

function notSupported(message: string): Error {
  return Object.assign(new Error(message), { statusCode: 501, code: 'NOT_SUPPORTED' })
}

function notFound(message: string): Error {
  return Object.assign(new Error(message), { statusCode: 404, code: 'NOT_FOUND' })
}

/** The catalog query a canonical collection is listed through. */
interface CatalogListSpec {
  /** Pager namespace (canonical resource name). */
  collection: string
  /** Top-level query field, e.g. `skuGroups`. */
  field: string
  /** Selection set for one node. */
  fields: string
}

function nodesOf<N>(conn: GraphqlConnection<N>): N[] {
  return (conn.edges ?? []).flatMap((e) => (e?.node ? [e.node] : []))
}

/**
 * The cursor that starts the next page, from the connection's own end signal.
 * `hasNextPage` without an `endCursor` would leave the rest unreachable, so it
 * throws rather than end the collection early.
 */
function nextCursor<N>(conn: GraphqlConnection<N>, field: string): string | undefined {
  if (!conn.pageInfo.hasNextPage) return undefined
  if (!conn.pageInfo.endCursor) {
    throw new Error(`GoDaddy ${field}: hasNextPage is true but endCursor is empty`)
  }
  return conn.pageInfo.endCursor
}

const DISCOUNTS_REFUSAL =
  'GoDaddy cannot list discounts: the Commerce API documents no discount query — the order ' +
  "subgraph's discount group has only the mutations applyDiscount and applyDiscountCodes, and " +
  'the catalog subgraph has no discount query ' +
  '(https://developer.godaddy.com/docs/references/rest/orders)'

export class GodaddyWebsitesCommerceAdapter implements EcommerceAdapter {
  readonly platform = 'godaddy-websites-commerce'
  readonly version = '0.1.0'

  private clientId: string
  private clientSecret: string
  private redirectUri: string
  private shop: string
  private scopes: string[]
  private configStoreId: string | undefined

  constructor(config: GodaddyWebsitesCommerceAdapterConfig) {
    this.clientId = config.clientId
    this.clientSecret = config.clientSecret
    this.redirectUri = config.redirectUri
    this.shop = config.shop
    this.scopes = config.scopes ?? DEFAULT_SCOPES
    this.configStoreId = config.storeId
  }

  // ── Auth ──────────────────────────────────────────────────────────────────

  getAuthUrl(state: string, overrideScopes?: string[]): string {
    return buildAuthUrl(
      this.shop,
      this.clientId,
      this.redirectUri,
      overrideScopes ?? this.scopes,
      state,
    )
  }

  async exchangeCode(code: string, _redirectUri: string): Promise<Credentials> {
    return shopifyExchangeCode(this.shop, code, this.clientId, this.clientSecret)
  }

  /**
   * Shopify offline access tokens are long-lived and do not rotate. The
   * shared `isTokenExpired` helper treats credentials without `expiresAt`
   * as non-expiring, so returning them unchanged here is correct.
   */
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

  private client(credentials: Credentials): ShopifyClient {
    return new ShopifyClient(credentials, this.shop)
  }

  /**
   * The documented Commerce client for this connection, and the pager scope
   * (store + token fingerprint) its cursors are remembered under.
   */
  private commerce(credentials: Credentials): {
    client: GoDaddyCommerceClient
    storeId: string
    scope: string
  } {
    const fromCredentials = credentials.extra?.['storeId']
    const storeId =
      typeof fromCredentials === 'string' && fromCredentials ? fromCredentials : this.configStoreId
    if (!storeId) {
      throw notSupported(
        'GoDaddy Commerce calls need the connection storeId (credentials.extra.storeId or ' +
          'config.storeId): "your `storeId`" is a prerequisite of every Commerce call',
      )
    }
    return {
      client: new GoDaddyCommerceClient(credentials.accessToken, storeId),
      storeId,
      scope: connectionScope(storeId, credentials),
    }
  }

  /**
   * One caller page of a catalog-subgraph connection. The catalog documents
   * `first`/`after` paging with `pageInfo { hasNextPage endCursor }` and a
   * non-null `totalCount`, and an `updatedAt: { gt }` filter on each of these
   * queries (https://developer.godaddy.com/docs/api-users/commerce/manage-catalog:
   * "To fetch the next page, pass the `endCursor` value as the `after`
   * argument").
   */
  private async catalogPage<N>(
    credentials: Credentials,
    params: QueryParams,
    spec: CatalogListSpec,
  ): Promise<N[]> {
    const { client, scope } = this.commerce(credentials)
    const first = params.limit ?? COMMERCE_DEFAULT_PAGE_SIZE
    const updatedAt = params.updatedAfter ? { gt: params.updatedAfter.toISOString() } : undefined
    const query =
      `query List($first: Int, $after: String, $updatedAt: UpdatedAtFilter) { ` +
      `${spec.field}(first: $first, after: $after, updatedAt: $updatedAt) { ` +
      `edges { node { ${spec.fields} } } pageInfo { hasNextPage endCursor } totalCount } }`
    let totalCount: number | undefined
    const page = await pageByCursor<N, string>(
      cursorPagerKey(scope, spec.collection, { first, updatedAfter: params.updatedAfter }),
      params.page,
      async (after) => {
        const data = await client.catalog<Record<string, GraphqlConnection<N> | null>>(query, {
          first,
          after,
          updatedAt,
        })
        const conn = data[spec.field]
        if (!conn) throw new Error(`GoDaddy catalog response has no ${spec.field} connection`)
        totalCount = conn.totalCount
        return { items: nodesOf(conn), next: nextCursor(conn, spec.field) }
      },
    )
    reportUpstreamPage(params, {
      hasMore: page.hasMore,
      ...(typeof totalCount === 'number' ? { totalCount } : {}),
    })
    return page.items
  }

  /** One node by id from the catalog subgraph (`skuGroup(id: String!)` etc.). */
  private async catalogNode<N>(
    credentials: Credentials,
    field: string,
    fields: string,
    id: string,
  ): Promise<N> {
    const { client } = this.commerce(credentials)
    const data = await client.catalog<Record<string, N | null>>(
      `query Get($id: String!) { ${field}(id: $id) { ${fields} } }`,
      { id },
    )
    const node = data[field]
    if (!node) throw notFound(`GoDaddy ${field} ${id} not found`)
    return node
  }

  private listParams(params: QueryParams): Record<string, unknown> {
    const out: Record<string, unknown> = {
      limit: params.limit ?? DEFAULT_PAGE_SIZE,
    }
    const cursor = params['cursor'] ?? params['page_info']
    if (cursor) {
      out.page_info = cursor
    } else {
      if (params.updatedAfter) {
        out.updated_at_min = params.updatedAfter.toISOString()
      }
    }
    return out
  }

  // ── Products ──────────────────────────────────────────────────────────────

  /**
   * `skuGroups` on the catalog subgraph: "`skuGroups` returns a paginated list
   * of SKU groups for your store. Use `first` and `after` to page through
   * results." (https://developer.godaddy.com/docs/api-users/commerce/manage-catalog)
   */
  async listProducts(credentials: Credentials, params: QueryParams): Promise<Product[]> {
    const nodes = await this.catalogPage<RawGoDaddySkuGroup>(credentials, params, {
      collection: 'products',
      field: 'skuGroups',
      fields: SKU_GROUP_FIELDS,
    })
    return nodes.map(transformSkuGroup)
  }

  /** `skuGroup(id: String!)` on the catalog subgraph. */
  async getProduct(credentials: Credentials, id: string): Promise<Product> {
    return transformSkuGroup(
      await this.catalogNode<RawGoDaddySkuGroup>(credentials, 'skuGroup', SKU_GROUP_FIELDS, id),
    )
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

  /**
   * The top-level `skus` query on the catalog subgraph ("A SKU is a single
   * purchasable variant."): arguments `first`, `after`, `updatedAt`, returning
   * `QuerySkusConnection` with `pageInfo` and `totalCount`
   * (https://developer.godaddy.com/docs/references/rest/catalog/sku/queries/skus).
   */
  async listVariants(credentials: Credentials, params: QueryParams): Promise<ProductVariant[]> {
    const nodes = await this.catalogPage<RawGoDaddySku>(credentials, params, {
      collection: 'variants',
      field: 'skus',
      fields: SKU_FIELDS,
    })
    return nodes.map(transformSku)
  }

  /** `sku(id: String!)` on the catalog subgraph. */
  async getVariant(credentials: Credentials, id: string): Promise<ProductVariant> {
    return transformSku(await this.catalogNode<RawGoDaddySku>(credentials, 'sku', SKU_FIELDS, id))
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

  /**
   * `lists` on the catalog subgraph — "A list is a group of SKU groups that
   * are generally organized by similar characteristics." Arguments `first`,
   * `after`, `updatedAt`; returns `QueryListsConnection` with `pageInfo` and
   * `totalCount` (https://developer.godaddy.com/docs/references/rest/catalog/list/queries/lists).
   */
  async listCollections(credentials: Credentials, params: QueryParams): Promise<Collection[]> {
    const nodes = await this.catalogPage<RawGoDaddyList>(credentials, params, {
      collection: 'collections',
      field: 'lists',
      fields: LIST_FIELDS,
    })
    return nodes.map(transformList)
  }

  /** `list(id: String!)` on the catalog subgraph. */
  async getCollection(credentials: Credentials, id: string): Promise<Collection> {
    return transformList(
      await this.catalogNode<RawGoDaddyList>(credentials, 'list', LIST_FIELDS, id),
    )
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

  /**
   * `locations` on the catalog subgraph: arguments `first`, `after`,
   * `updatedAt`, `paginationType` (default `"CURSOR"`); returns `pageInfo` and
   * `totalCount` (https://developer.godaddy.com/docs/references/rest/catalog/inventory/queries/locations).
   */
  async listLocations(credentials: Credentials, params: QueryParams): Promise<Location[]> {
    const nodes = await this.catalogPage<RawGoDaddyLocation>(credentials, params, {
      collection: 'locations',
      field: 'locations',
      fields: LOCATION_FIELDS,
    })
    return nodes.map(transformLocation)
  }

  /** `location(id: String!)` on the catalog subgraph. */
  async getLocation(credentials: Credentials, id: string): Promise<Location> {
    return transformLocation(
      await this.catalogNode<RawGoDaddyLocation>(credentials, 'location', LOCATION_FIELDS, id),
    )
  }

  // ── Inventory ─────────────────────────────────────────────────────────────

  async listInventoryLevels(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<InventoryLevel[]> {
    const locationIds = params['location_ids'] ?? params['locationIds']
    const inventoryItemIds = params['inventory_item_ids'] ?? params['inventoryItemIds']
    // Shopify requires at least one of location_ids or inventory_item_ids.
    if (!locationIds && !inventoryItemIds) {
      throw new Error(
        'listInventoryLevels requires `location_ids` or `inventory_item_ids` in query params',
      )
    }
    const extra: Record<string, unknown> = this.listParams(params)
    if (locationIds) extra.location_ids = locationIds
    if (inventoryItemIds) extra.inventory_item_ids = inventoryItemIds
    const res = await this.client(credentials).get<{
      inventory_levels: RawShopifyInventoryLevel[]
    }>('inventory_levels.json', extra)
    return (res.inventory_levels ?? []).map(transformInventoryLevel)
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
   * `GET /v1/commerce/stores/{storeId}/customers` — "retrieves all customers
   * for a store" (https://developer.godaddy.com/docs/api-users/commerce/manage-orders-and-customers/customer).
   *
   * Paged by the documented `page` / `pageSize` (maximum 500) with
   * `totalRequired=true`, which adds "totalItems and totalPages" to the
   * response; `totalPages` is the end signal. `pageToken` would reach past
   * the first 10,000 records, but the contract's response schema has no field
   * that carries it (only `links`, `totalItems`, `totalPages`), so it is not
   * used, and a page past that ceiling is refused rather than sent.
   *
   * `excludeGuestCustomers` is sent as false: "Whether to exclude guest
   * customers (those without an associated user record). Defaults to true."
   * Orders can name guest customers, so the list includes them.
   */
  async listCustomers(credentials: Credentials, params: QueryParams): Promise<Customer[]> {
    const { client } = this.commerce(credentials)
    const limit = params.limit ?? COMMERCE_DEFAULT_PAGE_SIZE
    const pageSize = Math.min(limit, CUSTOMERS_MAX_PAGE_SIZE)
    const page = typeof params.page === 'number' && params.page > 1 ? Math.floor(params.page) : 1
    if (page * pageSize > CUSTOMERS_PAGE_RECORD_CEILING) {
      throw notSupported(
        `GoDaddy cannot list customers past record ${CUSTOMERS_PAGE_RECORD_CEILING} by page: ` +
          '"Only supported up to the first 10 000 records of a result set."',
      )
    }
    const res = await client.get<{
      customers: RawGoDaddyCustomer[]
      totalItems?: number
      totalPages?: number
    }>('customers', {
      page,
      pageSize,
      totalRequired: true,
      excludeGuestCustomers: false,
      ...(params.updatedAfter ? { updatedAtStart: params.updatedAfter.toISOString() } : {}),
    })
    reportUpstreamPage(params, {
      ...(typeof res.totalPages === 'number'
        ? { hasMore: page < res.totalPages, totalPages: res.totalPages }
        : {}),
      ...(typeof res.totalItems === 'number' ? { totalCount: res.totalItems } : {}),
      ...(pageSize < limit ? { pageSize } : {}),
    })
    return (res.customers ?? []).map(transformCommerceCustomer)
  }

  /**
   * `GET /v1/commerce/stores/{storeId}/customers/{customerId}`; the contract's
   * 200 body is `{ customer, links }`.
   */
  async getCustomer(credentials: Credentials, id: string): Promise<Customer> {
    const { client } = this.commerce(credentials)
    const res = await client.get<{ customer: RawGoDaddyCustomer }>(
      `customers/${encodeURIComponent(id)}`,
    )
    return transformCommerceCustomer(res.customer)
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
   * `orders(first, after)` on the order subgraph — "returns a paginated list
   * of orders" (https://developer.godaddy.com/docs/api-users/commerce/manage-orders-and-customers).
   * With `updatedAfter`, `filterOrders` instead, whose documented arguments
   * include `updatedAtStart` beside the same `first` / `after`
   * (https://developer.godaddy.com/docs/references/rest/orders/order/queries/filterOrders).
   */
  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const { client, scope } = this.commerce(credentials)
    const first = params.limit ?? COMMERCE_DEFAULT_PAGE_SIZE
    const updatedAtStart = params.updatedAfter?.toISOString()
    const field = updatedAtStart ? 'filterOrders' : 'orders'
    const query = updatedAtStart
      ? `query List($first: Int, $after: ID, $updatedAtStart: DateTime) { ` +
        `filterOrders(first: $first, after: $after, updatedAtStart: $updatedAtStart) { ` +
        `edges { node { ${ORDER_FIELDS} } } pageInfo { hasNextPage endCursor } } }`
      : `query List($first: Int, $after: ID) { orders(first: $first, after: $after) { ` +
        `edges { node { ${ORDER_FIELDS} } } pageInfo { hasNextPage endCursor } } }`
    const page = await pageByCursor<RawGoDaddyOrder, string>(
      cursorPagerKey(scope, 'orders', { first, updatedAfter: params.updatedAfter }),
      params.page,
      async (after) => {
        const data = await client.orders<Record<string, GraphqlConnection<RawGoDaddyOrder> | null>>(
          query,
          { first, after, ...(updatedAtStart ? { updatedAtStart } : {}) },
        )
        const conn = data[field]
        if (!conn) throw new Error(`GoDaddy order response has no ${field} connection`)
        return { items: nodesOf(conn), next: nextCursor(conn, field) }
      },
    )
    reportUpstreamPage(params, { hasMore: page.hasMore })
    return page.items.map(transformCommerceOrder)
  }

  /** `orderById(id: ID!)` on the order subgraph. */
  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const { client } = this.commerce(credentials)
    const data = await client.orders<{ orderById: RawGoDaddyOrder | null }>(
      `query Get($id: ID!) { orderById(id: $id) { ${ORDER_FIELDS} } }`,
      { id },
    )
    if (!data.orderById) throw notFound(`GoDaddy order ${id} not found`)
    return transformCommerceOrder(data.orderById)
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

  async listFulfillments(credentials: Credentials, params: QueryParams): Promise<Fulfillment[]> {
    const orderId = params['order_id'] ?? params['orderId']
    if (!orderId) {
      throw new Error('listFulfillments requires `order_id` in query params')
    }
    const res = await this.client(credentials).get<{
      fulfillments: RawShopifyFulfillment[]
    }>(`orders/${String(orderId)}/fulfillments.json`, this.listParams(params))
    return (res.fulfillments ?? []).map(transformFulfillment)
  }

  async getFulfillment(credentials: Credentials, id: string): Promise<Fulfillment> {
    const res = await this.client(credentials).get<{ fulfillment: RawShopifyFulfillment }>(
      `fulfillments/${id}.json`,
    )
    return transformFulfillment(res.fulfillment)
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

  async listRefunds(credentials: Credentials, params: QueryParams): Promise<Refund[]> {
    const orderId = params['order_id'] ?? params['orderId']
    if (!orderId) {
      throw new Error('listRefunds requires `order_id` in query params')
    }
    const res = await this.client(credentials).get<{ refunds: RawShopifyRefund[] }>(
      `orders/${String(orderId)}/refunds.json`,
      this.listParams(params),
    )
    return (res.refunds ?? []).map((r) => transformRefund(r))
  }

  async getRefund(credentials: Credentials, id: string): Promise<Refund> {
    // Composite id format: `orderId:refundId`
    const [orderId, refundId] = id.split(':')
    if (!orderId || !refundId) {
      throw new Error('Invalid refund id format: expected `orderId:refundId`')
    }
    const res = await this.client(credentials).get<{ refund: RawShopifyRefund }>(
      `orders/${orderId}/refunds/${refundId}.json`,
    )
    return transformRefund(res.refund)
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

  async listTransactions(credentials: Credentials, params: QueryParams): Promise<Transaction[]> {
    const orderId = params['order_id'] ?? params['orderId']
    if (!orderId) {
      throw new Error('listTransactions requires `order_id` in query params')
    }
    const res = await this.client(credentials).get<{
      transactions: RawShopifyTransaction[]
    }>(`orders/${String(orderId)}/transactions.json`, this.listParams(params))
    return (res.transactions ?? []).map(transformTransaction)
  }

  async getTransaction(credentials: Credentials, id: string): Promise<Transaction> {
    const [orderId, txId] = id.split(':')
    if (!orderId || !txId) {
      throw new Error('Invalid transaction id format: expected `orderId:transactionId`')
    }
    const res = await this.client(credentials).get<{
      transaction: RawShopifyTransaction
    }>(`orders/${orderId}/transactions/${txId}.json`)
    return transformTransaction(res.transaction)
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
    throw notSupported(DISCOUNTS_REFUSAL)
  }

  async getDiscount(_credentials: Credentials, _id: string): Promise<Discount> {
    throw notSupported(DISCOUNTS_REFUSAL.replace('cannot list', 'cannot read'))
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
