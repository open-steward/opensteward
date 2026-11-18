import { simpleApiKey } from '@opensteward/shared'
import type {
  LogisticsAdapter,
  Credentials,
  RateRequestParams,
} from '../../adapter/interface'
import type { Shipment } from '../../schema/shipment'
import type { TrackingEvent } from '../../schema/trackingevent'
import type { Rate } from '../../schema/rate'
import type { Order } from '../../schema/order'

import { buildAuthUrl, exchangeApiKey, refreshCredentials as doRefresh } from './auth'
import { LalamoveClient } from './client'

import { transformTracking, type LalamoveOrderResponse } from './transform/tracking'
import { transformShipment, type LalamoveOrder } from './transform/shipment'
import { transformRate, type LalamoveQuotation } from './transform/rate'
import { transformOrder, type LalamoveOrderDetail } from './transform/order'

// ── Resource coverage ──────────────────────────────────────────────
// Unavailable: carrier   — Lalamove is a single-carrier platform; no carrier listing API exists
// Unavailable: label     — Lalamove does not issue shipping labels; no label endpoint exists
// Unavailable: manifest  — No manifest API exists in the Lalamove v3 REST API
// Unavailable: warehouse — No warehouse API exists in the Lalamove v3 REST API

interface LalamoveAdapterConfig {
  sandbox?: boolean
}
const SIMPLE_API_KEY_FORM = simpleApiKey()


export class LalamoveAdapter implements LogisticsAdapter {

  // Connect Link support — single API-key form.

  credentialFields = SIMPLE_API_KEY_FORM.credentialFields

  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'lalamove'
  readonly version = '1'

  constructor(_config: LalamoveAdapterConfig = {}) {}

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

  // ── Tracking Events ────────────────────────────────────────────────────────

  async getTrackingEvents(credentials: Credentials, orderId: string): Promise<TrackingEvent[]> {
    const client = new LalamoveClient(credentials)
    const raw = await client.get<LalamoveOrderResponse>(`orders/${orderId}`)
    return transformTracking(raw)
  }

  // ── Shipments ──────────────────────────────────────────────────────────────

  async createShipment(credentials: Credentials, data: Partial<Shipment>): Promise<Shipment> {
    const client = new LalamoveClient(credentials)
    const raw = await client.post<LalamoveOrder>('orders', {
      sender: data.originAddress
        ? {
            address: [
              data.originAddress.street1,
              data.originAddress.city,
              data.originAddress.state,
              data.originAddress.postalCode,
              data.originAddress.country,
            ].filter(Boolean).join(', '),
          }
        : undefined,
      recipients: data.destinationAddress
        ? [
            {
              address: [
                data.destinationAddress.street1,
                data.destinationAddress.city,
                data.destinationAddress.state,
                data.destinationAddress.postalCode,
                data.destinationAddress.country,
              ].filter(Boolean).join(', '),
            },
          ]
        : undefined,
      service_type: data.serviceCode,
    })
    return transformShipment(raw)
  }

  // ── Orders ─────────────────────────────────────────────────────────────────

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const client = new LalamoveClient(credentials)
    const raw = await client.get<LalamoveOrderDetail>(`orders/${id}`)
    return transformOrder(raw)
  }

  // ── Rates ──────────────────────────────────────────────────────────────────

  async getRates(credentials: Credentials, params: RateRequestParams): Promise<Rate[]> {
    const client = new LalamoveClient(credentials)
    const res = await client.get<{ quotations: LalamoveQuotation[] }>('quotations', {
      origin: [
        params.originAddress.street1,
        params.originAddress.city,
        params.originAddress.country,
      ].filter(Boolean).join(', '),
      destination: [
        params.destinationAddress.street1,
        params.destinationAddress.city,
        params.destinationAddress.country,
      ].filter(Boolean).join(', '),
    })
    return (res.quotations ?? []).map(transformRate)
  }
}
