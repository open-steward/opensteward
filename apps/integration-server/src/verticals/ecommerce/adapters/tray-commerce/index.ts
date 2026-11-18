/**
 * Tray Commerce adapter for the ecommerce vertical.
 *
 * Tray (Tray Corp / Locaweb, Brazil) — https://developers.tray.com.br/, a
 * Portuguese Slate-generated single-page reference. One app `consumer_key`
 * / `consumer_secret` is registered centrally and reused across every
 * store that installs it; each store still has its own domain and its own
 * `access_token` (per-customer OAuth host, like Shopify/Zendesk in this
 * vertical — see `auth.ts`).
 *
 * Every endpoint path, body field and response shape below was verified by
 * fetching the docs page with curl (not the WebFetch tool, whose
 * summarizer was silently truncating this specific page well before the
 * sections this adapter needs — see `client.ts`'s file header for the
 * full explanation and the one genuine documentation contradiction it
 * resolves). Per-resource verification detail lives in each
 * `transform/*.ts` file's header; read those before changing a path here.
 *
 * NOT implemented, with reasons (see `metadata.ts` for the formal
 * declarations):
 *   - `discount` (coupons) — the docs' own table of contents confirms an
 *     extensive coupon API exists (create/list/get/update/delete plus
 *     relation endpoints), but curl-fetching those sections returned only
 *     section headings, never field-level detail — a write-capable,
 *     money-affecting resource is not worth guessing.
 *   - `transaction` (payment info) — same situation: section confirmed to
 *     exist, no field-level detail ever retrieved.
 *   - `refund` — no refund endpoint appears anywhere in the docs.
 *   - `fulfillment` — the only shipping-related endpoint is a pre-checkout
 *     freight-rate calculator, not a shipment/tracking resource.
 */

import type { Credentials, CredentialField, QueryParams } from '@opensteward/shared'
import { pageLocally, reportUpstreamPage } from '@opensteward/shared'
import type { EcommerceAdapter } from '../../adapter/interface'
import type { Product, ProductVariant } from '../../schema/product'
import type { Collection } from '../../schema/collection'
import type { Location } from '../../schema/location'
import type { InventoryLevel } from '../../schema/inventory'
import type { Customer } from '../../schema/customer'
import type { Order } from '../../schema/order'

import {
  buildAuthUrl,
  oauthFields as trayOauthFields,
  exchangeCode as trayExchangeCode,
  refreshCredentials as trayRefreshCredentials,
} from './auth'
import { TrayCommerceClient, pagingHasMore, multiCdPagingHasMore, type TrayPaging, type TrayMultiCdPaging } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

import {
  transformProduct,
  untransformProduct,
  transformVariant,
  untransformVariant,
  type RawTrayProduct,
  type RawTrayVariant,
} from './transform/product'
import {
  transformCollection,
  untransformCollection,
  flattenCategories,
  type RawTrayCategory,
} from './transform/collection'
import { transformLocation, type RawTrayCd } from './transform/location'
import { transformInventoryLevel, type RawTrayCdStock } from './transform/inventory'
import { transformCustomer, untransformCustomer, type RawTrayCustomer } from './transform/customer'
import {
  transformOrder,
  untransformOrderForCreate,
  untransformOrderForUpdate,
  type RawTrayOrder,
} from './transform/order'

export interface TrayCommerceAdapterConfig {
  /** Tray `consumer_key` — one app, shared across every store that installs it. */
  clientId: string
  /** Tray `consumer_secret`. */
  clientSecret: string
  redirectUri: string
}

/** Legacy CakePHP list envelope: `{ [Plural]: [{ [Singular]: {...} }] }` — confirmed for Products, Variants, Customers, Orders. */
function unwrapList<T>(res: unknown, pluralKey: string, singularKey: string): T[] {
  const container =
    res && typeof res === 'object' ? (res as Record<string, unknown>)[pluralKey] : undefined
  const arr = Array.isArray(container) ? container : []
  return arr.map((el) => {
    if (el && typeof el === 'object' && singularKey in (el as Record<string, unknown>)) {
      return (el as Record<string, unknown>)[singularKey] as T
    }
    return el as T
  })
}

/** Single-item counterpart of {@link unwrapList} — unwraps `{ [Singular]: {...} }` when present. */
function unwrapItem<T>(res: unknown, singularKey: string): T {
  if (res && typeof res === 'object' && singularKey in (res as Record<string, unknown>)) {
    return (res as Record<string, unknown>)[singularKey] as T
  }
  return res as T
}

export class TrayCommerceAdapter implements EcommerceAdapter {
  readonly platform = 'tray-commerce'
  readonly version = '0.1.0'

  /** Verified: every documented `paging` example shows `maxLimit: 50`. */
  readonly capabilities = { maxPageSize: MAX_PAGE_SIZE }

  private clientId: string
  private clientSecret: string
  private redirectUri: string

  constructor(config: TrayCommerceAdapterConfig) {
    this.clientId = config.clientId
    this.clientSecret = config.clientSecret
    this.redirectUri = config.redirectUri
  }

  // ── Auth ──────────────────────────────────────────────────────────────────

  oauthFields(): CredentialField[] {
    return trayOauthFields()
  }

  getAuthUrl(
    state: string,
    _overrideScopes?: string[],
    _codeChallenge?: string,
    inputs?: Record<string, string>,
  ): string {
    // Tray has no per-connection scope concept — `overrideScopes` is part
    // of the required interface shape and is intentionally unused.
    return buildAuthUrl(inputs?.['storeDomain'] ?? '', this.clientId, this.redirectUri, state)
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    throw new Error(
      'Tray Commerce requires a store domain (see oauthFields) — use exchangeCodeWithInputs.',
    )
  }

  async exchangeCodeWithInputs(
    code: string,
    _redirectUri: string,
    inputs: Record<string, string>,
  ): Promise<Credentials> {
    return trayExchangeCode(inputs['storeDomain'] ?? '', code, this.clientId, this.clientSecret)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return trayRefreshCredentials(credentials)
  }

  // Webhooks: intentionally NOT implemented — Tray registers a webhook
  // endpoint through a support ticket, not an API call, and documents no
  // delivery signature. `webhook.ts` was deleted; `../../webhooks.ts` still
  // imports it and needs a follow-up edit outside this adapter's scope.

  // ── Private helpers ───────────────────────────────────────────────────────

  private client(credentials: Credentials): TrayCommerceClient {
    return new TrayCommerceClient(credentials)
  }

  private listParams(params: QueryParams): Record<string, unknown> {
    const limit = Math.min(Number(params.limit ?? DEFAULT_PAGE_SIZE), MAX_PAGE_SIZE)
    const page =
      typeof params.page === 'number' && Number.isFinite(params.page) && params.page > 1
        ? Math.floor(params.page)
        : 1
    return { limit, page }
  }

  /** Report `hasMore` from the legacy `paging` block, honestly reporting nothing when it's absent. */
  private reportLegacyPaging(params: QueryParams, res: unknown): void {
    const paging =
      res && typeof res === 'object' ? ((res as Record<string, unknown>)['paging'] as TrayPaging | undefined) : undefined
    const hasMore = pagingHasMore(paging)
    if (hasMore !== undefined) reportUpstreamPage(params, { hasMore })
  }

  // ── Products ──────────────────────────────────────────────────────────────

  async listProducts(credentials: Credentials, params: QueryParams): Promise<Product[]> {
    const res = await this.client(credentials).get('products', this.listParams(params))
    this.reportLegacyPaging(params, res)
    return unwrapList<RawTrayProduct>(res, 'Products', 'Product').map((p) => transformProduct(p))
  }

  async getProduct(credentials: Credentials, id: string): Promise<Product> {
    const res = await this.client(credentials).get(`products/${id}`)
    return transformProduct(unwrapItem<RawTrayProduct>(res, 'Product'))
  }

  async createProduct(credentials: Credentials, data: Partial<Product>): Promise<Product> {
    const res = await this.client(credentials).postForm<{ id: string | number }>(
      'products',
      'Product',
      untransformProduct(data),
    )
    return this.getProduct(credentials, String(res.id))
  }

  async updateProduct(
    credentials: Credentials,
    id: string,
    data: Partial<Product>,
  ): Promise<Product> {
    await this.client(credentials).putForm(`products/${id}`, 'Product', untransformProduct(data))
    return this.getProduct(credentials, id)
  }

  async deleteProduct(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`products/${id}`)
  }

  // ── Variants ──────────────────────────────────────────────────────────────

  async listVariants(credentials: Credentials, params: QueryParams): Promise<ProductVariant[]> {
    const productId = params['productId'] ?? params['product_id']
    const query = this.listParams(params)
    if (productId) query.product_id = String(productId)
    const res = await this.client(credentials).get('products/variants/', query)
    this.reportLegacyPaging(params, res)
    return unwrapList<RawTrayVariant>(res, 'Variants', 'Variant').map((v) => transformVariant(v))
  }

  async getVariant(credentials: Credentials, id: string): Promise<ProductVariant> {
    const res = await this.client(credentials).get(`products/variants/${id}`)
    return transformVariant(unwrapItem<RawTrayVariant>(res, 'Variant'))
  }

  async createVariant(
    credentials: Credentials,
    data: Partial<ProductVariant>,
  ): Promise<ProductVariant> {
    const res = await this.client(credentials).postForm<{ id: string | number }>(
      'products/variants/',
      'Variant',
      untransformVariant(data),
    )
    return this.getVariant(credentials, String(res.id))
  }

  async updateVariant(
    credentials: Credentials,
    id: string,
    data: Partial<ProductVariant>,
  ): Promise<ProductVariant> {
    // The docs' own PUT curl example omits `:id` — every other verb on this
    // resource (GET/DELETE) requires it, so that omission is treated as a
    // documentation typo rather than followed literally (see transform/product.ts header).
    await this.client(credentials).putForm(`products/variants/${id}`, 'Variant', untransformVariant(data))
    return this.getVariant(credentials, id)
  }

  async deleteVariant(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`products/variants/${id}`)
  }

  // ── Collections (categories) ─────────────────────────────────────────────

  /**
   * `0` is used as the tree root id — see transform/collection.ts header
   * for why this specific value is inferred-by-convention rather than
   * demonstrated in a curl example, unlike every other path in this file.
   */
  async listCollections(credentials: Credentials, params: QueryParams): Promise<Collection[]> {
    const res = await this.client(credentials).get<{ Category?: Array<{ Category: RawTrayCategory }> }>(
      'categories/tree/0',
    )
    const roots = (res.Category ?? []).map((c) => c.Category)
    // The unpaginated tree, paged locally. Answering page 2 with nothing
    // was right only while page 1 held every category; with maxPageSize 50
    // declared, a store's 51st category was unreachable at any limit.
    return pageLocally(flattenCategories(roots).map(transformCollection), params)
  }

  async getCollection(credentials: Credentials, id: string): Promise<Collection> {
    const res = await this.client(credentials).get<{ Category?: Array<{ Category: RawTrayCategory }> }>(
      'categories/tree/0',
    )
    const roots = (res.Category ?? []).map((c) => c.Category)
    const found = flattenCategories(roots).find((c) => String(c.id) === id)
    if (!found) throw new Error(`Category ${id} not found`)
    return transformCollection(found)
  }

  async createCollection(
    credentials: Credentials,
    data: Partial<Collection>,
  ): Promise<Collection> {
    const res = await this.client(credentials).postForm<{ id: string | number }>(
      'categories/',
      'Category',
      untransformCollection(data),
    )
    return this.getCollection(credentials, String(res.id))
  }

  // ── Locations (Multi-CD) ─────────────────────────────────────────────────

  async listLocations(credentials: Credentials, params: QueryParams): Promise<Location[]> {
    const res = await this.client(credentials).get<{ paging?: TrayMultiCdPaging; data?: RawTrayCd[] }>(
      'multicd/distribution-centers',
    )
    const locations = (res.data ?? []).map(transformLocation)
    const hasMore = multiCdPagingHasMore(res.paging)
    // One response normally holds every distribution center: page it locally,
    // so a caller limit below their count (maxPageSize 50) reaches each one.
    if (hasMore !== true) return pageLocally(locations, params)
    reportUpstreamPage(params, { hasMore })
    return locations
  }

  async getLocation(credentials: Credentials, id: string): Promise<Location> {
    const res = await this.client(credentials).get<RawTrayCd>(`multicd/distribution-centers/${id}`)
    return transformLocation(res)
  }

  // ── Inventory (Multi-CD stock) ────────────────────────────────────────────

  /** `id` is `${productId}:${dcId}` — Tray's stock read is scoped by product, not a single (product, dc) pair. */
  async getInventoryLevel(credentials: Credentials, id: string): Promise<InventoryLevel> {
    const [productId, dcId] = id.split(':')
    if (!productId || !dcId) {
      throw new Error('Invalid inventory level id format: expected `productId:dcId`')
    }
    const res = await this.client(credentials).get<{ data?: RawTrayCdStock[] }>(
      `multicd/stock/detailed/product/${productId}`,
    )
    const row = (res.data ?? []).find((r) => String(r.dc_id) === dcId)
    if (!row) throw new Error(`No stock row for product ${productId} at distribution center ${dcId}`)
    return transformInventoryLevel(productId, row)
  }

  async setInventoryLevel(
    credentials: Credentials,
    data: { variantId: string; locationId: string; available: number },
  ): Promise<InventoryLevel> {
    await this.client(credentials).putJson(`multicd/distribution-centers/${data.locationId}/stock`, {
      product_id: data.variantId,
      stock: data.available,
    })
    return this.getInventoryLevel(credentials, `${data.variantId}:${data.locationId}`)
  }

  // ── Customers ─────────────────────────────────────────────────────────────

  async listCustomers(credentials: Credentials, params: QueryParams): Promise<Customer[]> {
    const res = await this.client(credentials).get('customers', this.listParams(params))
    this.reportLegacyPaging(params, res)
    return unwrapList<RawTrayCustomer>(res, 'Customers', 'Customer').map(transformCustomer)
  }

  async getCustomer(credentials: Credentials, id: string): Promise<Customer> {
    const res = await this.client(credentials).get(`customers/${id}`)
    return transformCustomer(unwrapItem<RawTrayCustomer>(res, 'Customer'))
  }

  async createCustomer(credentials: Credentials, data: Partial<Customer>): Promise<Customer> {
    const res = await this.client(credentials).postForm<{ id: string | number }>(
      'customers',
      'Customer',
      untransformCustomer(data),
    )
    return this.getCustomer(credentials, String(res.id))
  }

  async updateCustomer(
    credentials: Credentials,
    id: string,
    data: Partial<Customer>,
  ): Promise<Customer> {
    await this.client(credentials).putForm(`customers/${id}`, 'Customer', untransformCustomer(data))
    return this.getCustomer(credentials, id)
  }

  async deleteCustomer(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`customers/${id}`)
  }

  // ── Orders ────────────────────────────────────────────────────────────────

  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const res = await this.client(credentials).get('orders', this.listParams(params))
    this.reportLegacyPaging(params, res)
    return unwrapList<RawTrayOrder>(res, 'Orders', 'Order').map((o) => transformOrder(o))
  }

  /** Calls `/complete`, not the plain get — see file header: only `/complete` documents real line-item detail. */
  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const res = await this.client(credentials).get(`orders/${id}/complete`)
    return transformOrder(unwrapItem<RawTrayOrder>(res, 'Order'))
  }

  async createOrder(credentials: Credentials, data: Partial<Order>): Promise<Order> {
    const res = await this.client(credentials).postForm<{ id: string | number }>(
      'orders',
      'Order',
      untransformOrderForCreate(data),
    )
    return this.getOrder(credentials, String(res.id))
  }

  async updateOrder(credentials: Credentials, id: string, data: Partial<Order>): Promise<Order> {
    await this.client(credentials).putForm(`orders/${id}`, 'Order', untransformOrderForUpdate(data))
    return this.getOrder(credentials, id)
  }

  /** `PUT /orders/cancel/:id` — id BEFORE the verb, unlike every other order write path. See transform/order.ts header. */
  async cancelOrder(credentials: Credentials, id: string): Promise<Order> {
    await this.client(credentials).putJson(`orders/cancel/${id}`, undefined)
    return this.getOrder(credentials, id)
  }
}
