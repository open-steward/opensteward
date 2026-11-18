import { connectionScope, customForm, pageByRows, reportUpstreamPage } from '@opensteward/shared'
import type {
  LogisticsAdapter,
  Credentials,
  QueryParams,
  RateRequestParams,
} from '../../adapter/interface'
import type { Shipment } from '../../schema/shipment'
import type { Order } from '../../schema/order'
import type { TrackingEvent } from '../../schema/trackingevent'
import type { Rate } from '../../schema/rate'
import type { Label } from '../../schema/label'
import type { Carrier } from '../../schema/carrier'
import type { Manifest } from '../../schema/manifest'

import { buildAuthUrl, exchangeApiKey, refreshCredentials as doRefresh } from './auth'
import { StarshipitClient } from './client'
import {
  DEFAULT_PAGE_SIZE,
  MAX_ORDERS_PAGE_SIZE,
  MAX_PAGE_SIZE,
  ORDER_STATUSES,
  STARSHIPIT_SETTINGS_URL,
} from './constants'

import { transformShipment, type StarshipitShipment } from './transform/shipment'
import {
  transformOrder,
  transformOrderRow,
  type StarshipitOrder,
  type StarshipitOrderRow,
} from './transform/order'
import { transformTracking, type StarshipitTracking } from './transform/tracking'
import { transformRate, type StarshipitRate } from './transform/rate'
import { transformLabel, type StarshipitLabel } from './transform/label'
import { transformManifests, type StarshipitManifestResponse } from './transform/manifest'

// ── Resource coverage ──────────────────────────────────────────────────────────
// Unavailable: warehouse — Starshipit has no warehouse/location resource in its
//   REST API. Multi-origin is handled by embedding a sender address in each
//   rates/order request or by using separate API tokens per account; there is
//   no dedicated /warehouses (or equivalent) endpoint.

// ── Credential form: Starshipit needs API key + subscription key ──────────────

const CREDENTIAL_FORM = customForm({
  fields: [
    {
      name: 'apiKey',
      label: 'API key',
      type: 'password' as const,
      placeholder: 'Enter your Starshipit API key',
      helpText: `Find your API key at ${STARSHIPIT_SETTINGS_URL}`,
      required: true,
    },
    {
      name: 'subscriptionKey',
      label: 'Subscription key',
      type: 'password' as const,
      placeholder: 'Enter your Ocp-Apim-Subscription-Key',
      helpText: 'Find your subscription key at developers.starshipit.com',
      required: true,
    },
  ],
  async exchange(fields: Record<string, string>): Promise<Credentials> {
    const apiKey = (fields['apiKey'] ?? '').trim()
    const subscriptionKey = (fields['subscriptionKey'] ?? '').trim()
    if (!apiKey) throw new Error('API key is required.')
    if (!subscriptionKey) throw new Error('Subscription key is required.')
    // accessToken = StarShipIT-Api-Key, refreshToken = Ocp-Apim-Subscription-Key
    return { accessToken: apiKey, refreshToken: subscriptionKey }
  },
})

// ── Starshipit API response envelopes ─────────────────────────────────────────

/**
 * GET /api/orders without order_id / order_number (documented example
 * "Get Printed Orders w/ Shipping Price"): { page_number, page_size,
 * total_pages, total_records, data: { orders: [...] } }.
 */
interface OrdersListResponse {
  page_number?: number
  page_size?: number
  total_pages?: number
  total_records?: number
  data?: { orders?: StarshipitOrderRow[] }
  [key: string]: unknown
}

/** GET /api/orders?order_id= (documented "Get Order Response"): { order, success }. */
interface OrderResponse {
  order?: StarshipitOrder
  success?: boolean
  [key: string]: unknown
}

interface ShipmentsListResponse {
  orders?: StarshipitShipment[]
  total_pages?: number
  total_records?: number
  [key: string]: unknown
}

interface TrackingResponse {
  tracking?: StarshipitTracking
  order?: StarshipitTracking
  [key: string]: unknown
}

interface RatesResponse {
  rates?: StarshipitRate[]
  [key: string]: unknown
}

interface LabelResponse {
  order?: StarshipitLabel
  labels?: StarshipitLabel[]
  [key: string]: unknown
}

interface CreateOrderResponse {
  order?: StarshipitOrder
  output?: { order?: StarshipitOrder }
  [key: string]: unknown
}

function notSupported(message: string): Error {
  return Object.assign(new Error(message), { statusCode: 501, code: 'NOT_SUPPORTED' })
}

// ── Adapter ───────────────────────────────────────────────────────────────────

interface StarshipitAdapterConfig {
  /** Override the API base URL (e.g. for testing). */
  baseUrl?: string
}

export class StarshipitAdapter implements LogisticsAdapter {
  // Connect Link support — dual credential form
  credentialFields = CREDENTIAL_FORM.credentialFields
  exchangeCredentials = CREDENTIAL_FORM.exchangeCredentials

  readonly platform = 'starshipit'
  readonly version = '1'

  constructor(_config: StarshipitAdapterConfig = {}) {}

  // ── Auth ────────────────────────────────────────────────────────────────────

  getAuthUrl(state: string): string {
    return buildAuthUrl(state)
  }

  async exchangeCode(code: string, _redirectUri: string): Promise<Credentials> {
    return exchangeApiKey(code)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return doRefresh(credentials)
  }

  // ── Shipments ──────────────────────────────────────────────────────────────

  /**
   * GET orders/shipments pages by number: `limit` "Amount of results
   * (default: 50) (maximum: 250)", `page` "Page to show (default: 1)", and
   * `total_pages` "Total number of pages available"
   * (https://api-docs.starshipit.com/). One upstream page is one caller page,
   * at the clamped size, which is reported when it is below the caller's limit.
   */
  async listShipments(credentials: Credentials, params: QueryParams): Promise<Shipment[]> {
    const client = new StarshipitClient(credentials)
    const limit = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
    const page = params.page ?? 1
    const res = await client.get<ShipmentsListResponse>('orders/shipments', {
      limit,
      page,
      ...(params.updatedAfter
        ? { updated_after: (params.updatedAfter as Date).toISOString() }
        : {}),
    })
    reportUpstreamPage(params, {
      ...(typeof res.total_pages === 'number' ? { hasMore: page < res.total_pages } : {}),
      ...(params.limit !== undefined && limit < params.limit ? { pageSize: limit } : {}),
    })
    return (res.orders ?? []).map(transformShipment)
  }

  async getShipment(credentials: Credentials, id: string): Promise<Shipment> {
    const client = new StarshipitClient(credentials)
    const raw = await client.get<{ order?: StarshipitShipment }>(`orders/${id}`)
    const order = raw.order ?? (raw as unknown as StarshipitShipment)
    return transformShipment(order)
  }

  async createShipment(credentials: Credentials, data: Partial<Shipment>): Promise<Shipment> {
    const client = new StarshipitClient(credentials)
    const body = {
      order: {
        reference: data.reference,
        carrier_code: data.carrierId,
        service_code: data.serviceCode,
        destination: data.destinationAddress
          ? {
              name: data.destinationAddress.name,
              company: data.destinationAddress.company,
              street: data.destinationAddress.street1,
              suburb: data.destinationAddress.city,
              state: data.destinationAddress.state,
              post_code: data.destinationAddress.postalCode,
              country_code: data.destinationAddress.country,
              phone: data.destinationAddress.phone,
              email: data.destinationAddress.email,
            }
          : undefined,
        sender: data.originAddress
          ? {
              name: data.originAddress.name,
              company: data.originAddress.company,
              street: data.originAddress.street1,
              suburb: data.originAddress.city,
              state: data.originAddress.state,
              post_code: data.originAddress.postalCode,
              country_code: data.originAddress.country,
              phone: data.originAddress.phone,
              email: data.originAddress.email,
            }
          : undefined,
        packages: data.totalWeight
          ? [{ weight: data.totalWeight.unit === 'kg' ? data.totalWeight.value : undefined }]
          : undefined,
      },
    }
    const res = await client.post<CreateOrderResponse>('orders', body)
    const created = res.order ?? res.output?.order
    return transformShipment(created as StarshipitShipment)
  }

  async cancelShipment(credentials: Credentials, id: string): Promise<void> {
    const client = new StarshipitClient(credentials)
    await client.delete(`orders/${id}`)
  }

  // ── Orders ─────────────────────────────────────────────────────────────────

  /**
   * GET /api/orders ("Get Order(s)", https://api-docs.starshipit.com/): "If
   * neither order_id or order_number is provided, this endpoint can be used to
   * return multiple orders that match the criteria." It pages by
   * `page_number` ("Page number to return (default: 1)") and `page_size`
   * ("Number of results to return (default: 500, maximum: 500)"), and returns
   * rows under `data.orders` beside `total_pages`.
   *
   * Its `status` filter defaults to one status ("The order status to filter
   * orders for (default: unshipped)", accepted values "Unshipped, Shipped,
   * Printed"), so a request without it lists only unshipped orders. The list
   * walks the three documented statuses as one stream through pageByRows,
   * each status to its `total_pages`, then the next.
   *
   * The endpoint documents no updated-since filter, so `updatedAfter` is not
   * sent (the full collection is a superset of the changed rows).
   */
  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const client = new StarshipitClient(credentials)
    const asked = Number(params.limit ?? DEFAULT_PAGE_SIZE)
    const pageSize =
      Number.isFinite(asked) && asked >= 1
        ? Math.min(Math.floor(asked), MAX_ORDERS_PAGE_SIZE)
        : MAX_ORDERS_PAGE_SIZE
    // The API key identifies the Starshipit account; the subscription key does not.
    const scope = connectionScope('starshipit', { accessToken: credentials.accessToken })
    const key = `${scope}:orders:${pageSize}`
    const { items } = await pageByRows<Order, string>(
      key,
      params,
      async (cursor) => {
        const [si, pn] = (cursor ?? '0:1').split(':').map(Number) as [number, number]
        const status = ORDER_STATUSES[si]!
        const res = await client.get<OrdersListResponse>('orders', {
          status,
          page_number: pn,
          page_size: pageSize,
        })
        const raw = res.data?.orders ?? []
        // An empty page ends this status whatever else it carries. Rows without
        // the documented total_pages leave the end unknown, so refuse to guess.
        if (raw.length > 0 && typeof res.total_pages !== 'number') {
          throw new Error(`Starshipit GET orders (status ${status}) returned no total_pages`)
        }
        const rows = raw.map(transformOrderRow)
        const next =
          raw.length > 0 && pn < (res.total_pages as number)
            ? `${si}:${pn + 1}`
            : si + 1 < ORDER_STATUSES.length
              ? `${si + 1}:1`
              : undefined
        return { items: rows, next }
      },
      { defaultLimit: DEFAULT_PAGE_SIZE },
    )
    return items
  }

  /**
   * GET /api/orders?order_id= ("Get Order(s)": "order_id (optional) | The
   * unique numeric identifier for the order"), answered as `{ order, success }`.
   */
  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const client = new StarshipitClient(credentials)
    const res = await client.get<OrderResponse>('orders', { order_id: id })
    if (!res.order) {
      throw Object.assign(new Error(`Starshipit order ${id} not found`), { statusCode: 404 })
    }
    return transformOrder(res.order)
  }

  async createOrder(credentials: Credentials, data: Partial<Order>): Promise<Order> {
    const client = new StarshipitClient(credentials)
    const body = {
      order: {
        order_number: data.orderNumber,
        reference: data.orderNumber,
        carrier_code: undefined as string | undefined,
        service_code: data.requestedServiceCode,
        destination: data.destinationAddress
          ? {
              name: data.destinationAddress.name,
              company: data.destinationAddress.company,
              street: data.destinationAddress.street1,
              suburb: data.destinationAddress.city,
              state: data.destinationAddress.state,
              post_code: data.destinationAddress.postalCode,
              country_code: data.destinationAddress.country,
              phone: data.destinationAddress.phone,
              email: data.destinationAddress.email,
            }
          : undefined,
        sender: data.originAddress
          ? {
              name: data.originAddress.name,
              company: data.originAddress.company,
              street: data.originAddress.street1,
              suburb: data.originAddress.city,
              state: data.originAddress.state,
              post_code: data.originAddress.postalCode,
              country_code: data.originAddress.country,
              phone: data.originAddress.phone,
              email: data.originAddress.email,
            }
          : undefined,
        items: data.lineItems?.map((li) => ({
          description: li.name,
          sku: li.sku,
          quantity: li.quantity ?? 1,
          weight: li.weight?.value,
          value: li.unitAmount,
        })),
        currency: data.currency,
      },
    }
    const res = await client.post<CreateOrderResponse>('orders', body)
    const created = res.order ?? res.output?.order
    return transformOrder(created as StarshipitOrder)
  }

  async updateOrder(credentials: Credentials, id: string, data: Partial<Order>): Promise<Order> {
    const client = new StarshipitClient(credentials)
    const body = {
      order: {
        order_id: id,
        order_number: data.orderNumber,
        destination: data.destinationAddress
          ? {
              name: data.destinationAddress.name,
              company: data.destinationAddress.company,
              street: data.destinationAddress.street1,
              suburb: data.destinationAddress.city,
              state: data.destinationAddress.state,
              post_code: data.destinationAddress.postalCode,
              country_code: data.destinationAddress.country,
              phone: data.destinationAddress.phone,
              email: data.destinationAddress.email,
            }
          : undefined,
      },
    }
    const res = await client.put<CreateOrderResponse>('orders', body)
    const updated = res.order ?? res.output?.order
    return transformOrder(updated as StarshipitOrder)
  }

  async cancelOrder(credentials: Credentials, id: string): Promise<void> {
    const client = new StarshipitClient(credentials)
    await client.delete(`orders/${id}`)
  }

  // ── Tracking Events ──────────────────────────────────────────────────────────

  async getTrackingEvents(credentials: Credentials, trackingNumber: string): Promise<TrackingEvent[]> {
    const client = new StarshipitClient(credentials)
    const res = await client.get<TrackingResponse>('track', {
      tracking_number: trackingNumber,
    })
    const raw = res.tracking ?? res.order ?? (res as unknown as StarshipitTracking)
    return transformTracking(raw)
  }

  // ── Rates ────────────────────────────────────────────────────────────────────

  async getRates(credentials: Credentials, params: RateRequestParams): Promise<Rate[]> {
    const client = new StarshipitClient(credentials)
    const body = {
      destination: {
        street: params.destinationAddress.street1,
        suburb: params.destinationAddress.city,
        state: params.destinationAddress.state,
        post_code: params.destinationAddress.postalCode,
        country_code: params.destinationAddress.country,
      },
      sender: params.originAddress
        ? {
            street: params.originAddress.street1,
            suburb: params.originAddress.city,
            state: params.originAddress.state,
            post_code: params.originAddress.postalCode,
            country_code: params.originAddress.country,
          }
        : undefined,
      packages: params.packages.map((pkg) => ({
        weight: pkg.weight?.unit === 'kg' ? pkg.weight.value : pkg.weight?.value,
        length: pkg.dimensions?.unit === 'cm' ? pkg.dimensions.length : undefined,
        width: pkg.dimensions?.unit === 'cm' ? pkg.dimensions.width : undefined,
        height: pkg.dimensions?.unit === 'cm' ? pkg.dimensions.height : undefined,
      })),
    }
    const res = await client.post<RatesResponse>('rates', body)
    return (res.rates ?? []).map(transformRate)
  }

  // ── Labels ───────────────────────────────────────────────────────────────────

  /**
   * Starshipit documents no label collection and no label lookup: the API
   * reference (https://api-docs.starshipit.com/) has no /api/labels path.
   * Labels come back only from printing one ("Print Label", POST
   * /api/orders/shipment).
   */
  async listLabels(_credentials: Credentials, _params: QueryParams): Promise<Label[]> {
    throw notSupported(
      'Starshipit cannot list labels: its API reference has no label collection; labels are returned only by "Print Label" (POST /api/orders/shipment)',
    )
  }

  async getLabel(_credentials: Credentials, _id: string): Promise<Label> {
    throw notSupported(
      'Starshipit cannot get a label by id: its API reference has no label lookup; labels are returned only by "Print Label" (POST /api/orders/shipment)',
    )
  }

  async createLabel(credentials: Credentials, data: Partial<Label>): Promise<Label> {
    if (!data.shipmentId) throw new Error('shipmentId is required to create a label')
    const client = new StarshipitClient(credentials)
    const body = {
      order_ids: [data.shipmentId],
    }
    const res = await client.post<LabelResponse>('labels', body)
    const raw = (res.labels ?? [])[0] ?? res.order ?? (res as unknown as StarshipitLabel)
    return transformLabel(raw)
  }

  async voidLabel(credentials: Credentials, id: string): Promise<void> {
    const client = new StarshipitClient(credentials)
    await client.delete(`labels/${id}`)
  }

  // ── Carriers ──────────────────────────────────────────────────────────────

  /**
   * Starshipit's API reference (https://api-docs.starshipit.com/: Orders,
   * Shipments, Tracking, Rates, Address Book, Manifests, Products) has no
   * carrier or carrier-account collection; carriers appear only as enum values
   * ("Carrier Enums") and on orders.
   */
  async listCarriers(_credentials: Credentials, _params: QueryParams): Promise<Carrier[]> {
    throw notSupported(
      'Starshipit cannot list carriers: its API reference has no carrier or carrier-account collection, only the static "Carrier Enums" table',
    )
  }

  // ── Manifests ─────────────────────────────────────────────────────────────

  /**
   * Create an end-of-day manifest for the given order ids.
   * Starshipit's POST /api/manifests closes shipments off with the carrier and
   * returns one manifest entry per carrier detected in the batch.
   */
  async createManifest(credentials: Credentials, data: Partial<Manifest>): Promise<Manifest> {
    const client = new StarshipitClient(credentials)
    const body: Record<string, unknown> = {}
    if (data.shipmentIds && data.shipmentIds.length > 0) {
      body['order_ids'] = data.shipmentIds.map(Number)
    }
    if (data.carrierId) {
      body['carrier_code'] = data.carrierId
    }
    const res = await client.post<StarshipitManifestResponse>('manifests', body)
    const manifests = transformManifests(res)
    return manifests[0] ?? {
      status: 'SUBMITTED',
      metadata: res as Record<string, unknown>,
    }
  }
}
