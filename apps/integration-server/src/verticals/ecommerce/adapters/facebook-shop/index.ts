/**
 * Facebook Shop adapter for the ecommerce vertical.
 *
 * Maps Meta's Commerce Platform / Graph API to the canonical ecommerce
 * resources. Facebook Shop is social commerce (seller-scoped, OAuth2
 * via Facebook Login, REST via Graph API).
 *
 * Slug: `facebook-shop`
 * Platform identifier: `facebook-shop`
 *
 * ── Coverage ─────────────────────────────────────────────────────────────
 *
 * Implemented (22):
 *
 *   Products:     list, get, create, update, delete   (Catalog API)
 *   Inventory:    list, get, set                      (Catalog API inventory field)
 *   Orders:       list, get                           (Commerce API)
 *   Fulfillments: list, get, create                   (Commerce API shipments)
 *   Refunds:      list, get, create                   (Commerce API refunds)
 *   Collections:  list, get                           (Catalog API — product_sets edge)
 *
 * Omitted (20) — the registry will return HTTP 501 automatically:
 *
 *   Variants (5)    — Facebook has no variant sub-resource.
 *   Locations (2)   — Facebook does not expose location resources.
 *   Customers (5)   — Facebook does not expose a customer/buyer resource.
 *   Discounts (5)   — Facebook has no public discount/coupon REST API.
 *   adjustInventoryLevel — Facebook only supports setting absolute quantity.
 *   createOrder, updateOrder, cancelOrder — buyers create orders on Facebook.
 *   updateFulfillment, cancelFulfillment — Facebook doesn't support these.
 *   Transactions (3) — Facebook does not expose order-level transaction data;
 *                      payment details are embedded in the order object only.
 *
 * ── Resource coverage ──────────────────────────────────────────────────
 * Unavailable: customer — Facebook does not expose a buyer/customer resource; buyer info is embedded in orders only.
 * Unavailable: discount — Facebook Commerce Platform has no public discount/coupon REST API.
 * Unavailable: location — Facebook Commerce Platform does not expose inventory locations.
 * Unavailable: transaction — Facebook does not expose order-level transaction data; payment info is embedded in the order's estimated_payment_details field only.
 *
 * Webhooks: Facebook Webhooks via HTTPS POST — HMAC-SHA256 verification
 * + parser implemented.
 */

import crypto from 'crypto'
import {
  connectionScope,
  cursorPagerKey,
  pageByCursor,
  reportUpstreamPage,
} from '@opensteward/shared'
import type { Credentials, QueryParams } from '@opensteward/shared'
import type { EcommerceAdapter } from '../../adapter/interface'
import type { Product } from '../../schema/product'
import type { Collection } from '../../schema/collection'
import type { InventoryLevel } from '../../schema/inventory'
import type { Order } from '../../schema/order'
import type { Fulfillment } from '../../schema/fulfillment'
import type { Refund } from '../../schema/refund'
import type { WebhookEvent } from '../../schema/webhook'

import {
  buildAuthUrl,
  exchangeCode as fbExchangeCode,
  refreshCredentials as fbRefreshCredentials,
} from './auth'
import { FacebookClient } from './client'
import {
  DEFAULT_PAGE_SIZE,
  PRODUCT_FIELDS,
  PRODUCT_SET_FIELDS,
  ORDER_FIELDS,
  ORDER_ITEM_FIELDS,
  ORDER_STATES,
} from './constants'
import { transformProduct, untransformProduct, type RawFacebookProduct } from './transform/product'
import { transformCollection, type RawFacebookProductSet } from './transform/collection'
import { transformInventoryLevel } from './transform/inventory'
import { transformOrder, type RawFacebookOrder, type RawFacebookOrderItem } from './transform/order'
import {
  transformFulfillment,
  transformFulfillments,
  untransformFulfillment,
  type RawFacebookShipment,
} from './transform/fulfillment'
import { transformRefund, untransformRefund, type RawFacebookRefund } from './transform/refund'

// ── Response envelopes ────────────────────────────────────────────────────────

interface GraphListEnvelope<T> {
  data?: T[]
  paging?: {
    cursors?: { before?: string; after?: string }
    next?: string
  }
}

export interface FacebookShopAdapterConfig {
  /** Facebook App ID. Optional — may come from credentials. */
  appId?: string
  /** Facebook App Secret. Optional — may come from credentials. */
  appSecret?: string
  /** Default OAuth2 redirect URI. */
  redirectUri?: string
}

export class FacebookShopAdapter implements EcommerceAdapter {
  readonly platform = 'facebook-shop'
  readonly version = '0.1.0'

  private configAppId: string | undefined
  private configAppSecret: string | undefined
  private configRedirectUri: string | undefined

  constructor(config: FacebookShopAdapterConfig = {}) {
    this.configAppId = config.appId
    this.configAppSecret = config.appSecret
    this.configRedirectUri = config.redirectUri
  }

  // ── Auth ──────────────────────────────────────────────────────────────────

  getAuthUrl(state: string): string {
    const appId = this.configAppId
    if (!appId) {
      throw new Error(
        'Facebook Shop adapter getAuthUrl requires appId — configure it in ' +
          'apps/integration-server/config/config.yml under adapters.facebook-shop.',
      )
    }
    const redirectUri = this.configRedirectUri ?? ''
    return buildAuthUrl(appId, redirectUri, state)
  }

  async exchangeCode(code: string, redirectUri: string): Promise<Credentials> {
    const appId = this.configAppId
    const appSecret = this.configAppSecret
    if (!appId || !appSecret) {
      throw new Error(
        'Facebook Shop adapter exchangeCode requires appId and appSecret — configure them in ' +
          'apps/integration-server/config/config.yml under adapters.facebook-shop.',
      )
    }
    return fbExchangeCode(code, redirectUri, appId, appSecret)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return fbRefreshCredentials(credentials)
  }

  // ── Webhooks ──────────────────────────────────────────────────────────────

  verifyWebhookSignature(
    payload: Record<string, unknown>,
    headers: Record<string, string>,
  ): boolean {
    const signature = headers['x-hub-signature-256']
    if (!signature) return false
    const appSecret = this.configAppSecret
    if (!appSecret) return false

    const expectedSig =
      'sha256=' +
      crypto.createHmac('sha256', appSecret).update(JSON.stringify(payload)).digest('hex')

    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSig))
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    const object = payload['object'] as string | undefined
    const entry = payload['entry'] as Array<Record<string, unknown>> | undefined
    if (!entry || !Array.isArray(entry)) return []

    const events: WebhookEvent[] = []

    for (const e of entry) {
      const changes = e['changes'] as Array<Record<string, unknown>> | undefined
      if (!changes) continue

      for (const change of changes) {
        const field = change['field'] as string | undefined
        let resourceType: WebhookEvent['resourceType'] = 'unknown'
        let action: WebhookEvent['action'] = 'unknown'

        if (field === 'product' || field === 'product_item') {
          resourceType = 'products'
        } else if (field === 'orders') {
          resourceType = 'orders'
        } else if (field === 'shipments') {
          resourceType = 'fulfillments'
        }

        const value = change['value'] as Record<string, unknown> | undefined
        const verb = value?.['verb'] as string | undefined
        if (verb === 'add' || verb === 'create') action = 'created'
        else if (verb === 'update' || verb === 'edit') action = 'updated'
        else if (verb === 'delete' || verb === 'remove') action = 'deleted'

        events.push({
          id: (e['id'] as string | undefined) ?? undefined,
          platform: 'facebook-shop',
          type: `${object ?? 'unknown'}.${field ?? 'unknown'}`,
          resourceType,
          action,
          resourceId: (value?.['id'] as string | undefined) ?? 'unknown',
          payload: change,
        })
      }
    }

    return events
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private clientFor(credentials: Credentials): FacebookClient {
    return new FacebookClient(credentials)
  }

  private catalogId(credentials: Credentials): string {
    const id = credentials.extra?.['catalogId'] as string | undefined
    if (!id) {
      throw new Error(
        'Facebook Shop adapter requires `catalogId` in credentials.extra. ' +
          'Set it when creating the connection.',
      )
    }
    return id
  }

  private commerceAccountId(credentials: Credentials): string {
    const id = credentials.extra?.['commerceAccountId'] as string | undefined
    if (!id) {
      throw new Error(
        'Facebook Shop adapter requires `commerceAccountId` in credentials.extra. ' +
          'Set it when creating the connection.',
      )
    }
    return id
  }

  /**
   * One caller page of a Graph API list edge.
   *
   * Graph API cursor paging: `limit` sizes a page, `after` starts the next
   * one, and `paging.next` is present only while more pages remain — "If not
   * included, this is the last page of data."
   * (https://developers.facebook.com/docs/graph-api/results). `paging.cursors`
   * comes back on the last page too, so the end is read from `next` alone.
   * The router never sends `after`, so the caller's 1-based `page` is walked
   * through the cursor chain; an explicit `after` still fetches that one page.
   * No maximum `limit` is documented for the edges used here; if one caps a
   * page short, the next cursor still starts where that page ended, so no row
   * is lost.
   *
   * `account` is the catalog or commerce account the edge hangs off,
   * `collection` separates the pager walks of lists built on one edge, and
   * `query` holds the edge's fixed parameters (fields, filters), which also
   * key the walk.
   */
  private async pageGraphEdge<T>(
    credentials: Credentials,
    params: QueryParams,
    edge: { account: string; path: string; collection: string; query: Record<string, string> },
  ): Promise<T[]> {
    const client = this.clientFor(credentials)
    const limit = (params.limit as number | undefined) ?? DEFAULT_PAGE_SIZE
    const fetch = async (cursor: string | undefined): Promise<{ items: T[]; next?: string }> => {
      const qp: Record<string, unknown> = { ...edge.query, limit }
      if (cursor) qp['after'] = cursor
      const res = await client.get<GraphListEnvelope<T>>(edge.path, qp)
      const next = res.paging?.next ? res.paging.cursors?.after : undefined
      return { items: res.data ?? [], next }
    }

    const after = params['after'] as string | undefined
    if (after) {
      const res = await fetch(after)
      reportUpstreamPage(params, { hasMore: res.next !== undefined })
      return res.items
    }

    const key = cursorPagerKey(connectionScope(edge.account, credentials), edge.collection, {
      ...edge.query,
      limit,
    })
    const { items, hasMore } = await pageByCursor(key, params.page, fetch)
    reportUpstreamPage(params, { hasMore })
    return items
  }

  // ── Products (Catalog API) ────────────────────────────────────────────────

  async listProducts(credentials: Credentials, params: QueryParams): Promise<Product[]> {
    const catalogId = this.catalogId(credentials)
    const rows = await this.pageGraphEdge<RawFacebookProduct>(credentials, params, {
      account: catalogId,
      path: `/${catalogId}/products`,
      collection: 'products',
      query: { fields: PRODUCT_FIELDS },
    })
    return rows.map(transformProduct)
  }

  async getProduct(credentials: Credentials, id: string): Promise<Product> {
    const client = this.clientFor(credentials)
    const res = await client.get<RawFacebookProduct>(`/${encodeURIComponent(id)}`, {
      fields: PRODUCT_FIELDS,
    })
    return transformProduct(res)
  }

  async createProduct(credentials: Credentials, data: Partial<Product>): Promise<Product> {
    const client = this.clientFor(credentials)
    const catalogId = this.catalogId(credentials)
    const body = untransformProduct(data)
    const res = await client.post<{ id: string }>(`/${catalogId}/products`, body)
    return this.getProduct(credentials, res.id)
  }

  async updateProduct(
    credentials: Credentials,
    id: string,
    data: Partial<Product>,
  ): Promise<Product> {
    const client = this.clientFor(credentials)
    const body = untransformProduct(data)
    await client.post<Record<string, unknown>>(`/${encodeURIComponent(id)}`, body)
    return this.getProduct(credentials, id)
  }

  async deleteProduct(credentials: Credentials, id: string): Promise<void> {
    await this.clientFor(credentials).delete(`/${encodeURIComponent(id)}`)
  }

  // ── Collections (Catalog API — product_sets edge) ────────────────────────

  async listCollections(credentials: Credentials, params: QueryParams): Promise<Collection[]> {
    // "Product sets that are in the Catalog" — GET /{product-catalog-id}/product_sets
    // (https://developers.facebook.com/docs/marketing-api/reference/product-catalog/product_sets/).
    // Its paging: "For more details about pagination, see the Graph API guide."
    const catalogId = this.catalogId(credentials)
    const rows = await this.pageGraphEdge<RawFacebookProductSet>(credentials, params, {
      account: catalogId,
      path: `/${catalogId}/product_sets`,
      collection: 'product_sets',
      query: { fields: PRODUCT_SET_FIELDS },
    })
    return rows.map(transformCollection)
  }

  async getCollection(credentials: Credentials, id: string): Promise<Collection> {
    const client = this.clientFor(credentials)
    const res = await client.get<RawFacebookProductSet>(`/${encodeURIComponent(id)}`, {
      fields: PRODUCT_SET_FIELDS,
    })
    return transformCollection(res)
  }

  // ── Inventory (Catalog API — inventory field on product) ──────────────────

  async listInventoryLevels(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<InventoryLevel[]> {
    const catalogId = this.catalogId(credentials)
    const rows = await this.pageGraphEdge<RawFacebookProduct>(credentials, params, {
      account: catalogId,
      path: `/${catalogId}/products`,
      collection: 'inventory',
      query: { fields: PRODUCT_FIELDS },
    })
    return rows.map(transformInventoryLevel)
  }

  async getInventoryLevel(credentials: Credentials, id: string): Promise<InventoryLevel> {
    // Canonical id is `${productId}:facebook-default`; extract product id.
    const productId = id.includes(':') ? id.split(':')[0]! : id
    const client = this.clientFor(credentials)
    const res = await client.get<RawFacebookProduct>(`/${encodeURIComponent(productId)}`, {
      fields: PRODUCT_FIELDS,
    })
    return transformInventoryLevel(res)
  }

  async setInventoryLevel(
    credentials: Credentials,
    data: { variantId: string; locationId: string; available: number },
  ): Promise<InventoryLevel> {
    const client = this.clientFor(credentials)
    await client.post<Record<string, unknown>>(`/${encodeURIComponent(data.variantId)}`, {
      inventory: data.available,
    })
    return this.getInventoryLevel(credentials, data.variantId)
  }

  // ── Orders (Commerce API) ─────────────────────────────────────────────────

  /**
   * "List all the commerce orders associated with a Shop." —
   * GET /{CMS_ID}/commerce_orders
   * (https://developers.facebook.com/docs/commerce-platform/order-management/order-api).
   * The edge "returns orders in `CREATED` state unless state parameter is
   * specified", so every documented state is sent. `updated_after` is not
   * forwarded: it filters on when "the status changed", which is not when
   * the order was last updated, so it could drop changed orders.
   */
  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const cmsId = this.commerceAccountId(credentials)
    const rows = await this.pageGraphEdge<RawFacebookOrder>(credentials, params, {
      account: cmsId,
      path: `/${encodeURIComponent(cmsId)}/commerce_orders`,
      collection: 'commerce_orders',
      query: { fields: ORDER_FIELDS, state: ORDER_STATES },
    })
    const client = this.clientFor(credentials)
    const complete = await Promise.all(rows.map((o) => this.withAllItems(client, o)))
    return complete.map(transformOrder)
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const client = this.clientFor(credentials)
    const res = await client.get<RawFacebookOrder>(`/${encodeURIComponent(id)}`, {
      fields: ORDER_FIELDS,
    })
    return transformOrder(await this.withAllItems(client, res))
  }

  /**
   * The `items` expanded on an order is itself a paged edge (the Order API
   * samples return `items: { data, paging }`), and its nested page size is
   * not documented. When that page is not the last (`paging.next` present —
   * "If not included, this is the last page of data",
   * https://developers.facebook.com/docs/graph-api/results), the order's
   * items are re-read in full from "List Order Items" —
   * GET /{ORDER_ID}/items, which "only returns **default fields**, unless you
   * request additional fields explicitly" — walking its `after` cursors.
   */
  private async withAllItems(
    client: FacebookClient,
    order: RawFacebookOrder,
  ): Promise<RawFacebookOrder> {
    if (!order.items?.paging?.next) return order
    const data: RawFacebookOrderItem[] = []
    let after: string | undefined
    for (;;) {
      const qp: Record<string, unknown> = { fields: ORDER_ITEM_FIELDS }
      if (after) qp['after'] = after
      const res = await client.get<GraphListEnvelope<RawFacebookOrderItem>>(
        `/${encodeURIComponent(order.id)}/items`,
        qp,
      )
      data.push(...(res.data ?? []))
      if (!res.paging?.next) break
      after = res.paging.cursors?.after
      if (!after) {
        throw new Error(
          `Facebook Shop order ${order.id} items page has paging.next but no after cursor`,
        )
      }
    }
    return { ...order, items: { data } }
  }

  // ── Fulfillments (Commerce API — shipments) ───────────────────────────────

  async listFulfillments(credentials: Credentials, params: QueryParams): Promise<Fulfillment[]> {
    const orderId = (params['orderId'] ?? params['order_id']) as string | undefined
    if (!orderId) {
      throw new Error('Facebook Shop listFulfillments requires `orderId` in query params.')
    }
    const client = this.clientFor(credentials)
    const res = await client.get<GraphListEnvelope<RawFacebookShipment>>(
      `/${encodeURIComponent(orderId)}/shipments`,
    )
    return transformFulfillments(orderId, res.data)
  }

  async getFulfillment(credentials: Credentials, id: string): Promise<Fulfillment> {
    // Fulfillment id may be composite `${orderId}:${shipmentId}` or plain.
    const parts = id.split(':')
    let orderId: string
    let shipmentId: string
    if (parts.length >= 2) {
      orderId = parts[0]!
      shipmentId = parts[1]!
    } else {
      throw new Error('Facebook Shop getFulfillment requires id formatted as `orderId:shipmentId`')
    }
    const client = this.clientFor(credentials)
    const res = await client.get<RawFacebookShipment>(`/${encodeURIComponent(shipmentId)}`)
    return transformFulfillment(orderId, res)
  }

  async createFulfillment(
    credentials: Credentials,
    data: Partial<Fulfillment>,
  ): Promise<Fulfillment> {
    const orderId = data.orderId
    if (!orderId) {
      throw new Error('Facebook Shop createFulfillment requires `orderId`.')
    }
    const client = this.clientFor(credentials)
    const body = untransformFulfillment(data)
    const res = await client.post<{ id: string }>(`/${encodeURIComponent(orderId)}/shipments`, body)
    const created = await client.get<RawFacebookShipment>(`/${encodeURIComponent(res.id)}`)
    return transformFulfillment(orderId, created)
  }

  // ── Refunds (Commerce API) ────────────────────────────────────────────────

  async listRefunds(credentials: Credentials, params: QueryParams): Promise<Refund[]> {
    const orderId = (params['orderId'] ?? params['order_id']) as string | undefined
    if (!orderId) {
      throw new Error('Facebook Shop listRefunds requires `orderId` in query params.')
    }
    const client = this.clientFor(credentials)
    const res = await client.get<GraphListEnvelope<RawFacebookRefund>>(
      `/${encodeURIComponent(orderId)}/refunds`,
    )
    const refunds = (res.data ?? []).map(transformRefund)
    // Ensure orderId is set on all refunds
    return refunds.map((r) => ({ ...r, orderId }))
  }

  async getRefund(credentials: Credentials, id: string): Promise<Refund> {
    const client = this.clientFor(credentials)
    const res = await client.get<RawFacebookRefund>(`/${encodeURIComponent(id)}`)
    return transformRefund(res)
  }

  async createRefund(credentials: Credentials, data: Partial<Refund>): Promise<Refund> {
    const orderId = data.orderId
    if (!orderId) {
      throw new Error('Facebook Shop createRefund requires `orderId`.')
    }
    const client = this.clientFor(credentials)
    const body = untransformRefund(data)
    const res = await client.post<{ id: string }>(`/${encodeURIComponent(orderId)}/refunds`, body)
    const created = await client.get<RawFacebookRefund>(`/${encodeURIComponent(res.id)}`)
    return transformRefund({ ...created, order_id: orderId })
  }
}
