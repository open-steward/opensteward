// ── Resource coverage ──────────────────────────────────────────────
// Unavailable: carrier   — Warp is itself the carrier; no carrier-listing API exists
// Unavailable: warehouse — Warp operates its own hub ("Warp Station") network; no warehouse-listing API exists
// Unavailable: label     — Warp is a freight (LTL/FTL) network; shipping labels are not a concept; BOL/POD are retrieved via /documents
// Unavailable: manifest  — No manifest endpoint exists in the Warp API

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

import { buildAuthUrl, refreshCredentials as doRefresh } from './auth'
import { WarpClient } from './client'

import {
  transformShipment,
  transformShipmentFromBooking,
  type WarpShipmentResponse,
  type WarpBookingResponse,
} from './transform/shipment'
import {
  transformTrackingEvents,
  type WarpEventsResponse,
  type WarpTrackingResponse,
} from './transform/tracking'
import { transformRate, type WarpQuoteResponse } from './transform/rate'
import { transformOrder, type WarpOrderResponse } from './transform/order'

/**
 * GET /bookings is a capped "recent" window, not a list. Its whole parameter
 * list in https://www.wearewarp.com/api/v1/openapi.json is quoted below.
 */
function cappedBookingsRefusal(resource: 'shipments' | 'orders'): Error {
  return Object.assign(
    new Error(
      `Warp cannot list ${resource}: its only booking collection, GET /bookings ` +
        '("List recent bookings, newest first"), documents a single parameter, ' +
        '{"name": "limit", "in": "query", "schema": {"type": "integer", "default": 25, "maximum": 100}}, ' +
        'with no page, offset, cursor or date filter to reach older bookings',
    ),
    { statusCode: 501, code: 'NOT_SUPPORTED' },
  )
}

export class WarpAdapter implements LogisticsAdapter {
  readonly platform = 'warp'
  readonly version = '1'

  // ── Auth ─────────────────────────────────────────────────────────────────────

  getAuthUrl(state: string): string {
    return buildAuthUrl(state)
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    throw new Error('warp: OAuth code exchange is not supported — use API key auth')
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return doRefresh(credentials)
  }

  // ── Rates ────────────────────────────────────────────────────────────────────

  async getRates(credentials: Credentials, params: RateRequestParams): Promise<Rate[]> {
    const client = new WarpClient(credentials)

    const originZip = params.originAddress.postalCode ?? ''
    const destinationZip = params.destinationAddress.postalCode ?? ''
    const pkg = params.packages[0]
    const weightLbs = pkg?.weight
      ? pkg.weight.unit === 'kg'
        ? pkg.weight.value * 2.20462
        : pkg.weight.unit === 'oz'
          ? pkg.weight.value / 16
          : pkg.weight.value
      : 500

    const body: Record<string, unknown> = {
      origin_zip: originZip,
      destination_zip: destinationZip,
      pickup_date: new Date().toISOString().slice(0, 10),
      pallets: 1,
      weight_lbs_per_pallet: Math.round(weightLbs),
    }

    if (pkg?.dimensions) {
      const dims = pkg.dimensions
      const toInches =
        dims.unit === 'cm' ? (v: number) => Math.round(v / 2.54) : (v: number) => Math.round(v)
      body.length_in = toInches(dims.length)
      body.width_in = toInches(dims.width)
      body.height_in = toInches(dims.height)
    }

    // Request LTL quote; also try FTL/van if requested via serviceCodes
    const modes: string[] = params.serviceCodes?.length ? params.serviceCodes : ['ltl']

    const results: Rate[] = []
    await Promise.all(
      modes.map(async (mode) => {
        const path = `/${mode}/quote`
        const res = await client.post<WarpQuoteResponse>(path, { ...body }).catch(() => null)
        if (res) results.push(transformRate({ ...res, mode }))
      }),
    )

    return results
  }

  // ── Shipments ────────────────────────────────────────────────────────────────

  async createShipment(credentials: Credentials, data: Partial<Shipment>): Promise<Shipment> {
    const client = new WarpClient(credentials)

    const originZip = data.originAddress?.postalCode ?? ''
    const destZip = data.destinationAddress?.postalCode ?? ''
    const weightLbs = data.totalWeight
      ? data.totalWeight.unit === 'kg'
        ? data.totalWeight.value * 2.20462
        : data.totalWeight.unit === 'oz'
          ? data.totalWeight.value / 16
          : data.totalWeight.value
      : 500

    // Step 1: obtain a quote
    const quoteBody: Record<string, unknown> = {
      origin_zip: originZip,
      destination_zip: destZip,
      pickup_date: data.estimatedDeliveryAt
        ? new Date(data.estimatedDeliveryAt).toISOString().slice(0, 10)
        : new Date().toISOString().slice(0, 10),
      pallets: 1,
      weight_lbs_per_pallet: Math.round(weightLbs),
    }

    const mode = data.mode === 'ftl' ? 'ftl' : 'ltl'
    const quote = await client.post<WarpQuoteResponse>(`/${mode}/quote`, quoteBody)

    if (!quote.quote_id) {
      throw new Error('warp: failed to obtain quote_id for booking')
    }

    // Step 2: book the shipment
    const bookBody: Record<string, unknown> = {
      quote_id: quote.quote_id,
      patch: {
        pickup: {
          street: data.originAddress?.street1 ?? '',
          city: data.originAddress?.city ?? '',
          state: data.originAddress?.state ?? '',
          zipCode: data.originAddress?.postalCode ?? originZip,
          contactName: data.originAddress?.name ?? '',
          phone: data.originAddress?.phone ?? '',
          email: data.originAddress?.email ?? '',
        },
        delivery: {
          street: data.destinationAddress?.street1 ?? '',
          city: data.destinationAddress?.city ?? '',
          state: data.destinationAddress?.state ?? '',
          zipCode: data.destinationAddress?.postalCode ?? destZip,
          contactName: data.destinationAddress?.name ?? '',
          phone: data.destinationAddress?.phone ?? '',
          email: data.destinationAddress?.email ?? '',
        },
      },
      reference: data.reference ?? undefined,
    }

    const booking = await client.post<WarpBookingResponse>('/book', bookBody)
    return transformShipmentFromBooking(booking)
  }

  /**
   * Refused before any request. Warp's only booking collection, GET /bookings
   * ("List recent bookings, newest first"), takes nothing but `limit` (max 100):
   * no page, offset, cursor or date filter reaches older bookings, so serving
   * that capped window would tell the sync the collection is complete.
   * Read one booking with getShipment (GET /track?booking_id=).
   */
  async listShipments(credentials: Credentials, params: QueryParams): Promise<Shipment[]> {
    void credentials
    void params
    throw cappedBookingsRefusal('shipments')
  }

  async getShipment(credentials: Credentials, id: string): Promise<Shipment> {
    const client = new WarpClient(credentials)
    const res = await client.get<WarpShipmentResponse>('/track', { booking_id: id })
    return transformShipment(res)
  }

  async cancelShipment(credentials: Credentials, id: string): Promise<void> {
    const client = new WarpClient(credentials)
    await client.delete(`/bookings/${id}`)
  }

  // ── Orders ───────────────────────────────────────────────────────────────────

  /** Refused before any request, for the same reason as listShipments. */
  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    void credentials
    void params
    throw cappedBookingsRefusal('orders')
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const client = new WarpClient(credentials)
    const res = await client.get<WarpOrderResponse>('/track', { booking_id: id })
    return transformOrder(res)
  }

  // ── Tracking Events ──────────────────────────────────────────────────────────

  async getTrackingEvents(
    credentials: Credentials,
    trackingNumber: string,
  ): Promise<TrackingEvent[]> {
    const client = new WarpClient(credentials)

    const [eventsRes, trackingRes] = await Promise.all([
      client.get<WarpEventsResponse>('/events', { shipment_id: trackingNumber }),
      client
        .get<WarpTrackingResponse>('/track', { booking_id: trackingNumber })
        .catch(() => undefined),
    ])

    return transformTrackingEvents(eventsRes, trackingRes)
  }

  async listTrackingEvents(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<TrackingEvent[]> {
    if (params.shipmentId) {
      return this.getTrackingEvents(credentials, String(params.shipmentId))
    }
    return []
  }
}
