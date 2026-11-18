/**
 * Mirakl Marketplace Platform adapter for the ecommerce vertical.
 *
 * Maps the Mirakl seller REST API (`{baseUrl}/api`) to the canonical
 * ecommerce resources. Mirakl uses a static API key sent directly in
 * the `Authorization` header — there is no OAuth code-exchange flow.
 *
 * Supported resources:
 *  - Orders       (list, get, cancel) — via /api/orders
 *  - Products     (list, get, create, update) — via /api/offers/imports
 *  - Refunds      (list, get) — buyer returns via /api/returns (RT11)
 *  - Customers    (get) — extracted from order.customer
 *  - Locations    (list, get) — synthetic single-location
 *  - Fulfillments (list, get) — via /api/shipments (ST11)
 *  - Discounts    (list) — via /api/promotions (PR01)
 *  - Inventory    (list) — derived from /api/offers quantity field
 *
 * ── Resource coverage ──────────────────────────────────────────────
 * Unavailable: collection — Mirakl hierarchies (/api/hierarchies) are
 *   operator-defined taxonomy trees, not merchant-curated product sets;
 *   no seller-writable collection concept exists in the seller API.
 * Unavailable: transaction — /api/sellerpayment/transactions_logs returns
 *   accounting/settlement lines (commissions, fees, refunds) rather than
 *   payment gateway capture/auth events; there is no canonical payment
 *   transaction endpoint in the seller API.
 */

import {
  connectionScope,
  cursorPagerKey,
  customForm,
  pageByCursor,
  pageOffset,
  reportUpstreamPage,
} from '@opensteward/shared'
import type { Credentials, QueryParams } from '@opensteward/shared'
import { minorToMajor } from '../../schema/shared'
import type { EcommerceAdapter } from '../../adapter/interface'
import type { Product } from '../../schema/product'
import type { Location } from '../../schema/location'
import type { Customer } from '../../schema/customer'
import type { Order } from '../../schema/order'
import type { Refund } from '../../schema/refund'
import type { Fulfillment } from '../../schema/fulfillment'
import type { Discount } from '../../schema/discount'
import type { InventoryLevel } from '../../schema/inventory'

import { buildAuthUrl, exchangeCode as miraklExchangeCode } from './auth'
import { MiraklClient } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, PATHS } from './constants'
import { transformOrder, type RawMiraklOrder } from './transform/order'
import { transformOffer, untransformOffer, type RawMiraklOffer } from './transform/product'
import { transformReturn, type RawMiraklReturn } from './transform/refund'
import { transformCustomer } from './transform/customer'
import { syntheticDefaultLocation } from './transform/location'
import { transformShipment, type RawMiraklShipment } from './transform/fulfillment'
import { transformPromotion, type RawMiraklPromotion } from './transform/discount'
import { transformOfferToInventoryLevel } from './transform/inventory'

export interface MiraklAdapterConfig {
  /** Seller API key (optional — may come from per-connection credentials). */
  apiKey?: string
  /** Operator instance base URL (e.g. https://mystore.mirakl.net). */
  baseUrl?: string
}

const CUSTOM_FORM = customForm({
  fields: [
    {
      name: 'apiKey',
      label: 'Seller API key',
      type: 'password',
      required: true,
      helpText: 'Found in the Mirakl back-office under Settings → API Keys.',
    },
    {
      name: 'baseUrl',
      label: 'Operator base URL',
      type: 'url',
      required: true,
      placeholder: 'https://your-operator.mirakl.net',
      helpText: 'The base URL of your Mirakl operator instance.',
    },
  ],
  async exchange(fields) {
    const apiKey = (fields['apiKey'] ?? '').trim()
    const baseUrl = (fields['baseUrl'] ?? '').trim()
    if (!apiKey) throw new Error('Seller API key is required.')
    if (!baseUrl) throw new Error('Operator base URL is required.')
    return {
      accessToken: apiKey,
      extra: { baseUrl },
    }
  },
})

export class MiraklAdapter implements EcommerceAdapter {
  // Connect Link support — two-field form (API key + base URL).
  credentialFields = CUSTOM_FORM.credentialFields
  exchangeCredentials = CUSTOM_FORM.exchangeCredentials

  readonly platform = 'mirakl'
  readonly version = '0.1.0'

  private configApiKey: string | undefined
  private configBaseUrl: string | undefined

  constructor(config: MiraklAdapterConfig = {}) {
    this.configApiKey = config.apiKey
    this.configBaseUrl = config.baseUrl
  }

  // ── Auth ──────────────────────────────────────────────────────────────────

  getAuthUrl(_state: string): string {
    return buildAuthUrl(this.configBaseUrl ?? 'https://your-operator.mirakl.net')
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    return miraklExchangeCode()
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    // Mirakl API keys do not expire — no-op.
    return credentials
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private clientFor(credentials: Credentials): MiraklClient {
    const apiKey =
      (credentials.accessToken && credentials.accessToken !== 'api-key'
        ? credentials.accessToken
        : undefined) ?? this.configApiKey
    const baseUrl = (credentials.extra?.['baseUrl'] as string | undefined) ?? this.configBaseUrl

    if (!apiKey) {
      throw new Error(
        'Mirakl adapter: API key is required. ' +
          'POST to /v1/connections with credentials: { apiKey, baseUrl }.',
      )
    }
    if (!baseUrl) {
      throw new Error(
        'Mirakl adapter: baseUrl is required (e.g. https://your-operator.mirakl.net). ' +
          'POST to /v1/connections with credentials: { apiKey, baseUrl }.',
      )
    }

    return new MiraklClient({
      ...credentials,
      accessToken: apiKey,
      extra: { ...credentials.extra, baseUrl },
    })
  }

  /**
   * The list filters, position and size aside (those come from the pager).
   * Mirakl uses `last_updated_date_range[start]` for date filtering.
   */
  private listFilters(params: QueryParams): Record<string, unknown> {
    const out: Record<string, unknown> = {}
    if (params.updatedAfter) {
      out['last_updated_date_range[start]'] = params.updatedAfter.toISOString()
    }
    return out
  }

  /**
   * The page size to ask Mirakl for: the caller's limit, clamped to the
   * documented maximum of 100 for both `max` (offset) and `limit` (seek).
   */
  private pageSize(params: QueryParams): { asked: number; size: number } {
    const asked = Math.max(1, Math.floor(params.limit ?? DEFAULT_PAGE_SIZE))
    return { asked, size: Math.min(asked, MAX_PAGE_SIZE) }
  }

  /**
   * One caller page of an offset-paginated list (OR11 orders, OF21 offers,
   * PR01 promotions). Mirakl documents `max` ("the maximum number of items
   * returned per page ... The maximum value of this parameter is 100.") and
   * `offset` ("the index of the first item (among all the results) in the
   * returned page"), and every one of these responses carries `total_count`.
   * They take no `limit`, which is why every page used to be the first 10.
   */
  private async offsetPage<T>(
    credentials: Credentials,
    path: string,
    dataKey: string,
    params: QueryParams,
    filters: Record<string, unknown> = {},
  ): Promise<T[]> {
    const { asked, size } = this.pageSize(params)
    const offset = pageOffset(params, size)
    const raw = await this.clientFor(credentials).get<Record<string, unknown>>(path, {
      max: size,
      offset,
      ...filters,
    })
    const items = (raw[dataKey] ?? []) as T[]
    const total = raw['total_count']
    reportUpstreamPage(params, {
      ...(typeof total === 'number'
        ? { totalCount: total, hasMore: offset + items.length < total }
        : {}),
      ...(size < asked ? { pageSize: size } : {}),
    })
    return items
  }

  // ── Products (Offers) ─────────────────────────────────────────────────────

  async listProducts(credentials: Credentials, params: QueryParams): Promise<Product[]> {
    const rows = await this.offsetPage<RawMiraklOffer>(
      credentials,
      PATHS.offers,
      'offers',
      params,
      this.listFilters(params),
    )
    return rows.map((o) => transformOffer(o))
  }

  async getProduct(credentials: Credentials, id: string): Promise<Product> {
    const raw = await this.clientFor(credentials).get<RawMiraklOffer>(PATHS.offer(id))
    return transformOffer(raw)
  }

  async createProduct(credentials: Credentials, data: Partial<Product>): Promise<Product> {
    const body = { offers: [untransformOffer(data)] }
    await this.clientFor(credentials).post<unknown>(PATHS.offersImports, body)
    // Mirakl offer creation is asynchronous (import-based); return the
    // input reflected back with the id that was submitted.
    return transformOffer({
      offer_id: data.id ?? data.variants?.[0]?.sku,
      shop_sku: data.variants?.[0]?.sku,
      product_title: data.title,
      description: data.description,
      active: data.status === 'ACTIVE',
      price:
        data.variants?.[0]?.price?.amount != null
          ? minorToMajor(data.variants[0].price.amount, data.variants[0].price.currency)
          : undefined,
    })
  }

  async updateProduct(
    credentials: Credentials,
    id: string,
    data: Partial<Product>,
  ): Promise<Product> {
    const body = { offers: [{ ...untransformOffer(data), offer_id: id }] }
    await this.clientFor(credentials).post<unknown>(PATHS.offersImports, body)
    const current = await this.clientFor(credentials).get<RawMiraklOffer>(PATHS.offer(id))
    return transformOffer(current)
  }

  // ── Orders ────────────────────────────────────────────────────────────────

  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const filters: Record<string, unknown> = {}
    if (params.updatedAfter) {
      // Mirakl date filter for orders
      filters['start_update_date'] = params.updatedAfter.toISOString()
    }
    const rows = await this.offsetPage<RawMiraklOrder>(
      credentials,
      PATHS.orders,
      'orders',
      params,
      filters,
    )
    return rows.map(transformOrder)
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const raw = await this.clientFor(credentials).get<RawMiraklOrder>(PATHS.order(id))
    return transformOrder(raw)
  }

  async cancelOrder(
    credentials: Credentials,
    id: string,
    _data?: { reason?: string },
  ): Promise<Order> {
    // Mirakl requires cancellation at the order-line level via PUT /api/orders/{id}/cancel
    const order = await this.clientFor(credentials).get<RawMiraklOrder>(PATHS.order(id))
    const lineIds = (order.order_lines ?? []).map((l) => ({
      id: l.id,
      reason_code: 'OTHER',
    }))
    await this.clientFor(credentials).put<unknown>(`${PATHS.order(id)}/cancel`, {
      order_lines: lineIds,
    })
    const updated = await this.clientFor(credentials).get<RawMiraklOrder>(PATHS.order(id))
    return transformOrder(updated)
  }

  // ── Refunds (Returns) ─────────────────────────────────────────────────────

  async listRefunds(credentials: Credentials, params: QueryParams): Promise<Refund[]> {
    // RT11 (GET /api/returns) is seek-paginated: `limit` (max 100) on the
    // first request, then the response's `next_page_token` as `page_token`,
    // with which "all other parameters are ignored". Rows are under `data`.
    // updatedAfter maps to the documented `return_last_updated_from`
    // ("Filter returns updated after the given date.").
    const { asked, size } = this.pageSize(params)
    const filters: Record<string, unknown> = {}
    if (params.updatedAfter) {
      filters['return_last_updated_from'] = params.updatedAfter.toISOString()
    }
    const client = this.clientFor(credentials)
    const baseUrl =
      (credentials.extra?.['baseUrl'] as string | undefined) ?? this.configBaseUrl ?? ''
    const key = cursorPagerKey(connectionScope(baseUrl, credentials), 'returns', {
      ...filters,
      limit: size,
    })
    const res = await pageByCursor<RawMiraklReturn>(key, params.page, async (token) => {
      const raw = await client.get<Record<string, unknown>>(
        PATHS.returns,
        token !== undefined ? { page_token: token } : { limit: size, ...filters },
      )
      const next = raw['next_page_token']
      return {
        items: (raw['data'] ?? []) as RawMiraklReturn[],
        next: typeof next === 'string' && next !== '' ? next : undefined,
      }
    })
    reportUpstreamPage(params, {
      hasMore: res.hasMore,
      ...(size < asked ? { pageSize: size } : {}),
    })
    return res.items.map(transformReturn)
  }

  async getRefund(credentials: Credentials, id: string): Promise<Refund> {
    // RT11 has no by-id path; it documents a `return_id` filter ("Return id
    // for filtering"), and rows come back under `data`.
    const raw = await this.clientFor(credentials).get<Record<string, unknown>>(PATHS.returns, {
      return_id: id,
    })
    const match = ((raw['data'] ?? []) as RawMiraklReturn[]).find((r) => r.id === id)
    if (!match) {
      throw new Error(`Mirakl: return '${id}' not found`)
    }
    return transformReturn(match)
  }

  // ── Customers ─────────────────────────────────────────────────────────────
  // Mirakl does not expose a /api/customers list endpoint for sellers.
  // Customer data is extracted from individual orders.

  async getCustomer(credentials: Credentials, id: string): Promise<Customer> {
    // Fetch the most recently updated order for this customer.
    const res = await this.clientFor(credentials).listWithToken<RawMiraklOrder>(
      PATHS.orders,
      'orders',
      { customer_id: id, limit: 1 },
    )
    const order = res.items[0]
    if (!order?.customer) {
      throw new Error(`Mirakl: no order found for customer_id '${id}'`)
    }
    return transformCustomer(order.customer, order.order_id ?? undefined)
  }

  // ── Locations ─────────────────────────────────────────────────────────────

  async listLocations(credentials: Credentials, _params: QueryParams): Promise<Location[]> {
    const baseUrl =
      (credentials.extra?.['baseUrl'] as string | undefined) ?? this.configBaseUrl ?? 'default'
    return [syntheticDefaultLocation(baseUrl)]
  }

  async getLocation(credentials: Credentials, id: string): Promise<Location> {
    if (id !== 'default') {
      throw new Error(`Mirakl has no native locations; unknown location id '${id}'`)
    }
    const baseUrl =
      (credentials.extra?.['baseUrl'] as string | undefined) ?? this.configBaseUrl ?? 'default'
    return syntheticDefaultLocation(baseUrl)
  }

  // ── Fulfillments (Shipments) ──────────────────────────────────────────────

  async listFulfillments(credentials: Credentials, params: QueryParams): Promise<Fulfillment[]> {
    // ST11 is seek-paginated: `limit` (max 100) on the first request, then
    // the response's `next_page_token` as `page_token`, with which "all other
    // parameters are ignored". Its rows are under `data`, not `shipments`.
    const { asked, size } = this.pageSize(params)
    const filters = this.listFilters(params)
    const client = this.clientFor(credentials)
    const baseUrl =
      (credentials.extra?.['baseUrl'] as string | undefined) ?? this.configBaseUrl ?? ''
    const key = cursorPagerKey(connectionScope(baseUrl, credentials), 'shipments', {
      ...filters,
      limit: size,
    })
    const res = await pageByCursor<RawMiraklShipment>(key, params.page, async (token) => {
      const raw = await client.get<Record<string, unknown>>(
        PATHS.shipments,
        token !== undefined ? { page_token: token } : { limit: size, ...filters },
      )
      const next = raw['next_page_token']
      return {
        items: (raw['data'] ?? []) as RawMiraklShipment[],
        next: typeof next === 'string' && next !== '' ? next : undefined,
      }
    })
    reportUpstreamPage(params, {
      hasMore: res.hasMore,
      ...(size < asked ? { pageSize: size } : {}),
    })
    return res.items.map(transformShipment)
  }

  async getFulfillment(credentials: Credentials, id: string): Promise<Fulfillment> {
    // Mirakl ST11 supports filtering by shipment_ids query param.
    const res = await this.clientFor(credentials).listWithToken<RawMiraklShipment>(
      PATHS.shipments,
      'shipments',
      { shipment_ids: [id], limit: 1 },
    )
    const raw = res.items[0]
    if (!raw) {
      throw new Error(`Mirakl: shipment '${id}' not found`)
    }
    return transformShipment(raw)
  }

  // ── Discounts (Promotions) ────────────────────────────────────────────────

  async listDiscounts(credentials: Credentials, params: QueryParams): Promise<Discount[]> {
    const rows = await this.offsetPage<RawMiraklPromotion>(
      credentials,
      PATHS.promotions,
      'promotions',
      params,
      this.listFilters(params),
    )
    return rows.map(transformPromotion)
  }

  async getDiscount(credentials: Credentials, id: string): Promise<Discount> {
    // Mirakl PR01 supports filtering by promotion_ids query param.
    const res = await this.clientFor(credentials).listWithToken<RawMiraklPromotion>(
      PATHS.promotions,
      'promotions',
      { promotion_ids: [id], limit: 1 },
    )
    const raw = res.items[0]
    if (!raw) {
      throw new Error(`Mirakl: promotion '${id}' not found`)
    }
    return transformPromotion(raw)
  }

  // ── Inventory (derived from Offers) ───────────────────────────────────────

  async listInventoryLevels(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<InventoryLevel[]> {
    const rows = await this.offsetPage<RawMiraklOffer>(
      credentials,
      PATHS.offers,
      'offers',
      params,
      this.listFilters(params),
    )
    return rows.map((o) => transformOfferToInventoryLevel(o))
  }
}
