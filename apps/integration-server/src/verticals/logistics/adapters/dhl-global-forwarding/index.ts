import { simpleApiKey } from '@opensteward/shared'
import type { LogisticsAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { TrackingEvent } from '../../schema/trackingevent'
import type { Order } from '../../schema/order'

import { buildAuthUrl, exchangeApiKey, refreshCredentials as doRefresh } from './auth'
import { DhlGlobalForwardingClient } from './client'
import { transformTracking, type DhlGfTrackingResponse } from './transform/tracking'
import { transformOrder, type DhlGfBookingResponse } from './transform/order'

// ── Resource coverage ──────────────────────────────────────────────
// Unavailable: carrier   — DHL Global Forwarding is a single carrier; no carrier-management API exists
// Unavailable: manifest  — No manifest API in the DHL Global Forwarding developer catalog
// Unavailable: rate      — No rate/quote developer API; myDHLi Quote+Book is a UI tool only
// Unavailable: warehouse — No warehouse API in the DHL Global Forwarding developer catalog
// Unverified:  label     — Shipment Label API exists but full endpoint schema is behind authenticated Swagger

interface DhlGlobalForwardingAdapterConfig {
  sandbox?: boolean
}
const SIMPLE_API_KEY_FORM = simpleApiKey()


export class DhlGlobalForwardingAdapter implements LogisticsAdapter {

  // Connect Link support — single API-key form.

  credentialFields = SIMPLE_API_KEY_FORM.credentialFields

  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'dhl-global-forwarding'
  readonly version = '1'

  constructor(_config: DhlGlobalForwardingAdapterConfig = {}) {}

  getAuthUrl(state: string): string {
    return buildAuthUrl(state)
  }

  async exchangeCode(code: string, _redirectUri: string): Promise<Credentials> {
    return exchangeApiKey(code)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return doRefresh(credentials)
  }

  async getTrackingEvents(credentials: Credentials, trackingNumber: string): Promise<TrackingEvent[]> {
    const client = new DhlGlobalForwardingClient(credentials)
    const raw = await client.get<DhlGfTrackingResponse>('', { trackingNumber })
    return transformTracking(raw)
  }

  async listOrders(credentials: Credentials, _params: QueryParams): Promise<Order[]> {
    // The Shipment Booking API does not expose a list endpoint; return empty.
    void credentials
    return []
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const client = new DhlGlobalForwardingClient(credentials)
    const raw = await client.get<DhlGfBookingResponse>(`/shipment-booking/${id}`)
    return transformOrder(raw)
  }

  async createOrder(credentials: Credentials, data: Partial<Order>): Promise<Order> {
    const client = new DhlGlobalForwardingClient(credentials)
    const raw = await client.post<DhlGfBookingResponse>('/shipment-booking', data)
    return transformOrder(raw)
  }
}
