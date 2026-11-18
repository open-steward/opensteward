// ── Resource coverage ──────────────────────────────────────────────
// Unavailable: manifest  — Shipbubble has no manifest concept or endpoint; the API covers rates, labels, and tracking only.
// Unavailable: order     — Shipbubble has no order management API; shipments are created directly via the labels endpoint without an order layer.
// Unavailable: warehouse — Shipbubble has no warehouse resource; sender addresses are stored in an address book (address_code) but lack warehouse-specific fields (cutoff time, timezone, inventory).

import {
  simpleApiKey,
  connectionScope,
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
export { shipbubbleWebhook } from './webhook'
import type { Shipment } from '../../schema/shipment'
import type { TrackingEvent } from '../../schema/trackingevent'
import type { Rate } from '../../schema/rate'
import type { Label } from '../../schema/label'
import type { Carrier } from '../../schema/carrier'

import { buildAuthUrl, exchangeApiKey, refreshCredentials as doRefresh } from './auth'
import { ShipbubbleClient } from './client'
import { DEFAULT_PAGE_SIZE, UPSTREAM_PAGE_SIZE } from './constants'

import { transformShipment, type ShipbubbleShipment } from './transform/shipment'
import { transformTrackingEvents } from './transform/tracking'
import { transformRate, type ShipbubbleCourierRate } from './transform/rate'
import { transformLabel, type ShipbubbleShipmentWithPayment } from './transform/label'
import { transformCarrier, type ShipbubbleCourier } from './transform/carrier'

interface ShipbubbleListResponse<T> {
  status?: string
  message?: string
  data?: {
    results?: T[]
    pagination?: {
      current?: number
      perPage?: number
      previous?: number
      next?: number
      total?: number
    }
  }
}

interface ShipbubbleRatesResponse {
  status?: string
  message?: string
  data?: {
    request_token?: string
    couriers?: ShipbubbleCourierRate[]
    fastest_courier?: ShipbubbleCourierRate
    cheapest_courier?: ShipbubbleCourierRate
    checkout_data?: Record<string, unknown>
  }
}

interface ShipbubbleSingleResponse<T> {
  status?: string
  message?: string
  data?: T
}

interface ShipbubbleCouriersResponse {
  status?: string
  message?: string
  data?: ShipbubbleCourier[]
}

const SIMPLE_API_KEY_FORM = simpleApiKey()

/**
 * Pager scope for one connection. A Shipbubble API key carries no account id,
 * so the scope is the platform plus the connection's key fingerprint.
 */
function pagerScope(credentials: Credentials): string {
  return connectionScope('shipbubble', credentials)
}

/**
 * The caller's page of rows cut from GET /shipping/labels, which is paged by
 * page number: https://docs.shipbubble.com/get-started/pagination documents
 * `Page` ("current `page` to be returned per request. Default: 1") and
 * `PerPage` ("the maximum number of records that will be returned after the
 * request ... Default is 50"). No maximum is documented, so every request
 * asks for the documented default and a short page ends the list. The
 * `pagination` object is not read: its examples disagree on whether `current`
 * is 0- or 1-based and whether `total` counts rows or pages. Rows are cut to
 * the caller's page by `pageByRows`, which reports an exact `hasMore`.
 */
async function pageLabels<R>(
  credentials: Credentials,
  params: QueryParams,
  collection: string,
  toRows: (results: ShipbubbleShipmentWithPayment[]) => R[],
): Promise<R[]> {
  const client = new ShipbubbleClient(credentials)
  const key = cursorPagerKey(pagerScope(credentials), collection, { limit: UPSTREAM_PAGE_SIZE })
  const { items } = await pageByRows<R, number>(
    key,
    params,
    async (page) => {
      const current = page ?? 1
      const res = await client.get<ShipbubbleListResponse<ShipbubbleShipmentWithPayment>>(
        'shipping/labels',
        { Page: current, PerPage: UPSTREAM_PAGE_SIZE },
      )
      const results = res.data?.results ?? []
      return {
        items: toRows(results),
        next: results.length < UPSTREAM_PAGE_SIZE ? undefined : current + 1,
      }
    },
    { defaultLimit: DEFAULT_PAGE_SIZE },
  )
  return items
}

export class ShipbubbleAdapter implements LogisticsAdapter {
  // Connect Link support — single API-key form.
  credentialFields = SIMPLE_API_KEY_FORM.credentialFields
  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'shipbubble'
  readonly version = '1'

  // ── Auth ─────────────────────────────────────────────────────────────────

  getAuthUrl(state: string): string {
    return buildAuthUrl(state)
  }

  async exchangeCode(code: string, _redirectUri: string): Promise<Credentials> {
    return exchangeApiKey(code)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return doRefresh(credentials)
  }

  // ── Shipments ────────────────────────────────────────────────────────────

  async listShipments(credentials: Credentials, params: QueryParams): Promise<Shipment[]> {
    return pageLabels(credentials, params, 'shipments', (rows) => rows.map(transformShipment))
  }

  async getShipment(credentials: Credentials, id: string): Promise<Shipment> {
    const client = new ShipbubbleClient(credentials)
    const res = await client.get<ShipbubbleListResponse<ShipbubbleShipment>>(
      `shipping/labels/list/${id}`,
    )
    const results = res.data?.results ?? []
    const raw = results[0]
    if (!raw) throw new Error(`Shipment not found: ${id}`)
    return transformShipment(raw)
  }

  async createShipment(credentials: Credentials, data: Partial<Shipment>): Promise<Shipment> {
    const client = new ShipbubbleClient(credentials)
    // Creating a shipment in Shipbubble requires a pre-fetched request_token and
    // courier_id from the rates endpoint. When data.metadata carries these values
    // (set by getRates / the caller) we use them; otherwise we throw a descriptive error.
    const meta = data.metadata as Record<string, unknown> | undefined
    const requestToken = meta?.request_token
    const courierId = meta?.courier_id ?? meta?.service_code
    if (!requestToken || !courierId) {
      throw new Error(
        'Shipbubble requires request_token and courier_id in metadata to create a shipment. ' +
        'Call getRates first and pass the chosen courier\'s courier_id.',
      )
    }
    const res = await client.post<ShipbubbleSingleResponse<ShipbubbleShipmentWithPayment>>(
      'shipping/labels',
      {
        request_token: requestToken,
        courier_id: courierId,
        service_code: meta?.service_code,
        insurance_code: meta?.insurance_code,
        is_cod_label: meta?.is_cod_label,
      },
    )
    const raw = res.data
    if (!raw) throw new Error('Shipbubble did not return shipment data')
    return transformShipment(raw)
  }

  async cancelShipment(credentials: Credentials, id: string): Promise<void> {
    const client = new ShipbubbleClient(credentials)
    await client.post<unknown>(`shipping/labels/cancel/${id}`, {})
  }

  // ── Tracking Events ──────────────────────────────────────────────────────

  async getTrackingEvents(credentials: Credentials, trackingNumber: string): Promise<TrackingEvent[]> {
    // Shipbubble tracks by order_id; accept both order_id and tracking_code
    const client = new ShipbubbleClient(credentials)
    const res = await client.get<ShipbubbleListResponse<ShipbubbleShipment>>(
      `shipping/labels/list/${trackingNumber}`,
    )
    const results = res.data?.results ?? []
    return results.flatMap(transformTrackingEvents)
  }

  async listTrackingEvents(credentials: Credentials, params: QueryParams): Promise<TrackingEvent[]> {
    // Events are flattened from each shipment, so a page of shipments is not a page of events.
    return pageLabels(credentials, params, 'trackingevents', (rows) =>
      rows.flatMap(transformTrackingEvents),
    )
  }

  // ── Rates ────────────────────────────────────────────────────────────────

  async getRates(credentials: Credentials, params: RateRequestParams): Promise<Rate[]> {
    const client = new ShipbubbleClient(credentials)
    // Shipbubble rates require validated address codes and a category_id.
    // Callers supply these via the params spread (extra keys allowed by interface).
    const senderAddressCode = (params as Record<string, unknown>).sender_address_code
    const receiverAddressCode = (params as Record<string, unknown>).reciever_address_code
    const categoryId = (params as Record<string, unknown>).category_id ?? 1
    const pickupDate = (params as Record<string, unknown>).pickup_date
      ?? new Date().toISOString().slice(0, 10)

    const pkg = params.packages[0]
    const packageItems = (params as Record<string, unknown>).package_items ?? [
      {
        name: 'Package',
        description: 'Package',
        unit_weight: pkg?.weight?.unit === 'kg'
          ? (pkg.weight.value ?? 1)
          : ((pkg?.weight?.value ?? 1000) / 1000),
        unit_amount: 0,
        quantity: 1,
      },
    ]

    const packageDimension = pkg?.dimensions
      ? {
          length: pkg.dimensions.unit === 'cm' ? pkg.dimensions.length : pkg.dimensions.length * 2.54,
          width: pkg.dimensions.unit === 'cm' ? pkg.dimensions.width : pkg.dimensions.width * 2.54,
          height: pkg.dimensions.unit === 'cm' ? pkg.dimensions.height : pkg.dimensions.height * 2.54,
        }
      : { length: 10, width: 10, height: 10 }

    const res = await client.post<ShipbubbleRatesResponse>('shipping/fetch_rates', {
      sender_address_code: senderAddressCode,
      reciever_address_code: receiverAddressCode,
      pickup_date: pickupDate,
      category_id: categoryId,
      package_items: packageItems,
      package_dimension: packageDimension,
    })

    return (res.data?.couriers ?? []).map((c) =>
      transformRate({
        ...c,
        // stash the request_token so callers can pass it back when creating a shipment
        _request_token: res.data?.request_token,
      }),
    )
  }

  // ── Labels ───────────────────────────────────────────────────────────────

  async listLabels(credentials: Credentials, params: QueryParams): Promise<Label[]> {
    return pageLabels(credentials, params, 'labels', (rows) => rows.map(transformLabel))
  }

  async getLabel(credentials: Credentials, id: string): Promise<Label> {
    const client = new ShipbubbleClient(credentials)
    const res = await client.get<ShipbubbleListResponse<ShipbubbleShipmentWithPayment>>(
      `shipping/labels/list/${id}`,
    )
    const results = res.data?.results ?? []
    const raw = results[0]
    if (!raw) throw new Error(`Label not found: ${id}`)
    return transformLabel(raw)
  }

  async createLabel(credentials: Credentials, data: Partial<Label>): Promise<Label> {
    // In Shipbubble, label creation == shipment creation. Delegate to createShipment.
    const shipment = await this.createShipment(credentials, {
      metadata: data.metadata ?? {},
    })
    return {
      id: shipment.id,
      shipmentId: shipment.id,
      trackingNumber: shipment.trackingNumber,
      carrierId: shipment.carrierId,
      status: 'CREATED',
      url: shipment.labelUrl,
      createdAt: shipment.createdAt,
      metadata: shipment.metadata,
    }
  }

  async voidLabel(credentials: Credentials, id: string): Promise<void> {
    return this.cancelShipment(credentials, id)
  }

  // ── Carriers ─────────────────────────────────────────────────────────────

  /**
   * GET /shipping/couriers takes no paging parameters and returns every
   * courier as a bare `data` array with no `pagination` object
   * (https://docs.shipbubble.com/api-reference/couriers/view-courier-integrations),
   * so the whole list is sliced locally.
   */
  async listCarriers(credentials: Credentials, params: QueryParams): Promise<Carrier[]> {
    const client = new ShipbubbleClient(credentials)
    const res = await client.get<ShipbubbleCouriersResponse>('shipping/couriers')
    return pageLocally((res.data ?? []).map(transformCarrier), params)
  }
}
