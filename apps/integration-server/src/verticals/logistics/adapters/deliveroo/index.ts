// ── Resource coverage ──────────────────────────────────────────────
// Unavailable: carrier   — Deliveroo is itself the sole carrier; no carrier listing API exists
// Unavailable: label     — Deliveroo uses tracking URLs, not downloadable shipping labels
// Unavailable: manifest  — Deliveroo has no end-of-day manifest or batch-close concept

import { connectionScope, cursorPagerKey, pageByRows, pageLocally } from '@opensteward/shared'
import type { LogisticsAdapter, Credentials, RateRequestParams, QueryParams } from '../../adapter/interface'
import type { Shipment } from '../../schema/shipment'
import type { TrackingEvent } from '../../schema/trackingevent'
import type { Rate } from '../../schema/rate'
import type { Order } from '../../schema/order'
import type { Warehouse } from '../../schema/warehouse'
import type { WebhookEvent } from '../../schema/webhook'

import {
  buildAuthUrl,
  exchangeCredentials,
  refreshCredentials as doRefresh,
  type DeliverooAdapterAuthConfig,
} from './auth'
import { DeliverooClient } from './client'
import { transformShipment, type DeliverooOrderRaw } from './transform/shipment'
import { transformTracking, type DeliverooTrackingRaw } from './transform/tracking'
import { transformRate, type DeliverooQuoteRaw } from './transform/rate'
import { transformOrder, type DeliverooOrderListRaw } from './transform/order'
import { transformWarehouse, type DeliverooRestaurantListRaw } from './transform/warehouse'
import { parseWebhookEvents } from './webhook'

interface DeliverooAdapterConfig {
  clientId?: string
  clientSecret?: string
  sandbox?: boolean
}

export class DeliverooAdapter implements LogisticsAdapter {
  readonly platform = 'deliveroo'
  readonly version = '1'

  private authConfig: DeliverooAdapterAuthConfig

  constructor(config: DeliverooAdapterConfig = {}) {
    this.authConfig = {
      clientId: config.clientId ?? '',
      clientSecret: config.clientSecret ?? '',
      sandbox: config.sandbox ?? false,
    }
  }

  // ── Auth ────────────────────────────────────────────────────────────────────

  getAuthUrl(state: string): string {
    return buildAuthUrl(state)
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    return exchangeCredentials(this.authConfig)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return doRefresh(credentials)
  }

  // ── Webhooks ────────────────────────────────────────────────────────────────

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parseWebhookEvents(payload)
  }

  // ── Tracking Events ─────────────────────────────────────────────────────────

  /**
   * Retrieve tracking events for an order/delivery by its Deliveroo order ID.
   * Uses GET /daas/v1/deliveries/{id} or falls back to constructing an event
   * from the status endpoint.
   */
  async getTrackingEvents(
    credentials: Credentials,
    trackingNumber: string,
  ): Promise<TrackingEvent[]> {
    const client = new DeliverooClient(credentials)
    const raw = await client.get<DeliverooTrackingRaw>(
      `/daas/v1/deliveries/${encodeURIComponent(trackingNumber)}`,
    )
    return transformTracking({ ...raw, id: raw.id ?? trackingNumber })
  }

  // ── Shipments ───────────────────────────────────────────────────────────────

  /**
   * Create a Deliveroo delivery order via POST /signature/v2/orders.
   * The partner must supply restaurant_id (in data.warehouseId) and
   * items (in data.packages / metadata).
   */
  async createShipment(
    credentials: Credentials,
    data: Partial<Shipment>,
  ): Promise<Shipment> {
    const client = new DeliverooClient(credentials)

    const address = data.destinationAddress
    const raw = await client.post<DeliverooOrderRaw>(
      '/signature/v2/orders',
      {
        restaurant_id: data.warehouseId,
        partner_fee_fractional: data.cost?.amount ?? 0,
        fulfillment_type: 'delivery',
        address: address
          ? {
              address1: address.street1,
              address2: address.street2,
              city: address.city,
              postcode: address.postalCode,
              country_code: address.country,
            }
          : undefined,
        customer: address
          ? {
              full_name: address.name,
              phone_number: address.phone,
              email: address.email,
            }
          : undefined,
        items: (data.metadata?.['items'] as unknown[]) ?? [],
      },
      // Idempotency key: use reference or a generated value
      data.reference ?? undefined,
    )
    return transformShipment(raw)
  }

  // ── Orders ──────────────────────────────────────────────────────────────────

  /**
   * List orders via GET /order/v2/brand/{brand_id}/restaurant/{restaurant_id}/orders.
   * Callers must pass `brandId` and `restaurantId` in params (as extra keys).
   *
   * The endpoint is cursor-paged with no page-size parameter: the response's
   * `next` is the "Cursor for the next page if there are more than 100
   * orders", sent back as `cursor`
   * (https://api-docs.deliveroo.com/reference/get-orders-v2). One upstream
   * page is up to 100 orders, not one caller page, so the caller's page is cut
   * out of the cursor chain by rows. A caller passing an explicit upstream
   * `cursor` is at a position, not a row offset, and gets that one upstream
   * page as before.
   */
  async listOrders(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<Order[]> {
    const client = new DeliverooClient(credentials)
    const extra = params as Record<string, unknown>
    const brandId = String(extra['brandId'] ?? '')
    const restaurantId = String(extra['restaurantId'] ?? '')
    const path = `/order/v2/brand/${encodeURIComponent(brandId)}/restaurant/${encodeURIComponent(restaurantId)}/orders`
    const filters = {
      start_date: extra['startDate'] as string | undefined,
      end_date: extra['endDate'] as string | undefined,
    }
    const explicitCursor = extra['cursor'] as string | undefined
    if (explicitCursor !== undefined) {
      const raw = await client.get<DeliverooOrderListRaw>(path, { ...filters, cursor: explicitCursor })
      return (raw.orders ?? []).map(transformOrder)
    }
    const key = cursorPagerKey(connectionScope('deliveroo', credentials), 'orders', {
      brandId,
      restaurantId,
      ...filters,
    })
    const { items } = await pageByRows<Order>(key, params, async (cursor) => {
      const raw = await client.get<DeliverooOrderListRaw>(path, { ...filters, cursor })
      return { items: (raw.orders ?? []).map(transformOrder), next: raw.next || null }
    })
    return items
  }

  // ── Warehouses ──────────────────────────────────────────────────────────────

  /**
   * List restaurants (warehouses) via GET /signature/v1/restaurants.
   * Callers may pass lat/lon or postcode/countryCode in params.
   */
  async listWarehouses(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<Warehouse[]> {
    const client = new DeliverooClient(credentials)
    const extra = params as Record<string, unknown>
    const raw = await client.get<DeliverooRestaurantListRaw>(
      '/signature/v1/restaurants',
      {
        lat: extra['lat'] as number | undefined,
        lon: extra['lon'] as number | undefined,
        postcode: extra['postcode'] as string | undefined,
        country_code: extra['countryCode'] as string | undefined,
        brand_id: extra['brandId'] as string | undefined,
      },
    )
    // No paging parameters are documented: the whole list comes back at once
    // ("A list of Restaurants that deliver to the specified location.",
    // https://api-docs.deliveroo.com/reference/get-restaurants).
    return pageLocally((raw.restaurants ?? []).map(transformWarehouse), params)
  }

  // ── Rates ───────────────────────────────────────────────────────────────────

  /**
   * Request a delivery quote via POST /signature/v1/quotes.
   * Requires restaurant_id (originAddress.name is used as a fallback label).
   */
  async getRates(
    credentials: Credentials,
    params: RateRequestParams,
  ): Promise<Rate[]> {
    const client = new DeliverooClient(credentials)
    const dest = params.destinationAddress
    const raw = await client.post<DeliverooQuoteRaw>('/signature/v1/quotes', {
      restaurant_id: params.originAddress?.name ?? (params as Record<string, unknown>)['restaurantId'],
      address: dest
        ? {
            address1: dest.street1,
            city: dest.city,
            postcode: dest.postalCode,
            country_code: dest.country,
          }
        : undefined,
      lat: (params as Record<string, unknown>)['lat'],
      lon: (params as Record<string, unknown>)['lon'],
    })
    return [transformRate(raw)]
  }
}
