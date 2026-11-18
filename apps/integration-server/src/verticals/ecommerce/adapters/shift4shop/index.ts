import {
  connectionScope,
  cursorPagerKey,
  pageByRows,
  pageLocally,
  pageOffset,
  reportUpstreamPage,
  simpleApiKey,
} from '@opensteward/shared'
/**
 * Shift4Shop (formerly 3dcart) adapter for the ecommerce vertical.
 *
 * Maps the Shift4Shop REST API (`https://apirest.3dcart.com/3dCartWebAPI/v1`)
 * to the canonical ecommerce resources. Shift4Shop uses two static headers for
 * authentication — no OAuth flow exists.
 *
 * Credentials shape:
 *   accessToken → PrivateKey header (private API key)
 *   extra.token → Token header (public API token)
 */

// ── Resource coverage ──────────────────────────────────────────────
// Unavailable: location — Shift4Shop REST API has no locations endpoint;
//   warehouse data is embedded as fields on order items (ItemWarehouseID etc.),
//   not exposed as a queryable resource.

import type { Credentials, QueryParams } from '@opensteward/shared'
import type { EcommerceAdapter } from '../../adapter/interface'
import type { Product } from '../../schema/product'
import type { Customer } from '../../schema/customer'
import type { Order } from '../../schema/order'
import type { Fulfillment } from '../../schema/fulfillment'
import type { InventoryLevel } from '../../schema/inventory'
import type { Collection } from '../../schema/collection'
import type { Discount } from '../../schema/discount'
import type { Refund } from '../../schema/refund'
import type { Transaction } from '../../schema/transaction'

import { getAuthUrl as s4sGetAuthUrl, exchangeCode as s4sExchangeCode } from './auth'
import { Shift4ShopClient } from './client'
import {
  DEFAULT_PAGE_SIZE,
  ORDERS_BATCH_SIZE,
  OTHER_BATCH_SIZE,
  PRODUCTS_BATCH_SIZE,
} from './constants'

import { transformProduct, type RawShift4ShopProduct } from './transform/product'
import {
  transformOrder,
  type RawShift4ShopOrder,
  type RawShift4ShopShipment,
} from './transform/order'
import { transformCustomer, type RawShift4ShopCustomer } from './transform/customer'
import { transformCollection, type RawShift4ShopCategory } from './transform/collection'
import { transformDiscount, type RawShift4ShopPromotion } from './transform/discount'
import { transformRefund, type RawShift4ShopRMA } from './transform/refund'
import { transformTransaction, type RawShift4ShopTransaction } from './transform/transaction'

export interface Shift4ShopAdapterConfig {
  /** Private API key (PrivateKey header). */
  privateKey?: string
  /** Public API token (Token header). */
  token?: string
}
const SIMPLE_API_KEY_FORM = simpleApiKey()

export class Shift4ShopAdapter implements EcommerceAdapter {
  // Connect Link support — single API-key form.

  credentialFields = SIMPLE_API_KEY_FORM.credentialFields

  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'shift4shop'
  readonly version = '0.1.0'
  /** Honours `params.search`; see AdapterCapabilities. Declared so the
   *  router can refuse the parameter on adapters that would drop it. */
  readonly capabilities = { search: true }

  private configPrivateKey: string | undefined
  private configToken: string | undefined

  constructor(config: Shift4ShopAdapterConfig = {}) {
    this.configPrivateKey = config.privateKey
    this.configToken = config.token
  }

  // ── Auth ──────────────────────────────────────────────────────────────────

  getAuthUrl(state: string): string {
    return s4sGetAuthUrl(state)
  }

  async exchangeCode(code: string, redirectUri: string): Promise<Credentials> {
    return s4sExchangeCode(code, redirectUri)
  }

  /** Shift4Shop API keys don't expire — return credentials unchanged. */
  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return credentials
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private clientFor(credentials: Credentials): Shift4ShopClient {
    const privateKey =
      credentials.accessToken && credentials.accessToken !== 'api-key'
        ? credentials.accessToken
        : this.configPrivateKey

    const token = (credentials.extra?.['token'] as string | undefined) ?? this.configToken

    if (!privateKey || !token) {
      throw new Error(
        'Shift4Shop adapter is missing privateKey or token — ' +
          'either configure them in config.yml under adapters.shift4shop, ' +
          'or POST them to /v1/connections with credentials: ' +
          '{ accessToken: "<privateKey>", extra: { token: "<publicToken>" } }.',
      )
    }

    const mergedCreds: Credentials = {
      ...credentials,
      accessToken: privateKey,
      extra: { ...credentials.extra, token },
    }
    return new Shift4ShopClient(mergedCreds)
  }

  /**
   * One caller page of an offset list: `limit` is the caller's limit clamped
   * to the endpoint's documented batch size, and `offset` strides by that
   * size from the caller's 1-based `page`. The body is a bare array with no
   * total or next link, so a short page ends the list and a full one is
   * reported as having more (a list that is an exact multiple of the page
   * size costs one empty request, answered by the documented 404). The
   * clamped size is reported so a full page is judged against it.
   */
  private async offsetPage<T>(
    client: Shift4ShopClient,
    path: string,
    params: QueryParams,
    batchSize: number,
  ): Promise<T[]> {
    const asked =
      typeof params.limit === 'number' && Number.isFinite(params.limit) && params.limit >= 1
        ? Math.floor(params.limit)
        : DEFAULT_PAGE_SIZE
    const size = Math.min(asked, batchSize)
    const query: Record<string, unknown> = { limit: size, offset: pageOffset(params, size) }
    if (params.search) query['keyword'] = params.search
    const items = await client.listPage<T>(path, query)
    reportUpstreamPage(params, { hasMore: items.length >= size, pageSize: size })
    return items
  }

  /** The private key a connection really uses, as {@link clientFor} resolves it. */
  private pagerScope(credentials: Credentials): string {
    const privateKey =
      credentials.accessToken && credentials.accessToken !== 'api-key'
        ? credentials.accessToken
        : (this.configPrivateKey ?? '')
    return connectionScope('shift4shop', { accessToken: privateKey })
  }

  private listParams(params: QueryParams): Record<string, unknown> {
    const out: Record<string, unknown> = {
      limit: params.limit ?? DEFAULT_PAGE_SIZE,
      offset: params.offset ?? 0,
    }
    if (params.search) out['keyword'] = params.search
    return out
  }

  // ── Products ──────────────────────────────────────────────────────────────

  async listProducts(credentials: Credentials, params: QueryParams): Promise<Product[]> {
    const client = this.clientFor(credentials)
    const items = await this.offsetPage<RawShift4ShopProduct>(
      client,
      'Products',
      params,
      PRODUCTS_BATCH_SIZE,
    )
    return items.map((p) => transformProduct(p))
  }

  async getProduct(credentials: Credentials, id: string): Promise<Product> {
    const client = this.clientFor(credentials)
    const items = await client.get<RawShift4ShopProduct[]>(`Products/${id}`)
    const raw = Array.isArray(items) ? items[0] : (items as unknown as RawShift4ShopProduct)
    if (!raw) throw new Error(`Shift4Shop product ${id} not found`)
    return transformProduct(raw)
  }

  // ── Orders ────────────────────────────────────────────────────────────────

  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const client = this.clientFor(credentials)
    const items = await this.offsetPage<RawShift4ShopOrder>(
      client,
      'Orders',
      params,
      ORDERS_BATCH_SIZE,
    )
    return items.map(transformOrder)
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const client = this.clientFor(credentials)
    const items = await client.get<RawShift4ShopOrder[]>(`Orders/${id}`)
    const raw = Array.isArray(items) ? items[0] : (items as unknown as RawShift4ShopOrder)
    if (!raw) throw new Error(`Shift4Shop order ${id} not found`)
    return transformOrder(raw)
  }

  async cancelOrder(
    credentials: Credentials,
    id: string,
    _data?: { reason?: string },
  ): Promise<Order> {
    const client = this.clientFor(credentials)
    // Cancel by setting OrderStatusID to 4 (Cancelled).
    await client.put(`Orders/${id}`, { OrderStatusID: 4 })
    // Re-fetch to get updated state.
    const items = await client.get<RawShift4ShopOrder[]>(`Orders/${id}`)
    const raw = Array.isArray(items) ? items[0] : (items as unknown as RawShift4ShopOrder)
    if (!raw) throw new Error(`Shift4Shop order ${id} not found after cancel`)
    return transformOrder(raw)
  }

  // ── Customers ─────────────────────────────────────────────────────────────

  async listCustomers(credentials: Credentials, params: QueryParams): Promise<Customer[]> {
    const client = this.clientFor(credentials)
    const items = await this.offsetPage<RawShift4ShopCustomer>(
      client,
      'Customers',
      params,
      OTHER_BATCH_SIZE,
    )
    return items.map(transformCustomer)
  }

  async getCustomer(credentials: Credentials, id: string): Promise<Customer> {
    const client = this.clientFor(credentials)
    const items = await client.get<RawShift4ShopCustomer[]>(`Customers/${id}`)
    const raw = Array.isArray(items) ? items[0] : (items as unknown as RawShift4ShopCustomer)
    if (!raw) throw new Error(`Shift4Shop customer ${id} not found`)
    return transformCustomer(raw)
  }

  // ── Fulfillments (Shipments) ──────────────────────────────────────────────

  async listFulfillments(credentials: Credentials, params: QueryParams): Promise<Fulfillment[]> {
    const orderId = (params['orderId'] ?? params['order_id']) as string | number | undefined
    const client = this.clientFor(credentials)

    if (orderId != null) {
      // Fetch shipments for a specific order: its whole ShipmentList, paged locally.
      const items = await client.get<RawShift4ShopOrder[]>(`Orders/${orderId}`)
      const order = Array.isArray(items) ? items[0] : (items as unknown as RawShift4ShopOrder)
      if (!order) return pageLocally([], params)
      return pageLocally(
        (order.ShipmentList ?? []).map((s) => mapShipmentToFulfillment(s, String(orderId))),
        params,
      )
    }

    // No documented list of all shipments: they are flattened out of each
    // order's ShipmentList ("Collection of Shipment objects"), so a page of
    // orders holds 0..n fulfillments and is not a caller page. pageByRows
    // walks the orders at the documented batch size ("GET Orders: 300") by
    // offset and cuts exactly the caller's rows, with hasMore exact. The
    // order page size does not follow the caller's limit, so the limit is
    // the batch size in the key.
    const search = params.search || undefined
    const key = cursorPagerKey(this.pagerScope(credentials), 'Orders#fulfillments', {
      search,
      limit: ORDERS_BATCH_SIZE,
    })
    const { items } = await pageByRows<Fulfillment, number>(
      key,
      params,
      async (cursor) => {
        const offset = cursor ?? 0
        const query: Record<string, unknown> = { limit: ORDERS_BATCH_SIZE, offset }
        if (search) query['keyword'] = search
        const orders = await client.listPage<RawShift4ShopOrder>('Orders', query)
        const rows: Fulfillment[] = []
        for (const order of orders) {
          const oid =
            order.InvoiceNumberPrefix != null
              ? `${order.InvoiceNumberPrefix}${order.InvoiceNumber ?? ''}`
              : String(order.InvoiceNumber ?? '')
          for (const s of order.ShipmentList ?? []) rows.push(mapShipmentToFulfillment(s, oid))
        }
        // A short page of orders ends the list.
        const next = orders.length >= ORDERS_BATCH_SIZE ? offset + ORDERS_BATCH_SIZE : undefined
        return { items: rows, next }
      },
      { defaultLimit: DEFAULT_PAGE_SIZE },
    )
    return items
  }

  async getFulfillment(credentials: Credentials, id: string): Promise<Fulfillment> {
    // id format: `<orderId>:<shipmentId>`
    const [orderId, shipmentId] = id.split(':')
    if (!orderId || !shipmentId) {
      throw new Error('Shift4Shop getFulfillment requires composite id format `orderId:shipmentId`')
    }
    const client = this.clientFor(credentials)
    const items = await client.get<RawShift4ShopOrder[]>(`Orders/${orderId}`)
    const order = Array.isArray(items) ? items[0] : (items as unknown as RawShift4ShopOrder)
    if (!order) throw new Error(`Shift4Shop order ${orderId} not found`)
    const shipment = (order.ShipmentList ?? []).find(
      (s) => s.ShipmentID != null && String(s.ShipmentID) === shipmentId,
    )
    if (!shipment)
      throw new Error(`Shift4Shop shipment ${shipmentId} not found on order ${orderId}`)
    return mapShipmentToFulfillment(shipment, orderId)
  }

  // ── Inventory ─────────────────────────────────────────────────────────────

  async listInventoryLevels(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<InventoryLevel[]> {
    const client = this.clientFor(credentials)
    // One row per product (SKUInfo is documented as one ProductSKU object), so
    // one page of products is one caller page.
    const products = await this.offsetPage<RawShift4ShopProduct>(
      client,
      'Products',
      params,
      PRODUCTS_BATCH_SIZE,
    )
    const levels: InventoryLevel[] = []
    for (const product of products) {
      const productId = String(product.CatalogID ?? '')
      const skus = product.SKUInfo ?? []
      if (skus.length > 0) {
        for (const sku of skus) {
          const info = sku.SKUInfo ?? {}
          const skuId = info.SKUID != null ? String(info.SKUID) : `${productId}:sku`
          levels.push({
            id: `${skuId}:default`,
            variantId: skuId,
            locationId: 'default',
            available: Math.max(0, Math.round(Number(info.SKUStock ?? 0))),
            metadata: sku as unknown as Record<string, unknown>,
          })
        }
      } else {
        const stock = Math.max(0, Math.round(Number(product.Stock ?? 0)))
        const variantId = `${productId}:default`
        levels.push({
          id: `${variantId}:default`,
          variantId,
          locationId: 'default',
          available: stock,
          metadata: product as unknown as Record<string, unknown>,
        })
      }
    }
    return levels
  }

  async getInventoryLevel(credentials: Credentials, id: string): Promise<InventoryLevel> {
    // id format: `<productId>:default:default` or `<skuId>:default`
    const parts = id.split(':')
    const productId = parts[0]
    if (!productId) throw new Error(`Invalid inventory level id: ${id}`)
    const client = this.clientFor(credentials)
    const items = await client.get<RawShift4ShopProduct[]>(`Products/${productId}`)
    const product = Array.isArray(items) ? items[0] : (items as unknown as RawShift4ShopProduct)
    if (!product) throw new Error(`Shift4Shop product ${productId} not found`)

    const stock = Math.max(0, Math.round(Number(product.Stock ?? 0)))
    const variantId = `${productId}:default`
    return {
      id: `${variantId}:default`,
      variantId,
      locationId: 'default',
      available: stock,
      metadata: product as unknown as Record<string, unknown>,
    }
  }

  // ── Collections (Categories) ──────────────────────────────────────────────

  async listCollections(credentials: Credentials, params: QueryParams): Promise<Collection[]> {
    const client = this.clientFor(credentials)
    const items = await this.offsetPage<RawShift4ShopCategory>(
      client,
      'Categories',
      params,
      OTHER_BATCH_SIZE,
    )
    return items.map(transformCollection)
  }

  async getCollection(credentials: Credentials, id: string): Promise<Collection> {
    const client = this.clientFor(credentials)
    const items = await client.get<RawShift4ShopCategory[]>(`Categories/${id}`)
    const raw = Array.isArray(items) ? items[0] : (items as unknown as RawShift4ShopCategory)
    if (!raw) throw new Error(`Shift4Shop category ${id} not found`)
    return transformCollection(raw)
  }

  // ── Discounts (Promotions) ────────────────────────────────────────────────

  async listDiscounts(credentials: Credentials, params: QueryParams): Promise<Discount[]> {
    const client = this.clientFor(credentials)
    const items = await this.offsetPage<RawShift4ShopPromotion>(
      client,
      'Promotions',
      params,
      OTHER_BATCH_SIZE,
    )
    return items.map(transformDiscount)
  }

  async getDiscount(credentials: Credentials, id: string): Promise<Discount> {
    const client = this.clientFor(credentials)
    const items = await client.get<RawShift4ShopPromotion[]>(`Promotions/${id}`)
    const raw = Array.isArray(items) ? items[0] : (items as unknown as RawShift4ShopPromotion)
    if (!raw) throw new Error(`Shift4Shop promotion ${id} not found`)
    return transformDiscount(raw)
  }

  // ── Refunds (RMAs) ────────────────────────────────────────────────────────

  /**
   * Returns are RMAs: "GET https://apirest.3dcart.com/3dCartWebAPI/v1/RMA"
   * (https://apirest.3dcart.com/v1/rma/index.html), paged by limit and offset
   * at the "All Others: 500" batch size. Its URL parameters are rmastatusid,
   * rmareasonid, rmamethodid, catalogid, sku, datestart, dateend, limit,
   * offset and countonly: no search and no order filter.
   */
  async listRefunds(credentials: Credentials, params: QueryParams): Promise<Refund[]> {
    if (params.search) {
      throw Object.assign(
        new Error(
          'Shift4Shop cannot search RMAs: GET /RMA documents no search parameter (its filters are ' +
            'rmastatusid, rmareasonid, rmamethodid, catalogid, sku, datestart and dateend)',
        ),
        { statusCode: 501, code: 'NOT_SUPPORTED' },
      )
    }
    const client = this.clientFor(credentials)
    const orderId = params['orderId'] ?? params['order_id']

    if (orderId != null && orderId !== '') {
      // No documented order filter: one order's RMAs are cut out of the whole
      // RMA walk by the documented OrderID, a batch at a time, so a caller
      // page is not an upstream page.
      const wanted = String(orderId)
      const key = cursorPagerKey(this.pagerScope(credentials), 'RMA#order', {
        orderId: wanted,
        limit: OTHER_BATCH_SIZE,
      })
      const { items } = await pageByRows<Refund, number>(
        key,
        params,
        async (cursor) => {
          const offset = cursor ?? 0
          const rmas = await client.listPage<RawShift4ShopRMA>('RMA', {
            limit: OTHER_BATCH_SIZE,
            offset,
          })
          const rows = rmas.filter((r) => String(r.OrderID) === wanted).map(transformRefund)
          // A short batch ends the list; a past-the-end batch is the documented 404.
          const next = rmas.length >= OTHER_BATCH_SIZE ? offset + OTHER_BATCH_SIZE : undefined
          return { items: rows, next }
        },
        { defaultLimit: DEFAULT_PAGE_SIZE },
      )
      return items
    }

    const items = await this.offsetPage<RawShift4ShopRMA>(client, 'RMA', params, OTHER_BATCH_SIZE)
    return items.map(transformRefund)
  }

  /** "GET https://apirest.3dcart.com/3dCartWebAPI/v1/RMA/{rmaid}"; 404 "No RMAs found." */
  async getRefund(credentials: Credentials, id: string): Promise<Refund> {
    const client = this.clientFor(credentials)
    const items = await client.get<RawShift4ShopRMA[]>(`RMA/${encodeURIComponent(id)}`)
    // The documented response is an array; any other shape is undocumented.
    if (!Array.isArray(items)) {
      throw new Error(`Shift4Shop GET RMA/${id} returned an undocumented non-array body`)
    }
    const raw = items[0]
    if (!raw) throw new Error(`Shift4Shop RMA ${id} not found`)
    return transformRefund(raw)
  }

  // ── Transactions ──────────────────────────────────────────────────────────

  async listTransactions(credentials: Credentials, params: QueryParams): Promise<Transaction[]> {
    const orderId = (params['orderId'] ?? params['order_id']) as string | undefined
    if (!orderId) {
      throw new Error('Shift4Shop listTransactions requires an orderId in query params')
    }
    const client = this.clientFor(credentials)
    const items = await client.get<RawShift4ShopTransaction[]>(
      `Orders/${orderId}/Transactions`,
      this.listParams(params),
    )
    return (Array.isArray(items) ? items : []).map((tx) => transformTransaction(tx, orderId))
  }

  async getTransaction(credentials: Credentials, id: string): Promise<Transaction> {
    // id format: `<orderId>:<transactionId>`
    const sep = id.indexOf(':')
    if (sep <= 0) {
      throw new Error(
        'Shift4Shop getTransaction requires composite id format `orderId:transactionId`',
      )
    }
    const orderId = id.slice(0, sep)
    const txId = id.slice(sep + 1)
    const client = this.clientFor(credentials)
    const items = await client.get<RawShift4ShopTransaction[]>(`Orders/${orderId}/Transactions`)
    const txs = Array.isArray(items) ? items : []
    const raw = txs.find((t) => String(t.OrderTransactionID) === txId)
    if (!raw) throw new Error(`Shift4Shop transaction ${id} not found`)
    return transformTransaction(raw, orderId)
  }
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function mapShipmentToFulfillment(raw: RawShift4ShopShipment, orderId: string): Fulfillment {
  const hasTracking = raw.ShipmentTrackingCode != null && raw.ShipmentTrackingCode !== ''
  const shipmentId = raw.ShipmentID != null ? String(raw.ShipmentID) : `${orderId}:shipment`
  return {
    id: `${orderId}:${shipmentId}`,
    orderId,
    status: hasTracking ? 'SUCCESS' : 'PENDING',
    trackingNumber: raw.ShipmentTrackingCode ?? undefined,
    carrier: raw.ShipmentMethodName ?? undefined,
    shippedAt: raw.ShipmentDate ?? undefined,
    createdAt: raw.ShipmentDate ?? undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}
