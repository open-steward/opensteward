/**
 * Shopify adapter for the ecommerce vertical.
 *
 * Maps the Shopify Admin REST API to the canonical ecommerce resources.
 * Tokens issued by Shopify's OAuth install flow are long-lived offline
 * tokens — `refreshCredentials` is a no-op.
 */

import type { CredentialField, Credentials, PagedResult, QueryParams } from '@opensteward/shared'
import {
  connectionScope,
  cursorPagerKey,
  pageByCursor,
  pageByRows,
  pageLocally,
  reportUpstreamPage,
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

import { buildAuthUrl, exchangeCode as shopifyExchangeCode, normaliseShop } from './auth'
import { ShopifyClient } from './client'
import {
  DEFAULT_PAGE_SIZE,
  DEFAULT_SCOPES,
  INVENTORY_LOCATION_BATCH,
  MAX_PAGE_SIZE,
} from './constants'
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
import { transformLocation, type RawShopifyLocation } from './transform/location'
import {
  transformInventoryLevel,
  type RawShopifyInventoryLevel,
} from './transform/inventory'
import {
  transformCustomer,
  untransformCustomer,
  type RawShopifyCustomer,
} from './transform/customer'
import {
  transformOrder,
  untransformOrder,
  type RawShopifyOrder,
} from './transform/order'
import {
  transformFulfillment,
  untransformFulfillment,
  type RawShopifyFulfillment,
} from './transform/fulfillment'
import {
  transformRefund,
  untransformRefund,
  type RawShopifyRefund,
} from './transform/refund'
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

/**
 * How many pages of orders one caller page of fulfillments or refunds may walk.
 *
 * Both are rows flattened out of pages of 250 orders, and they can be rare: a
 * store selling digital goods has no fulfillments at all, so page 1 walks
 * every order it has. A budget below that fails the list outright on such a
 * store, where serving one page of orders at a time used to walk the same
 * orders across many caller pages. Shopify's `page_info` chain never repeats,
 * so the budget only has to stop a loop; this is the sync worker's own page
 * ceiling, 2.5 million orders.
 */
const SPARSE_MAX_UPSTREAM_PAGES = 10_000

/**
 * Where the custom-then-smart stream of `listCollections` continues: which
 * endpoint, and its `page_info` (absent: that endpoint's first page).
 */
type CollectionCursor = { src: 'custom' | 'smart'; pageInfo?: string }

function fulfillmentsOf(orders: readonly RawShopifyOrder[]): Fulfillment[] {
  return orders.flatMap((o) =>
    (o.fulfillments ?? []).map((f) => transformFulfillment({ ...f, order_id: f.order_id ?? o.id })),
  )
}

/** The order's currency is the refund's; the per-order path has only the refund to go on. */
function refundsOf(orders: readonly RawShopifyOrder[]): Refund[] {
  return orders.flatMap((o) =>
    (o.refunds ?? []).map((r) =>
      transformRefund({ ...r, order_id: r.order_id ?? o.id }, o.currency ?? r.currency ?? 'USD'),
    ),
  )
}

function variantsOf(products: readonly RawShopifyProduct[]): ProductVariant[] {
  return products.flatMap((p) =>
    (p.variants ?? []).map((v) => transformVariant(v, 'USD', p.options)),
  )
}

export interface ShopifyAdapterConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
  /**
   * Deployment-wide store subdomain, e.g. `mystore`. Optional: Shopify OAuth is
   * per-store, so the store normally comes from the customer at connect time
   * (`oauthFields`) and is then read back from `credentials.extra.shop`. Set
   * this only when every connection on this deployment is the same store.
   */
  shop?: string
  scopes?: string[]
}

export class ShopifyAdapter implements EcommerceAdapter {
  readonly platform = 'shopify'
  readonly version = '0.1.0'

  /**
   * Shopify caps every list at 250. Declared, not just clamped: the sync
   * worker uses this for the request AND for its short-page test, and a
   * request clamped 500 → 250 without the declaration makes a full first page
   * look like the last — the collection is marked complete at 250 rows.
   */
  readonly capabilities = { maxPageSize: MAX_PAGE_SIZE }

  private clientId: string
  private clientSecret: string
  private redirectUri: string
  private shop: string | undefined
  private scopes: string[]

  constructor(config: ShopifyAdapterConfig) {
    this.clientId = config.clientId
    this.clientSecret = config.clientSecret
    this.redirectUri = config.redirectUri
    this.shop = config.shop
    this.scopes = config.scopes ?? DEFAULT_SCOPES
  }

  // ── Auth ──────────────────────────────────────────────────────────────────

  /**
   * The store is the one thing Shopify OAuth cannot do without and the one
   * thing deployment config cannot know: authorize and token endpoints live on
   * `{shop}.myshopify.com`, and the shop is the customer's. Asked for on the
   * Connect page before the redirect.
   */
  oauthFields(): CredentialField[] {
    return [
      {
        name: 'shop',
        label: 'Shopify store',
        type: 'text',
        required: true,
        placeholder: 'my-store',
        helpText: 'The store\u2019s myshopify.com subdomain \u2014 my-store for my-store.myshopify.com.',
      },
    ]
  }

  getAuthUrl(
    state: string,
    overrideScopes?: string[],
    _codeChallenge?: string,
    inputs?: Record<string, string>,
  ): string {
    return buildAuthUrl(
      this.resolveShop(inputs?.shop),
      this.clientId,
      this.redirectUri,
      overrideScopes ?? this.scopes,
      state,
    )
  }

  async exchangeCode(code: string, _redirectUri: string): Promise<Credentials> {
    return shopifyExchangeCode(this.resolveShop(), code, this.clientId, this.clientSecret)
  }

  /** Exchange on the customer's store and remember it with the credentials. */
  async exchangeCodeWithInputs(
    code: string,
    _redirectUri: string,
    inputs: Record<string, string>,
  ): Promise<Credentials> {
    const shop = this.resolveShop(inputs.shop)
    const creds = await shopifyExchangeCode(shop, code, this.clientId, this.clientSecret)
    return { ...creds, extra: { ...(creds.extra ?? {}), shop } }
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
      (payload['__topic'] as string | undefined) ??
      (payload['topic'] as string | undefined)
    return parseShopifyWebhookEvents(payload, topic)
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private client(credentials: Credentials): ShopifyClient {
    const fromExtra = credentials.extra?.['shop']
    return new ShopifyClient(
      credentials,
      this.resolveShop(typeof fromExtra === 'string' ? fromExtra : undefined),
    )
  }

  /**
   * The customer's store when one was supplied, else the deployment-wide
   * default. Throws a readable error rather than letting `undefined` reach
   * `.endsWith` further down.
   */
  private resolveShop(candidate?: string): string {
    return normaliseShop(candidate ?? this.shop)
  }

  /**
   * Stable per-connection scope for pager keys: the shop, and a fingerprint of
   * this connection's token (`connectionScope`), never the token itself. The
   * shop alone is not a connection. Two installs on one shop can hold
   * different scopes (without `read_all_orders` only 60 days of orders are
   * visible), and the row pager holds the rows it fetched, so a key per shop
   * would serve one install's orders to another.
   */
  private pagerScope(credentials: Credentials): string {
    const fromExtra = credentials.extra?.['shop']
    return connectionScope(
      `shopify:${this.resolveShop(typeof fromExtra === 'string' ? fromExtra : undefined)}`,
      credentials,
    )
  }

  /**
   * One page of a `page_info`-paginated list, honouring EITHER an explicit
   * cursor or the worker's numeric `page`.
   *
   * Shopify pages only by cursor, and this adapter used to drop `page`: page 2
   * of every list was page 1 again, so a collection over 250 rows re-fetched
   * its first page until the sync worker's page ceiling. `page` now resolves
   * through the shared cursor pager. An explicit cursor wins — a caller paging
   * by cursor already holds a position.
   */
  private async cursorPage<T>(
    credentials: Credentials,
    path: string,
    resourceKey: string,
    params: QueryParams,
    extra: Record<string, unknown> = {},
  ): Promise<PagedResult<T>> {
    const client = this.client(credentials)
    const query = { ...this.listParams(params), ...extra }
    if (query.page_info != null) {
      const res = await client.listWithCursor<T>(path, resourceKey, query)
      return { items: res.items, hasMore: res.nextCursor != null }
    }
    return pageByCursor<T, string>(
      cursorPagerKey(this.pagerScope(credentials), path, query),
      params.page,
      async (pageInfo) => {
        const res = await client.listWithCursor<T>(
          path,
          resourceKey,
          pageInfo != null ? { ...query, page_info: pageInfo } : query,
        )
        return { items: res.items, next: res.nextCursor }
      },
    )
  }

  /** {@link cursorPage} for a list that is exactly one endpoint's rows: reports hasMore, returns the rows. */
  private async cursorList<T>(
    credentials: Credentials,
    path: string,
    resourceKey: string,
    params: QueryParams,
    extra: Record<string, unknown> = {},
  ): Promise<T[]> {
    const page = await this.cursorPage<T>(credentials, path, resourceKey, params, extra)
    reportUpstreamPage(params, { hasMore: page.hasMore })
    return page.items
  }

  /**
   * The caller named a `page_info` (as `cursor` or `page_info`): a position
   * in one endpoint's chain, not a row offset, so a flattened list serves the
   * one upstream page at that position rather than re-cutting rows.
   */
  private hasExplicitCursor(params: QueryParams): boolean {
    return this.listParams(params).page_info != null
  }

  /**
   * The caller's page of rows flattened out of pages of a parent list.
   *
   * Fulfillments, refunds and transactions live under orders, and variants
   * under products, so one page of parents holds however many rows its
   * parents carry: 0 fulfillments or 40 from 250 orders. Served as they came,
   * a page was not `limit` rows. The router truncated the surplus, the next
   * page started after it, and a sync counted pages of parents. `pageByRows`
   * walks the parent pages and serves exactly rows
   * [(page-1)×limit, page×limit) of the flattened stream, with `hasMore`
   * exact. The next caller page continues from the parent page it already
   * holds.
   *
   * `parent.query` is the parent list's first-page query and keys the walk,
   * so it carries every filter and the parent page size, and never the
   * caller's limit unless the parent page is sized by it.
   */
  private async flattenedRows<P, R>(
    credentials: Credentials,
    params: QueryParams,
    parent: { path: string; resourceKey: string; query: Record<string, unknown> },
    rows: string,
    flatten: (parents: P[]) => R[] | Promise<R[]>,
    maxUpstreamPages?: number,
  ): Promise<R[]> {
    const client = this.client(credentials)
    const { items } = await pageByRows<R, string>(
      cursorPagerKey(this.pagerScope(credentials), `${parent.path}#${rows}`, parent.query),
      params,
      async (pageInfo) => {
        const res = await client.listWithCursor<P>(
          parent.path,
          parent.resourceKey,
          pageInfo != null ? { ...parent.query, page_info: pageInfo } : parent.query,
        )
        return { items: await flatten(res.items), next: res.nextCursor }
      },
      { defaultLimit: DEFAULT_PAGE_SIZE, maxUpstreamPages },
    )
    return items
  }

  /**
   * Orders, every status, 250 to a page: the parent of fulfillments and
   * refunds. Both are embedded in the Order payload and can be sparse, so the
   * largest page costs the fewest requests to fill a caller page, under a
   * bucket that leaks two requests a second.
   *
   * The price is paid by a small page read on its own: page 1 of
   * fulfillments at `limit=10` downloads up to 250 full orders where one
   * sized by the caller would download 10, and page 1 is always read afresh.
   * A walk amortises it, since the next caller pages come from the orders
   * already held. Sizing by the caller instead would cost a request per ten
   * orders on a store where refunds are one order in fifty.
   */
  private ordersByMax(params: QueryParams): {
    path: string
    resourceKey: string
    query: Record<string, unknown>
  } {
    return {
      path: 'orders.json',
      resourceKey: 'orders',
      query: { ...this.listParams(params), limit: MAX_PAGE_SIZE, status: 'any' },
    }
  }

  private listParams(params: QueryParams): Record<string, unknown> {
    const out: Record<string, unknown> = {
      // Every list path clamps here — product-scoped variants and inventory
      // levels go through `get`, not `listWithCursor`, and would otherwise
      // carry the worker's 500 to a 250-capped endpoint.
      limit: Math.min(Number(params.limit ?? DEFAULT_PAGE_SIZE), MAX_PAGE_SIZE),
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

  async listProducts(credentials: Credentials, params: QueryParams): Promise<Product[]> {
    const rows = await this.cursorList<RawShopifyProduct>(credentials, 'products.json', 'products', params)
    return rows.map((p) => transformProduct(p))
  }

  async getProduct(credentials: Credentials, id: string): Promise<Product> {
    const res = await this.client(credentials).get<{ product: RawShopifyProduct }>(
      `products/${id}.json`,
    )
    return transformProduct(res.product)
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

  async listVariants(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<ProductVariant[]> {
    // If a product id is supplied, scope the list to that product (Shopify
    // does not expose an unscoped `/variants.json` list endpoint).
    const productId = params['productId'] ?? params['product_id']
    const client = this.client(credentials)
    if (productId) {
      const res = await client.get<{ variants: RawShopifyVariant[] }>(
        `products/${String(productId)}/variants.json`,
        this.listParams(params),
      )
      return (res.variants ?? []).map((v) => transformVariant(v))
    }
    // Fallback: every product's variants, flattened. An explicit cursor is one
    // page of products at that position, its end the products' end.
    if (this.hasExplicitCursor(params)) {
      const products = await this.cursorList<RawShopifyProduct>(credentials, 'products.json', 'products', params)
      return variantsOf(products)
    }
    // Every product has at least one variant, so products are read at the
    // caller's page size: one page of them usually fills a page of variants.
    // Dense rows, so the default upstream-page budget is only a loop guard.
    return this.flattenedRows<RawShopifyProduct, ProductVariant>(
      credentials,
      params,
      { path: 'products.json', resourceKey: 'products', query: this.listParams(params) },
      'variants',
      variantsOf,
    )
  }

  async getVariant(credentials: Credentials, id: string): Promise<ProductVariant> {
    const res = await this.client(credentials).get<{ variant: RawShopifyVariant }>(
      `variants/${id}.json`,
    )
    return transformVariant(res.variant)
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
   * Custom and smart collections are two endpoints. The list streams every
   * custom collection, then every smart one, and `pageByRows` cuts the
   * caller's pages out of the stream; the cursor names the endpoint and its
   * `page_info`. Each endpoint is read at the caller's page size (collections
   * are one row each), with the default upstream-page budget as a loop guard.
   *
   * It used to be custom page N beside smart page N: up to twice the limit on
   * one page, so the router dropped the smart collections a full custom page
   * carried.
   */
  async listCollections(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<Collection[]> {
    const query = this.listParams(params)
    if (query.page_info != null) {
      // An explicit cursor: one page of each endpoint at it, as before.
      const [custom, smart] = await Promise.all([
        this.cursorPage<RawShopifyCollection>(credentials, 'custom_collections.json', 'custom_collections', params),
        this.cursorPage<RawShopifyCollection>(credentials, 'smart_collections.json', 'smart_collections', params),
      ])
      reportUpstreamPage(params, { hasMore: custom.hasMore || smart.hasMore })
      return [
        ...custom.items.map((c) => transformCollection(c, 'MANUAL')),
        ...smart.items.map((c) => transformCollection(c, 'SMART')),
      ]
    }
    const client = this.client(credentials)
    const { items } = await pageByRows<Collection, CollectionCursor>(
      cursorPagerKey(this.pagerScope(credentials), 'custom_collections.json+smart_collections.json', query),
      params,
      async (at) => {
        const src = at?.src ?? 'custom'
        const res = await client.listWithCursor<RawShopifyCollection>(
          `${src}_collections.json`,
          `${src}_collections`,
          at?.pageInfo != null ? { ...query, page_info: at.pageInfo } : query,
        )
        const next: CollectionCursor | undefined =
          res.nextCursor != null
            ? { src, pageInfo: res.nextCursor }
            : src === 'custom'
              ? { src: 'smart' }
              : undefined
        const kind = src === 'custom' ? 'MANUAL' : 'SMART'
        return { items: res.items.map((c) => transformCollection(c, kind)), next }
      },
      { defaultLimit: DEFAULT_PAGE_SIZE },
    )
    return items
  }

  async getCollection(credentials: Credentials, id: string): Promise<Collection> {
    // Try custom first; fall back to smart.
    const client = this.client(credentials)
    try {
      const res = await client.get<{ custom_collection: RawShopifyCollection }>(
        `custom_collections/${id}.json`,
      )
      return transformCollection(res.custom_collection, 'MANUAL')
    } catch {
      const res = await client.get<{ smart_collection: RawShopifyCollection }>(
        `smart_collections/${id}.json`,
      )
      return transformCollection(res.smart_collection, 'SMART')
    }
  }

  async createCollection(
    credentials: Credentials,
    data: Partial<Collection>,
  ): Promise<Collection> {
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
    // Shopify's locations list is not paginated: one response is every
    // location. Paged locally, so page 2 is the next slice — never page 1
    // again, the loop the worker's repeated-page check exists for — and a
    // caller limit below the location count (maxPageSize 250) reaches each one.
    const res = await this.client(credentials).get<{ locations: RawShopifyLocation[] }>(
      'locations.json',
    )
    return pageLocally((res.locations ?? []).map(transformLocation), params)
  }

  async getLocation(credentials: Credentials, id: string): Promise<Location> {
    const res = await this.client(credentials).get<{ location: RawShopifyLocation }>(
      `locations/${id}.json`,
    )
    return transformLocation(res.location)
  }

  // ── Inventory ─────────────────────────────────────────────────────────────

  async listInventoryLevels(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<InventoryLevel[]> {
    const locationIds = params['location_ids'] ?? params['locationIds']
    const inventoryItemIds = params['inventory_item_ids'] ?? params['inventoryItemIds']
    const base = this.listParams(params)
    if (locationIds || inventoryItemIds || base.page_info != null) {
      const extra: Record<string, unknown> = {}
      if (locationIds) extra.location_ids = locationIds
      if (inventoryItemIds) extra.inventory_item_ids = inventoryItemIds
      const rows = await this.cursorList<RawShopifyInventoryLevel>(
        credentials,
        'inventory_levels.json',
        'inventory_levels',
        params,
        extra,
      )
      return rows.map(transformInventoryLevel)
    }
    // Shopify refuses an unfiltered list, and the sync worker never filters.
    // Enumerate the shop's locations and ask per batch of fifty ids — the
    // most `location_ids` accepts. Needs `read_locations`, which is why that
    // scope is recommended for Shopify.
    //
    // The levels of every batch, one after another, cut into the caller's
    // pages by the row pager: the cursor is (batch, page_info within it), and
    // a batch holding 300 levels and one holding 2 no longer make pages of
    // 250, 50 and 2 at a limit of 250. Locations are re-read for each upstream
    // page rather than carried in the cursor; it is one cheap request, and a
    // cursor that embedded fifty-plus ids would be the wrong thing to memoise.
    const client = this.client(credentials)
    type BatchCursor = { batch: number; pageInfo?: string }
    const { items } = await pageByRows<RawShopifyInventoryLevel, BatchCursor>(
      cursorPagerKey(this.pagerScope(credentials), 'inventory_levels.json#location-batches', base),
      params,
      async (at) => {
        const { locations } = await client.get<{ locations: Array<{ id: number | string }> }>(
          'locations.json',
        )
        const ids = (locations ?? []).map((l) => String(l.id))
        const batch = at?.batch ?? 0
        const batchIds = ids.slice(batch * INVENTORY_LOCATION_BATCH, (batch + 1) * INVENTORY_LOCATION_BATCH)
        if (batchIds.length === 0) return { items: [] }
        const res = await client.listWithCursor<RawShopifyInventoryLevel>(
          'inventory_levels.json',
          'inventory_levels',
          at?.pageInfo != null
            ? { ...base, page_info: at.pageInfo }
            : { ...base, location_ids: batchIds.join(',') },
        )
        const next: BatchCursor | undefined =
          res.nextCursor != null
            ? { batch, pageInfo: res.nextCursor }
            : (batch + 1) * INVENTORY_LOCATION_BATCH < ids.length
              ? { batch: batch + 1 }
              : undefined
        return { items: res.items, next }
      },
      { defaultLimit: DEFAULT_PAGE_SIZE },
    )
    return items.map(transformInventoryLevel)
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

  async listCustomers(credentials: Credentials, params: QueryParams): Promise<Customer[]> {
    const rows = await this.cursorList<RawShopifyCustomer>(credentials, 'customers.json', 'customers', params)
    return rows.map(transformCustomer)
  }

  async getCustomer(credentials: Credentials, id: string): Promise<Customer> {
    const res = await this.client(credentials).get<{ customer: RawShopifyCustomer }>(
      `customers/${id}.json`,
    )
    return transformCustomer(res.customer)
  }

  async createCustomer(
    credentials: Credentials,
    data: Partial<Customer>,
  ): Promise<Customer> {
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

  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const orders = await this.ordersPage(credentials, params)
    reportUpstreamPage(params, { hasMore: orders.hasMore })
    return orders.items.map(transformOrder)
  }

  /**
   * One page of orders, every status, sized by `limit`. Shared by `listOrders`
   * and by the three collections Shopify only addresses under an order —
   * fulfillments, refunds, transactions — which have no store-wide list of
   * their own (see `listFulfillments`).
   */
  private async ordersPage(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<PagedResult<RawShopifyOrder>> {
    return this.cursorPage<RawShopifyOrder>(credentials, 'orders.json', 'orders', params, {
      status: 'any',
    })
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const res = await this.client(credentials).get<{ order: RawShopifyOrder }>(
      `orders/${id}.json`,
    )
    return transformOrder(res.order)
  }

  async createOrder(credentials: Credentials, data: Partial<Order>): Promise<Order> {
    const res = await this.client(credentials).post<{ order: RawShopifyOrder }>(
      'orders.json',
      { order: untransformOrder(data) },
    )
    return transformOrder(res.order)
  }

  async updateOrder(
    credentials: Credentials,
    id: string,
    data: Partial<Order>,
  ): Promise<Order> {
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

  async listFulfillments(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<Fulfillment[]> {
    const orderId = params['order_id'] ?? params['orderId']
    if (!orderId) {
      // Shopify has no store-wide fulfillments list — they live under an order —
      // and the sync worker lists every collection unfiltered. This used to
      // throw, failing three collections a run and tripping the circuit breaker
      // for the rest. The Order payload embeds each order's fulfillments in
      // full, so pages of orders answer this with no further requests.
      //
      // Cut into the caller's pages from 250-order pages (see flattenedRows),
      // and allowed to walk far: fulfillments can be rare.
      if (this.hasExplicitCursor(params)) {
        const orders = await this.ordersPage(credentials, params)
        reportUpstreamPage(params, { hasMore: orders.hasMore })
        return fulfillmentsOf(orders.items)
      }
      return this.flattenedRows<RawShopifyOrder, Fulfillment>(
        credentials,
        params,
        this.ordersByMax(params),
        'fulfillments',
        fulfillmentsOf,
        SPARSE_MAX_UPSTREAM_PAGES,
      )
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
      // Embedded in full on the Order payload, and rare, like fulfillments —
      // see there.
      if (this.hasExplicitCursor(params)) {
        const orders = await this.ordersPage(credentials, params)
        reportUpstreamPage(params, { hasMore: orders.hasMore })
        return refundsOf(orders.items)
      }
      return this.flattenedRows<RawShopifyOrder, Refund>(
        credentials,
        params,
        this.ordersByMax(params),
        'refunds',
        refundsOf,
        SPARSE_MAX_UPSTREAM_PAGES,
      )
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

  async listTransactions(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<Transaction[]> {
    const orderId = params['order_id'] ?? params['orderId']
    if (!orderId) {
      // Not embedded on the Order payload, unlike fulfillments and refunds, so
      // this is one request per order. Sequential on purpose: Shopify's REST
      // bucket is 40 requests with a 2/s leak, and a burst of 250 parallel
      // calls would spend the rest of the sync in 429s.
      const client = this.client(credentials)
      const transactionsOf = async (orders: RawShopifyOrder[]): Promise<Transaction[]> => {
        const out: Transaction[] = []
        for (const o of orders) {
          const res = await client.get<{ transactions: RawShopifyTransaction[] }>(
            `orders/${String(o.id)}/transactions.json`,
          )
          out.push(...(res.transactions ?? []).map(transformTransaction))
        }
        return out
      }
      if (this.hasExplicitCursor(params)) {
        const orders = await this.ordersPage(credentials, params)
        reportUpstreamPage(params, { hasMore: orders.hasMore })
        return transactionsOf(orders.items)
      }
      // Orders are read at the caller's page size, not 250: every order costs
      // a request here, so a page of 10 transactions should not ask 250
      // orders. Nearly every order has a transaction, so one page of orders
      // usually fills a page, and the default budget is only a loop guard.
      //
      // With exactly one transaction per order, a caller page ends exactly
      // on a page of orders, and the row pager peeks at the next page of
      // orders, with a request per order, so that `hasMore` is exact: about
      // 2 × limit + 2 requests for a page read on its own, against limit + 1
      // before. A walk pays it once, as the peeked page is the next caller
      // page.
      return this.flattenedRows<RawShopifyOrder, Transaction>(
        credentials,
        params,
        {
          path: 'orders.json',
          resourceKey: 'orders',
          query: { ...this.listParams(params), status: 'any' },
        },
        'transactions',
        transactionsOf,
      )
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

  async listDiscounts(credentials: Credentials, params: QueryParams): Promise<Discount[]> {
    const client = this.client(credentials)
    const rules = await this.cursorList<RawShopifyPriceRule>(credentials, 'price_rules.json', 'price_rules', params)
    // Fetch the first discount code for each rule in parallel — each
    // price_rule can have multiple codes but we surface the first one.
    const withCodes = await Promise.all(
      rules.map(async (rule) => {
        try {
          const cr = await client.get<{ discount_codes: RawShopifyDiscountCode[] }>(
            `price_rules/${rule.id}/discount_codes.json`,
          )
          return transformDiscount(rule, cr.discount_codes?.[0])
        } catch {
          return transformDiscount(rule)
        }
      }),
    )
    return withCodes
  }

  async getDiscount(credentials: Credentials, id: string): Promise<Discount> {
    const client = this.client(credentials)
    const rule = await client.get<{ price_rule: RawShopifyPriceRule }>(
      `price_rules/${id}.json`,
    )
    let code: RawShopifyDiscountCode | undefined
    try {
      const cr = await client.get<{ discount_codes: RawShopifyDiscountCode[] }>(
        `price_rules/${id}/discount_codes.json`,
      )
      code = cr.discount_codes?.[0]
    } catch {
      /* no code */
    }
    return transformDiscount(rule.price_rule, code)
  }

  async createDiscount(
    credentials: Credentials,
    data: Partial<Discount>,
  ): Promise<Discount> {
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
