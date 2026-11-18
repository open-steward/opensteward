// ── Resource coverage ──────────────────────────────────────────────────────────
// Available:   order, shipment, trackingevent
// Unavailable: carrier      — no REST endpoint to list/retrieve carriers; supported carriers are a static platform configuration
// Unavailable: label        — parcelLab does not provide a label generation or retrieval API
// Unavailable: manifest     — no manifest concept or endpoint in the parcelLab API
// Unavailable: rate         — parcelLab does not offer a rate calculation API
// Unavailable: warehouse    — no warehouse management endpoint; warehouse events are inbound status updates only

import { connectionScope, cursorPagerKey, customForm, pageByRows } from '@opensteward/shared'
import type {
  LogisticsAdapter,
  Credentials,
  QueryParams,
} from '../../adapter/interface'
import type { TrackingEvent } from '../../schema/trackingevent'
import type { Order } from '../../schema/order'
import type { Shipment } from '../../schema/shipment'

import {
  buildAuthUrl,
  exchangeCredentials as doExchangeCredentials,
  refreshCredentials as doRefresh,
  parcellabCredentialFields,
} from './auth'
import { ParcellabClient } from './client'

import { transformTracking, type ParcellabTracking } from './transform/tracking'
import { transformOrder, type ParcellabOrder } from './transform/order'
import { transformShipment, type ParcellabShipment } from './transform/shipment'

/**
 * One page of GET /v4/track/orders/, the parcelLab "List Orders" endpoint
 * (operationId track_orders_list,
 * https://docs.parcellab.com/docs/developers/orders/full-order-api-spec).
 * It is cursor-paged: the documented query param is `cursor` ("The pagination
 * cursor value.") and the response is a PaginatedOrderList whose nullable
 * `next` URI carries the following page's cursor. No page-size param is
 * documented, so the server sizes each page and the caller's page is cut out
 * of the stream with pageByRows.
 */
async function ordersPage<T>(
  client: ParcellabClient,
  cursor: string | undefined,
): Promise<{ results: T[]; next: string | null }> {
  const res = await client.get<{ results?: T[]; next?: string | null }>('v4/track/orders/', {
    cursor,
  })
  return { results: res.results ?? [], next: nextCursor(res.next) }
}

/** The `cursor` query param of a `next` URI; null when there is no next page. */
function nextCursor(next: string | null | undefined): string | null {
  if (!next) return null
  const cursor = new URL(next, 'https://api.parcellab.com/').searchParams.get('cursor')
  if (!cursor) throw new Error(`parcelLab: next page URI carries no cursor: ${next}`)
  return cursor
}

/** Row-pager key for one connection's walk of one collection read from /v4/track/orders/. */
function ordersKey(credentials: Credentials, collection: string): string {
  const account = `parcellab:${String(credentials.extra?.['userId'] ?? '')}`
  return cursorPagerKey(connectionScope(account, credentials), collection, {})
}

const CREDENTIAL_FORM = customForm({
  fields: parcellabCredentialFields,
  exchange: doExchangeCredentials,
})

export class ParcellabAdapter implements LogisticsAdapter {
  // Connect Link support — userId + API token form.
  credentialFields = CREDENTIAL_FORM.credentialFields
  exchangeCredentials = CREDENTIAL_FORM.exchangeCredentials

  readonly platform = 'parcellab'
  readonly version = '1'

  // ── Auth ──────────────────────────────────────────────────────────────────

  getAuthUrl(state: string): string {
    return buildAuthUrl(state)
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    // parcelLab has no OAuth2 code flow; credentials are collected via credentialFields.
    throw new Error('parcelLab does not support OAuth2 code exchange; use credentialFields.')
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return doRefresh(credentials)
  }

  // ── Tracking Events ───────────────────────────────────────────────────────

  /**
   * Retrieve tracking events for a given tracking number by querying the
   * parcelLab v4 orders endpoint and extracting checkpoints.
   */
  async getTrackingEvents(
    credentials: Credentials,
    trackingNumber: string,
  ): Promise<TrackingEvent[]> {
    const client = new ParcellabClient(credentials)
    // Query by tracking number via order search; trackings are embedded.
    const res = await client.get<{ results?: ParcellabTracking[] } | ParcellabTracking>(
      'v4/track/orders/',
      { tracking_number: trackingNumber, limit: 1 },
    )
    const records: ParcellabTracking[] =
      'results' in res && Array.isArray((res as { results?: ParcellabTracking[] }).results)
        ? (res as { results: ParcellabTracking[] }).results
        : [res as ParcellabTracking]

    return records.flatMap(transformTracking)
  }

  async listTrackingEvents(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<TrackingEvent[]> {
    const client = new ParcellabClient(credentials)
    const key = ordersKey(credentials, 'trackingevents')
    const { items } = await pageByRows<TrackingEvent>(key, params, async (cursor) => {
      const page = await ordersPage<ParcellabTracking>(client, cursor)
      return { items: page.results.flatMap(transformTracking), next: page.next }
    })
    return items
  }

  // ── Orders ────────────────────────────────────────────────────────────────

  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const client = new ParcellabClient(credentials)
    const key = ordersKey(credentials, 'orders')
    const { items } = await pageByRows<Order>(key, params, async (cursor) => {
      const page = await ordersPage<ParcellabOrder>(client, cursor)
      return { items: page.results.map(transformOrder), next: page.next }
    })
    return items
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const client = new ParcellabClient(credentials)
    const raw = await client.get<ParcellabOrder>(`v4/track/orders/${id}/`)
    return transformOrder(raw)
  }

  async createOrder(credentials: Credentials, data: Partial<Order>): Promise<Order> {
    const client = new ParcellabClient(credentials)
    // Build the minimal parcelLab payload from canonical Order fields
    const payload: Record<string, unknown> = {
      order_number: data.orderNumber,
      recipient_email: data.destinationAddress?.email ?? '_unset',
      destination_country_iso3: data.destinationAddress?.country,
      recipient_name: data.destinationAddress?.name,
      order_currency: data.currency,
      order_total_amount: data.totalAmount,
      order_tax_amount: data.taxAmount,
      order_discount_amount: data.discountAmount,
      order_date: data.orderAt?.toISOString(),
    }
    const raw = await client.put<ParcellabOrder>('v4/track/orders/', payload)
    return transformOrder(raw)
  }

  async cancelOrder(credentials: Credentials, id: string): Promise<void> {
    const client = new ParcellabClient(credentials)
    // parcelLab cancel is a mutation via PUT
    await client.put<unknown>('v4/track/orders/', {
      external_id: id,
      mutations: [{ type: 'cancel_order' }],
    })
  }

  // ── Shipments ─────────────────────────────────────────────────────────────

  async listShipments(credentials: Credentials, params: QueryParams): Promise<Shipment[]> {
    const client = new ParcellabClient(credentials)
    const key = ordersKey(credentials, 'shipments')
    const { items } = await pageByRows<Shipment>(key, params, async (cursor) => {
      const page = await ordersPage<ParcellabShipment>(client, cursor)
      return { items: page.results.map(transformShipment), next: page.next }
    })
    return items
  }

  async getShipment(credentials: Credentials, id: string): Promise<Shipment> {
    const client = new ParcellabClient(credentials)
    const raw = await client.get<ParcellabShipment>(`v4/track/orders/${id}/`)
    return transformShipment(raw)
  }

  async createShipment(credentials: Credentials, data: Partial<Shipment>): Promise<Shipment> {
    const client = new ParcellabClient(credentials)
    const payload: Record<string, unknown> = {
      order_number: data.reference,
      recipient_email: data.destinationAddress?.email ?? '_unset',
      destination_country_iso3: data.destinationAddress?.country,
      recipient_postal_code: data.destinationAddress?.postalCode,
      mutations: data.trackingNumber && data.carrierId
        ? [
            {
              type: 'add_tracking',
              tracking_number: data.trackingNumber,
              courier: data.carrierId,
            },
          ]
        : undefined,
    }
    const raw = await client.put<ParcellabShipment>('v4/track/orders/', payload)
    return transformShipment(raw)
  }

  async cancelShipment(credentials: Credentials, id: string): Promise<void> {
    const client = new ParcellabClient(credentials)
    await client.put<unknown>('v4/track/orders/', {
      external_id: id,
      mutations: [{ type: 'cancel_tracking' }],
    })
  }
}
