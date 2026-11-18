/**
 * Zalando zDirect adapter for the ecommerce vertical.
 *
 * Maps the Zalando zDirect REST API to the canonical ecommerce resources.
 * Zalando uses OAuth2 client-credentials (server-to-server only — no end-user
 * redirect flow). Access tokens expire in 2 hours; `refreshCredentials`
 * re-issues a token transparently.
 *
 * Resources:
 *  ✓ Orders            — /merchants/{id}/orders (read + cancel)
 *  ✓ Fulfillments      — /merchants/{id}/orders/{order-id}/shipments (read;
 *                         createFulfillment/updateFulfillment still call an
 *                         undocumented /dispatch path, left for follow-up)
 *  ✓ Locations         — /merchants/{id}/logistic-centers (read)
 *  ✗ Products, variants, inventory reads — refused with 501 NOT_SUPPORTED
 *    before any request (see {@link notSupported}). The Products API
 *    (https://developers.merchants.zalando.com/docs/openapi/specs/products.yaml)
 *    has no product or article listing, and the Stocks API
 *    (https://developers.merchants.zalando.com/docs/offers-stocks.html) "currently
 *    consists of a single endpoint, which is used to update stock levels".
 *
 * ── Resource coverage ──────────────────────────────────────────────
 * Unavailable: collection   — Zalando has no collections/categories concept in the zDirect merchant API
 * Unavailable: customer     — Zalando manages customers internally; no customer endpoint exists in zDirect
 * Unavailable: discount     — No discount/promotion API for zDirect merchants; pricing via Prices API only
 * Unavailable: refund       — Returns handled by Zalando's ZRS service; no refund endpoint exposed to partners
 * Unavailable: transaction  — Payments are fully internal to Zalando; no transaction endpoint exists in zDirect
 *
 * Docs: https://developers.merchants.zalando.com/docs/
 */

import type { CredentialField, Credentials, QueryParams } from '@opensteward/shared'
import { pageLocally, reportUpstreamPage } from '@opensteward/shared'
import type { EcommerceAdapter } from '../../adapter/interface'
import type { Product, ProductVariant } from '../../schema/product'
import type { InventoryLevel } from '../../schema/inventory'
import type { Location } from '../../schema/location'
import type { Order } from '../../schema/order'
import type { Fulfillment } from '../../schema/fulfillment'
import type { WebhookEvent } from '../../schema/webhook'

import { fetchAccessToken } from './auth'
import { ZalandoClient } from './client'
import { DEFAULT_PAGE_SIZE, ORDERS_MAX_PAGE_SIZE } from './constants'
import { verifyZalandoWebhook, parseZalandoWebhookEvents } from './webhook'

import { transformInventoryLevel, type RawZalandoStock } from './transform/inventory'
import { transformOrder, type RawZalandoOrder } from './transform/order'
import {
  transformFulfillment,
  untransformFulfillment,
  type RawZalandoShipment,
} from './transform/fulfillment'
import { transformLocation, type RawZalandoLogisticCenter } from './transform/location'

/**
 * The only documented catalogue read is the Product Status Report GraphQL
 * query psr.product_models
 * (https://developers.merchants.zalando.com/docs/psr-api-overview.html). The
 * fields its examples document are ids, EANs, statuses and per-sales-channel
 * offers; none is a product name, and price exists only per offer ("price":
 * null in the documented example). The full field list is the interactive
 * documentation, which opens only "After you sent a valid and authenticated
 * query to the PSR API at least once"
 * (https://developers.merchants.zalando.com/docs/psr-api-tutorial.html).
 */
const PRODUCTS_REASON =
  'the Products API (https://developers.merchants.zalando.com/docs/openapi/specs/products.yaml) ' +
  'declares only PUT /merchants/{merchant_id}/products/identifiers/{ean} and GET /products/identifiers/{ean}; ' +
  'the PSR GraphQL query psr.product_models documents no product name and prices only per sales-channel offer ' +
  '(https://developers.merchants.zalando.com/docs/psr-api-overview.html)'

/**
 * products.yaml does document an EAN lookup, GET /products/identifiers/{ean},
 * but its LookUp response schema is only `items[].ean` (example:
 * {"items": [{ "ean": "9780679762881" }]}), with no price, title or product
 * id, so it cannot fill a ProductVariant.
 */
const VARIANT_REASON =
  'the only EAN read, GET /products/identifiers/{ean} ' +
  '(https://developers.merchants.zalando.com/docs/openapi/specs/products.yaml), returns a LookUp ' +
  'holding only items[].ean, with no price, title or product id'

/** https://developers.merchants.zalando.com/docs/offers-stocks.html */
const STOCKS_REASON =
  '"The API currently consists of a single endpoint, which is used to update stock levels: ' +
  'POST /merchants/{merchant_id}/stocks" (https://developers.merchants.zalando.com/docs/offers-stocks.html)'

/**
 * Refuses a read Zalando does not document, before anything is sent. The
 * router turns the 501 into NOT_SUPPORTED for the caller.
 */
function notSupported(what: string, reason: string): never {
  throw Object.assign(new Error(`Zalando cannot ${what}: ${reason}`), {
    statusCode: 501,
    code: 'NOT_SUPPORTED',
  })
}

export interface ZalandoAdapterConfig {
  /** OAuth2 client ID from the zDirect Portal. */
  clientId: string
  /** OAuth2 client secret from the zDirect Portal. */
  clientSecret: string
  /**
   * Merchant BPID (Business Partner ID) issued by Zalando.
   * Used as the path segment in `/merchants/{merchantId}/...`.
   */
  merchantId: string
  /** When true, target the sandbox environment. Defaults to false. */
  sandbox?: boolean
}

/** JSON:API envelope of GET /merchants/{merchantId}/orders (OrdersTopLevel). */
interface ZalandoOrdersTopLevel {
  links?: { next?: string | null }
  data?: Array<{ type?: string; id?: string; attributes?: Record<string, unknown> }>
}

export class ZalandoAdapter implements EcommerceAdapter {
  readonly platform = 'zalando'
  readonly version = '0.1.0'

  private clientId: string
  private clientSecret: string
  private merchantId: string
  private sandbox: boolean

  // The registry calls the factory with no config when the operator enabled
  // the adapter before setting its client, so every field is optional here;
  // exchangeCredentials refuses the connect until they are set.
  constructor(config: Partial<ZalandoAdapterConfig> = {}) {
    this.clientId = config.clientId ?? ''
    this.clientSecret = config.clientSecret ?? ''
    this.merchantId = config.merchantId ?? ''
    this.sandbox = config.sandbox ?? false
  }

  // ── Auth ──────────────────────────────────────────────────────────────────

  /**
   * Zalando uses client-credentials only — there is no end-user redirect URL.
   * Calling this method throws; credentials must be obtained via
   * `refreshCredentials` or the bootstrap flow.
   */
  getAuthUrl(_state: string): string {
    throw new Error(
      'Zalando zDirect uses OAuth2 client-credentials (no end-user redirect). ' +
        'Use refreshCredentials() to obtain an access token.',
    )
  }

  /**
   * Zalando does not use the authorization-code grant — no code exchange.
   */
  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    throw new Error(
      'Zalando zDirect uses OAuth2 client-credentials (no authorization code). ' +
        'Use refreshCredentials() to obtain an access token.',
    )
  }

  /**
   * `auth_type` is `oauth2_cc` at operator level: the zDirect client ID,
   * client secret and merchant BPID are adapter settings, set once per
   * deployment by the operator (`PUT /admin/platforms/ecommerce/zalando/config`
   * with `{ clientId, clientSecret, merchantId, sandbox? }`, which the
   * registry passes to this constructor). The customer's Connect form
   * therefore has no fields.
   */
  credentialFields(): CredentialField[] {
    return []
  }

  /**
   * Completes a Connect Link by minting a client-credentials token from the
   * operator-configured client (the same call `refreshCredentials` makes).
   * Submitted fields are ignored — there are none to submit.
   */
  async exchangeCredentials(_fields: Record<string, string>): Promise<Credentials> {
    if (!this.clientId || !this.clientSecret || !this.merchantId) {
      throw new Error(
        'Zalando is not configured: the operator must set clientId, clientSecret and merchantId ' +
          'in the adapter settings (PUT /admin/platforms/ecommerce/zalando/config).',
      )
    }
    return fetchAccessToken(this.clientId, this.clientSecret, this.sandbox)
  }

  /**
   * Fetch / refresh the client-credentials access token.
   *
   * Zalando tokens expire in 7200 s (2 h). The shared `isTokenExpired` helper
   * checks `credentials.expiresAt`; the refresh-keep-alive worker calls this
   * method proactively before expiry.
   */
  async refreshCredentials(_credentials: Credentials): Promise<Credentials> {
    return fetchAccessToken(this.clientId, this.clientSecret, this.sandbox)
  }

  // ── Webhooks ──────────────────────────────────────────────────────────────

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return verifyZalandoWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parseZalandoWebhookEvents(payload)
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private client(credentials: Credentials): ZalandoClient {
    return new ZalandoClient(credentials, this.sandbox)
  }

  private merchantPath(resource: string): string {
    return `/merchants/${this.merchantId}/${resource}`
  }

  private listParams(params: QueryParams): Record<string, unknown> {
    const out: Record<string, unknown> = {
      limit: params.limit ?? DEFAULT_PAGE_SIZE,
    }
    const cursor = params['cursor'] ?? params['scroll_token']
    if (cursor) {
      out['scroll_token'] = cursor
    } else {
      if (params.updatedAfter) {
        out['updated_at_from'] = params.updatedAfter.toISOString()
      }
    }
    return out
  }

  // ── Products ──────────────────────────────────────────────────────────────

  async listProducts(_credentials: Credentials, _params: QueryParams): Promise<Product[]> {
    return notSupported('list products', PRODUCTS_REASON)
  }

  async getProduct(_credentials: Credentials, _id: string): Promise<Product> {
    return notSupported('read a product', PRODUCTS_REASON)
  }

  async listVariants(_credentials: Credentials, _params: QueryParams): Promise<ProductVariant[]> {
    return notSupported('list variants', PRODUCTS_REASON)
  }

  async getVariant(_credentials: Credentials, _id: string): Promise<ProductVariant> {
    return notSupported('read a variant', VARIANT_REASON)
  }

  // ── Inventory (Stocks API) ────────────────────────────────────────────────

  async listInventoryLevels(
    _credentials: Credentials,
    _params: QueryParams,
  ): Promise<InventoryLevel[]> {
    return notSupported('list inventory levels', STOCKS_REASON)
  }

  async getInventoryLevel(_credentials: Credentials, _id: string): Promise<InventoryLevel> {
    return notSupported('read an inventory level', STOCKS_REASON)
  }

  /**
   * Set available stock for a variant (EAN) to an absolute value.
   *
   * Zalando's Stocks API accepts a PUT with the EAN and new stock quantity.
   */
  async setInventoryLevel(
    credentials: Credentials,
    data: { variantId: string; locationId: string; available: number },
  ): Promise<InventoryLevel> {
    const body = { ean: data.variantId, available: data.available }
    const raw = await this.client(credentials).put<RawZalandoStock>(
      this.merchantPath(`stocks/${data.variantId}`),
      body,
    )
    return transformInventoryLevel(raw)
  }

  /**
   * Apply a delta to available stock. Fetches current stock then sets new value.
   */
  async adjustInventoryLevel(
    credentials: Credentials,
    data: { variantId: string; locationId: string; delta: number },
  ): Promise<InventoryLevel> {
    const current = await this.client(credentials).get<RawZalandoStock>(
      this.merchantPath(`stocks/${data.variantId}`),
    )
    const newAvailable = Math.max(0, (current.available ?? 0) + data.delta)
    return this.setInventoryLevel(credentials, {
      variantId: data.variantId,
      locationId: data.locationId,
      available: newAvailable,
    })
  }

  // ── Locations (Logistic Centers) ──────────────────────────────────────────

  /**
   * GET /merchants/{merchantId}/logistic-centers documents no query parameters
   * ("get the list of all the Logistic Centers") and returns the whole
   * collection as {items: [...]}, so the caller's page is cut locally.
   * https://developers.merchants.zalando.com/docs/logistic-centers.html
   */
  async listLocations(credentials: Credentials, params: QueryParams): Promise<Location[]> {
    const res = await this.client(credentials).get<{ items?: RawZalandoLogisticCenter[] }>(
      this.merchantPath('logistic-centers'),
    )
    return pageLocally((res.items ?? []).map(transformLocation), params)
  }

  async getLocation(credentials: Credentials, id: string): Promise<Location> {
    const raw = await this.client(credentials).get<RawZalandoLogisticCenter>(
      this.merchantPath(`logistic-centers/${id}`),
    )
    return transformLocation(raw)
  }

  // ── Orders ────────────────────────────────────────────────────────────────

  /**
   * GET /merchants/{merchantId}/orders pages by number: page[number] "uses
   * zero-based counting" and page[size] is 1..1000 (default 50). The JSON:API
   * envelope's links.next is absent on the last page; there is no total.
   * https://developers.merchants.zalando.com/docs/orders-api-get-orders.html
   */
  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const limit = params.limit ?? DEFAULT_PAGE_SIZE
    const size = Math.min(limit, ORDERS_MAX_PAGE_SIZE)
    const query: Record<string, unknown> = {
      'page[number]': (params.page ?? 1) - 1,
      'page[size]': size,
    }
    if (params.updatedAfter) query['updated_at_from'] = params.updatedAfter.toISOString()
    const res = await this.client(credentials).get<ZalandoOrdersTopLevel>(
      this.merchantPath('orders'),
      query,
    )
    reportUpstreamPage(params, {
      hasMore: Boolean(res.links?.next),
      ...(size < limit ? { pageSize: size } : {}),
    })
    // JSON:API resources carry their fields under `attributes`.
    return (res.data ?? []).map((r) =>
      transformOrder({ ...(r.attributes ?? {}) } as RawZalandoOrder),
    )
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const raw = await this.client(credentials).get<RawZalandoOrder>(
      this.merchantPath(`orders/${id}`),
    )
    return transformOrder(raw)
  }

  /**
   * Cancel an order (or specific order units) by sending a CANCEL status
   * update via the Orders API.
   */
  async cancelOrder(
    credentials: Credentials,
    id: string,
    data?: { reason?: string },
  ): Promise<Order> {
    await this.client(credentials).patch(this.merchantPath(`orders/${id}`), {
      order_status: 'CANCELED',
      cancel_reason: data?.reason,
    })
    // Re-fetch the updated order to return canonical shape
    return this.getOrder(credentials, id)
  }

  // ── Fulfillments ──────────────────────────────────────────────────────────

  /**
   * List fulfillment records (dispatch confirmations) for an order.
   * Requires `order_id` / `orderId` in params.
   */
  async listFulfillments(credentials: Credentials, params: QueryParams): Promise<Fulfillment[]> {
    const orderId = params['order_id'] ?? params['orderId']
    if (!orderId) {
      throw new Error('listFulfillments requires `order_id` in query params')
    }
    const res = await this.client(credentials).listWithScroll<RawZalandoShipment>(
      this.merchantPath(`orders/${String(orderId)}/shipments`),
      this.listParams(params),
    )
    return res.items.map(transformFulfillment)
  }

  async getFulfillment(credentials: Credentials, id: string): Promise<Fulfillment> {
    // id format: `orderId:shipmentId` or just `orderId`
    const [orderId, shipmentId] = id.includes(':') ? id.split(':') : [id, undefined]
    if (!orderId) throw new Error(`Invalid fulfillment id: ${id}`)

    const path = shipmentId
      ? this.merchantPath(`orders/${orderId}/shipments/${shipmentId}`)
      : this.merchantPath(`orders/${orderId}/shipments`)

    const raw = await this.client(credentials).get<RawZalandoShipment>(path)
    return transformFulfillment(raw)
  }

  /**
   * Create a dispatch notification (confirm shipment of order units).
   * Calls `PATCH /merchants/{id}/orders/{orderNumber}/dispatch`.
   */
  async createFulfillment(
    credentials: Credentials,
    data: Partial<Fulfillment> & { orderUnitIds?: string[] },
  ): Promise<Fulfillment> {
    if (!data.orderId) throw new Error('createFulfillment requires orderId')
    const body = untransformFulfillment(data)
    const raw = await this.client(credentials).post<RawZalandoShipment>(
      this.merchantPath(`orders/${data.orderId}/dispatch`),
      body,
    )
    return transformFulfillment(raw)
  }

  /**
   * Update fulfillment tracking info.
   */
  async updateFulfillment(
    credentials: Credentials,
    id: string,
    data: Partial<Fulfillment>,
  ): Promise<Fulfillment> {
    const [orderId] = id.split(':')
    if (!orderId) throw new Error(`Invalid fulfillment id: ${id}`)

    const body = untransformFulfillment(data)
    const raw = await this.client(credentials).patch<RawZalandoShipment>(
      this.merchantPath(`orders/${orderId}/dispatch`),
      body,
    )
    return transformFulfillment(raw)
  }
}
