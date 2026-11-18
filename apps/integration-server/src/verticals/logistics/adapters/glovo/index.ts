// ── Resource coverage ──────────────────────────────────────────────
// Available:   order, rate, shipment, trackingevent
//   listOrders/getOrder/listShipments/getShipment refuse with 501 NOT_SUPPORTED:
//   the Partners spec has no GET on /api/v0/integrations/orders[/{orderId}].
// Unavailable: carrier  — Glovo is a single-carrier on-demand platform; no carrier-listing endpoint exists
// Unavailable: label    — Glovo does not issue shipping labels; couriers are dispatched internally
// Unavailable: manifest — No manifest concept in the Glovo on-demand courier model
// Unverified:  warehouse — Partners/LaaS API docs are behind partner-login walls; no public warehouse endpoint found

import { simpleApiKey } from '@opensteward/shared'
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

import { buildAuthUrl, exchangeApiKey, refreshCredentials as doRefresh } from './auth'
import { GlovoClient } from './client'

import { transformOrder, type GlovoOrder } from './transform/order'
import { transformShipment } from './transform/shipment'
import { transformTracking, type GlovoTracking } from './transform/tracking'
import { transformRate, type GlovoEstimate } from './transform/rate'

interface GlovoAdapterConfig {
  sandbox?: boolean
}

/**
 * The Partners API spec (https://api-docs.glovoapp.com/partners/definition.yaml)
 * documents `/api/v0/integrations/orders/...` only as four PUT actions on one
 * order (`/api/v0/integrations/orders/{orderId}/accept:`, `.../ready_for_pickup:`,
 * `.../out_for_delivery:`, `.../customer_picked_up:`), so orders can be neither
 * listed nor read back by id. Those reads refuse before sending anything.
 */
function notSupported(what: string, reason: string): Error {
  return Object.assign(
    new Error(
      `${what}: the Glovo Partners API spec documents only per-order PUT actions ` +
        `(accept, ready_for_pickup, out_for_delivery, customer_picked_up) under ` +
        `/api/v0/integrations/orders/{orderId}/; ${reason}`,
    ),
    { statusCode: 501, code: 'NOT_SUPPORTED' },
  )
}

const SIMPLE_API_KEY_FORM = simpleApiKey({
  label: 'API key',
  helpText: 'Find your API key at business.glovoapp.com/dashboard/profile',
})

export class GlovoAdapter implements LogisticsAdapter {
  // Connect Link support — single API-key form.
  credentialFields = SIMPLE_API_KEY_FORM.credentialFields
  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'glovo'
  readonly version = '1'

  constructor(_config: GlovoAdapterConfig = {}) {}

  // ── Auth ───────────────────────────────────────────────────────────────────

  getAuthUrl(state: string): string {
    return buildAuthUrl(state)
  }

  async exchangeCode(code: string, _redirectUri: string): Promise<Credentials> {
    return exchangeApiKey(code)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return doRefresh(credentials)
  }

  // ── Orders ─────────────────────────────────────────────────────────────────

  async listOrders(_credentials: Credentials, _params: QueryParams): Promise<Order[]> {
    throw notSupported('Glovo cannot list orders', 'there is no GET on /api/v0/integrations/orders')
  }

  async getOrder(_credentials: Credentials, _id: string): Promise<Order> {
    throw notSupported(
      'Glovo cannot read an order',
      'there is no GET on /api/v0/integrations/orders/{orderId}',
    )
  }

  async createOrder(credentials: Credentials, data: Partial<Order>): Promise<Order> {
    const client = new GlovoClient(credentials)
    const raw = await client.post<GlovoOrder>('api/v0/integrations/orders', {
      description: data.notes,
      scheduleTime: null,
      addresses: [
        data.originAddress
          ? {
              type: 'PICKUP',
              label: data.originAddress.street1,
              details: data.originAddress.street2,
              contactPerson: data.originAddress.name ?? data.originAddress.company,
              contactPhone: data.originAddress.phone,
            }
          : undefined,
        data.destinationAddress
          ? {
              type: 'DELIVERY',
              label: data.destinationAddress.street1,
              details: data.destinationAddress.street2,
              contactPerson: data.destinationAddress.name ?? data.destinationAddress.company,
              contactPhone: data.destinationAddress.phone,
            }
          : undefined,
      ].filter(Boolean),
    })
    return transformOrder(raw)
  }

  async cancelOrder(credentials: Credentials, id: string): Promise<void> {
    const client = new GlovoClient(credentials)
    // Glovo Partners API uses order status updates to cancel an order.
    await client.put<unknown>(`webhook/orders/${id}/cancel`, {})
  }

  // ── Shipments ──────────────────────────────────────────────────────────────
  // Glovo on-demand orders are the shipment entity; we expose them via the
  // Shipment interface for consistency with other courier adapters.

  async listShipments(_credentials: Credentials, _params: QueryParams): Promise<Shipment[]> {
    throw notSupported(
      'Glovo cannot list shipments',
      'there is no GET on /api/v0/integrations/orders',
    )
  }

  async getShipment(_credentials: Credentials, _id: string): Promise<Shipment> {
    throw notSupported(
      'Glovo cannot read a shipment',
      'there is no GET on /api/v0/integrations/orders/{orderId}',
    )
  }

  async createShipment(credentials: Credentials, data: Partial<Shipment>): Promise<Shipment> {
    const client = new GlovoClient(credentials)
    const raw = await client.post<GlovoOrder>('api/v0/integrations/orders', {
      description: data.notes,
      scheduleTime: null,
      addresses: [
        data.originAddress
          ? {
              type: 'PICKUP',
              label: data.originAddress.street1,
              details: data.originAddress.street2,
              contactPerson: data.originAddress.name ?? data.originAddress.company,
              contactPhone: data.originAddress.phone,
            }
          : undefined,
        data.destinationAddress
          ? {
              type: 'DELIVERY',
              label: data.destinationAddress.street1,
              details: data.destinationAddress.street2,
              contactPerson: data.destinationAddress.name ?? data.destinationAddress.company,
              contactPhone: data.destinationAddress.phone,
            }
          : undefined,
      ].filter(Boolean),
    })
    return transformShipment(raw)
  }

  async cancelShipment(credentials: Credentials, id: string): Promise<void> {
    const client = new GlovoClient(credentials)
    await client.put<unknown>(`webhook/orders/${id}/cancel`, {})
  }

  // ── Tracking Events ────────────────────────────────────────────────────────

  async getTrackingEvents(credentials: Credentials, orderId: string): Promise<TrackingEvent[]> {
    const client = new GlovoClient(credentials)
    const raw = await client.get<GlovoTracking>(`api/v0/integrations/orders/${orderId}/tracking`)
    return transformTracking({ ...raw, orderId })
  }

  // ── Rates ──────────────────────────────────────────────────────────────────

  async getRates(credentials: Credentials, params: RateRequestParams): Promise<Rate[]> {
    const client = new GlovoClient(credentials)
    const raw = await client.post<GlovoEstimate>('api/v0/integrations/orders/estimate', {
      scheduleTime: null,
      addresses: [
        {
          type: 'PICKUP',
          label: [
            params.originAddress.street1,
            params.originAddress.city,
            params.originAddress.country,
          ]
            .filter(Boolean)
            .join(', '),
        },
        {
          type: 'DELIVERY',
          label: [
            params.destinationAddress.street1,
            params.destinationAddress.city,
            params.destinationAddress.country,
          ]
            .filter(Boolean)
            .join(', '),
        },
      ],
    })
    return [transformRate(raw)]
  }
}
