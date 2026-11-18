// ── Resource coverage ──────────────────────────────────────────────────────
// Unavailable: label    — KitchenHub is a restaurant order-aggregation platform;
//                         its API has no shipping-label concept or endpoint.
// Unavailable: manifest — KitchenHub is a restaurant order-aggregation platform;
//                         its API has no carrier manifest concept or endpoint.
// ──────────────────────────────────────────────────────────────────────────────
//
// Read methods follow the first-party OpenAPI reference at
// https://kitchenhub.readme.io/reference/ (server https://api.kitchenhub.app):
//   listCarriers / getCarrier     GET /v2/providers/          bare array, no params
//   listWarehouses                GET /v2/stores/             { stores }, no paging params
//   getWarehouse                  GET /v2/stores/{store_id}/
//   listShipments                 GET /v2/deliveries/         { deliveries }, no paging params
//   getShipment                   GET /v2/deliveries/{delivery_id}/
//   listOrders                    GET /v2/orders/?page=N      bare array, page only
//   getOrder                      GET /v2/orders/{order_id}/
//   getTrackingEvents             refused: no tracking-event history endpoint

import {
  connectionScope,
  customForm,
  cursorPagerKey,
  pageByRows,
  pageLocally,
} from '@opensteward/shared'
import type {
  LogisticsAdapter,
  Credentials,
  QueryParams,
  RateRequestParams,
} from '../../adapter/interface'
import type { Order } from '../../schema/order'
import type { Shipment } from '../../schema/shipment'
import type { Carrier } from '../../schema/carrier'
import type { Warehouse } from '../../schema/warehouse'
import type { TrackingEvent } from '../../schema/trackingevent'
import type { Rate } from '../../schema/rate'
import type { WebhookEvent } from '../../schema/webhook'

import {
  KITCHENHUB_CREDENTIAL_FIELDS,
  exchangeClientCredentials,
  refreshCredentials as doRefresh,
} from './auth'
import { KitchenHubClient } from './client'
import { parseWebhookEvents as parseKitchenHubWebhookEvents } from './webhook'

import { transformOrder, type KitchenHubOrder } from './transform/order'
import { transformDelivery, type KitchenHubDelivery } from './transform/shipment'
import { transformQuote, type KitchenHubQuote } from './transform/rate'
import { transformProvider, type KitchenHubProvider } from './transform/carrier'
import { transformStore, type KitchenHubStore } from './transform/warehouse'

// ─── Response wrappers ───────────────────────────────────────────────────────

/** DeliveriesResponseSerializer: `deliveries` is required. */
interface KitchenHubDeliveriesResponse {
  deliveries: KitchenHubDelivery[]
}

/** StoreListResponseSerializer: `stores` is required. */
interface KitchenHubStoresResponse {
  stores: KitchenHubStore[]
}

/** Used only by getRates (a write-shaped lookup this rebuild leaves alone). */
interface KitchenHubPagedResponse<T> {
  data?: T[] | null
  results?: T[] | null
  items?: T[] | null
}

function extractItems<T>(res: KitchenHubPagedResponse<T> | T[]): T[] {
  if (Array.isArray(res)) return res
  return res.data ?? res.results ?? res.items ?? []
}

/**
 * The documented array, or a 502. Reading any other shape as [] would tell a
 * locally paged sync the collection is complete and empty, and the sync would
 * then drop its cached rows.
 */
function requireArray<T>(value: T[] | null | undefined, what: string): T[] {
  if (Array.isArray(value)) return value
  throw Object.assign(new Error(`KitchenHub ${what} did not return the documented array`), {
    statusCode: 502,
    code: 'UPSTREAM_ERROR',
  })
}

function notFound(message: string): Error {
  return Object.assign(new Error(message), { statusCode: 404, code: 'NOT_FOUND' })
}

// ─── Adapter config ──────────────────────────────────────────────────────────

interface KitchenHubAdapterConfig {
  [key: string]: unknown
}

const CREDENTIAL_FORM = customForm({
  fields: KITCHENHUB_CREDENTIAL_FIELDS,
  exchange: exchangeClientCredentials,
})

/** Pager scope prefix: one KitchenHub API, one connection per token pair. */
const ACCOUNT = 'kitchenhub'

// ─── Adapter ─────────────────────────────────────────────────────────────────

export class KitchenHubAdapter implements LogisticsAdapter {
  readonly platform = 'kitchenhub'
  readonly version = '1'

  /** Connect Link: client id + secret, exchanged at POST /v2/auth/token/. */
  credentialFields = CREDENTIAL_FORM.credentialFields
  exchangeCredentials = CREDENTIAL_FORM.exchangeCredentials

  constructor(_config: KitchenHubAdapterConfig = {}) {}

  // ── Auth ───────────────────────────────────────────────────────────────────

  getAuthUrl(_state: string): string {
    throw new Error(
      'KitchenHub has no OAuth authorize page: tokens come from POST /v2/auth/token/ with a client id and secret; use credentialFields() instead.',
    )
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    throw new Error(
      'KitchenHub has no OAuth authorize page: tokens come from POST /v2/auth/token/ with a client id and secret; use exchangeCredentials() instead.',
    )
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return doRefresh(credentials)
  }

  // ── Webhooks ───────────────────────────────────────────────────────────────

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parseKitchenHubWebhookEvents(payload)
  }

  // ── Orders ─────────────────────────────────────────────────────────────────

  /**
   * GET /v2/orders/ ("Get orders"). Its only paging parameter is `page`:
   * "Page - required for pagination (1 by default)". No page size is
   * documented or accepted, and the response is a bare array with no total,
   * so the upstream pages are walked by number and the caller's rows are cut
   * out of them. An empty page is the only end the response can express.
   */
  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const client = new KitchenHubClient(credentials)
    const key = cursorPagerKey(connectionScope(ACCOUNT, credentials), 'orders', {})
    const { items } = await pageByRows<Order, number>(key, params, async (cursor) => {
      const page = cursor ?? 1
      const res = await client.get<KitchenHubOrder[]>('orders/', { page })
      const rows = requireArray(res, 'GET /v2/orders/')
      return { items: rows.map(transformOrder), next: rows.length > 0 ? page + 1 : undefined }
    })
    return items
  }

  /** GET /v2/orders/{order_id}/ ("Get order by kh id"). */
  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const client = new KitchenHubClient(credentials)
    const raw = await client.get<KitchenHubOrder>(`orders/${encodeURIComponent(id)}/`)
    return transformOrder(raw)
  }

  async createOrder(credentials: Credentials, data: Partial<Order>): Promise<Order> {
    const client = new KitchenHubClient(credentials)
    const raw = await client.post<KitchenHubOrder>('orders', data)
    return transformOrder(raw)
  }

  async updateOrder(credentials: Credentials, id: string, data: Partial<Order>): Promise<Order> {
    const client = new KitchenHubClient(credentials)
    const raw = await client.patch<KitchenHubOrder>(`orders/${id}`, data)
    return transformOrder(raw)
  }

  async cancelOrder(credentials: Credentials, id: string): Promise<void> {
    const client = new KitchenHubClient(credentials)
    await client.put<unknown>(`orders/${id}/status`, { status: 'cancelled' })
  }

  // ── Shipments (Deliveries) ─────────────────────────────────────────────────

  /**
   * GET /v2/deliveries/ ("Retrieve list of deliveries"). Its parameters are
   * filters only (store_id, partner_store_id, date_from, date_to, status,
   * order_id): no page, size or cursor, so the one response is the whole
   * list and is sliced locally.
   */
  async listShipments(credentials: Credentials, params: QueryParams): Promise<Shipment[]> {
    const client = new KitchenHubClient(credentials)
    const res = await client.get<KitchenHubDeliveriesResponse>('deliveries/')
    return pageLocally(
      requireArray(res?.deliveries, 'GET /v2/deliveries/ .deliveries').map(transformDelivery),
      params,
    )
  }

  /** GET /v2/deliveries/{delivery_id}/ ("Get delivery by Id"). */
  async getShipment(credentials: Credentials, id: string): Promise<Shipment> {
    const client = new KitchenHubClient(credentials)
    const raw = await client.get<KitchenHubDelivery>(`deliveries/${encodeURIComponent(id)}/`)
    return transformDelivery(raw)
  }

  async createShipment(credentials: Credentials, data: Partial<Shipment>): Promise<Shipment> {
    const client = new KitchenHubClient(credentials)
    const raw = await client.post<KitchenHubDelivery>('deliveries', {
      pickup_address: data.originAddress,
      dropoff_address: data.destinationAddress,
      provider: data.carrierId,
    })
    return transformDelivery(raw)
  }

  async cancelShipment(credentials: Credentials, id: string): Promise<void> {
    const client = new KitchenHubClient(credentials)
    await client.put<unknown>(`deliveries/${id}/status`, { status: 'cancelled' })
  }

  // ── Tracking Events ────────────────────────────────────────────────────────

  /**
   * Refused before any request. KitchenHub documents no tracking-event
   * history: a delivery carries only its current `status` and a
   * `tracking_url`, and GET /v2/deliveries/ filters by store_id,
   * partner_store_id, date_from, date_to, status and order_id, with no
   * tracking-number parameter.
   */
  async getTrackingEvents(
    _credentials: Credentials,
    _trackingNumber: string,
  ): Promise<TrackingEvent[]> {
    throw Object.assign(
      new Error(
        'KitchenHub cannot list tracking events: a delivery carries only its current status ("Current delivery status"), and no endpoint returns a status history or looks a delivery up by tracking number',
      ),
      { statusCode: 501, code: 'NOT_SUPPORTED' },
    )
  }

  // ── Rates (Quotes) ─────────────────────────────────────────────────────────

  async getRates(credentials: Credentials, params: RateRequestParams): Promise<Rate[]> {
    const client = new KitchenHubClient(credentials)
    const res = await client.post<KitchenHubPagedResponse<KitchenHubQuote> | KitchenHubQuote[]>(
      'quotes',
      {
        pickup_address: params.originAddress,
        dropoff_address: params.destinationAddress,
      },
    )
    return extractItems(res).map(transformQuote)
  }

  // ── Carriers (Providers) ───────────────────────────────────────────────────

  /**
   * GET /v2/providers/ ("Get information about all integration"):
   * `"parameters": []`, and the response is ListProviderGeneralInfoSerializer,
   * `"type": "array"`. The whole catalogue in one response, sliced locally.
   */
  async listCarriers(credentials: Credentials, params: QueryParams): Promise<Carrier[]> {
    const client = new KitchenHubClient(credentials)
    const rows = requireArray(
      await client.get<KitchenHubProvider[]>('providers/'),
      'GET /v2/providers/',
    )
    return pageLocally(rows.map(transformProvider), params)
  }

  /** No per-provider endpoint is documented: the provider whose provider_id matches, from the catalogue. */
  async getCarrier(credentials: Credentials, id: string): Promise<Carrier> {
    const client = new KitchenHubClient(credentials)
    const rows = requireArray(
      await client.get<KitchenHubProvider[]>('providers/'),
      'GET /v2/providers/',
    )
    const found = rows.find((p) => p.provider_id === id)
    if (!found) throw notFound(`KitchenHub provider not found: ${id}`)
    return transformProvider(found)
  }

  // ── Warehouses (Stores) ────────────────────────────────────────────────────

  /**
   * GET /v2/stores/ ("Get list of stores"). Its one parameter is the
   * partner_store_id filter: no page, size or cursor, so the whole list is
   * sliced locally.
   */
  async listWarehouses(credentials: Credentials, params: QueryParams): Promise<Warehouse[]> {
    const client = new KitchenHubClient(credentials)
    const res = await client.get<KitchenHubStoresResponse>('stores/')
    return pageLocally(
      requireArray(res?.stores, 'GET /v2/stores/ .stores').map(transformStore),
      params,
    )
  }

  /** GET /v2/stores/{store_id}/ ("Get store by id"). */
  async getWarehouse(credentials: Credentials, id: string): Promise<Warehouse> {
    const client = new KitchenHubClient(credentials)
    const raw = await client.get<KitchenHubStore>(`stores/${encodeURIComponent(id)}/`)
    return transformStore(raw)
  }
}
