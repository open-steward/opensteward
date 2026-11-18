// ── Resource coverage ──────────────────────────────────────────────
// Available:   rate, shipment, trackingevent
// Unavailable: carrier      — Uber Direct is a single-carrier dispatch platform; no carrier-listing endpoint exists in the DaaS API.
// Unavailable: label        — Uber Direct dispatches couriers directly and does not produce shipping labels; no label endpoint exists.
// Unavailable: manifest     — Uber Direct has no manifest or SCAN-form concept; manifests are not part of the DaaS API.
// Unavailable: order        — Uber Direct uses "delivery" as its core resource under /v1/customers/{id}/deliveries; no separate order endpoint exists in the DaaS API.
// Unavailable: warehouse    — No warehouse management endpoint exists in the DaaS customers API; the Store Management API is a separate enterprise product on a different base path.

import type {
  LogisticsAdapter,
  Credentials,
  RateRequestParams,
} from '../../adapter/interface'
import type { Shipment } from '../../schema/shipment'
import type { TrackingEvent } from '../../schema/trackingevent'
import type { Rate } from '../../schema/rate'

import { buildAuthUrl, exchangeCredentials, refreshCredentials as doRefresh } from './auth'
import { UberDirectClient } from './client'
import { transformTracking, type UberDirectDelivery } from './transform/tracking'
import { transformShipment, type UberDirectShipment } from './transform/shipment'
import { transformRate, type UberDirectQuote } from './transform/rate'

export class UberDirectAdapter implements LogisticsAdapter {
  readonly platform = 'uber-direct'
  readonly version = '1'

  getAuthUrl(state: string): string {
    return buildAuthUrl(state)
  }

  async exchangeCode(code: string, _redirectUri: string): Promise<Credentials> {
    const [clientId, clientSecret] = code.split(':')
    return exchangeCredentials({ clientId, clientSecret })
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return doRefresh(credentials)
  }

  async getTrackingEvents(credentials: Credentials, trackingNumber: string): Promise<TrackingEvent[]> {
    const customerId = (credentials.extra as Record<string, unknown> | undefined)?.customerId ?? ''
    const client = new UberDirectClient(credentials)
    const raw = await client.get<UberDirectDelivery>(`${customerId}/deliveries/${trackingNumber}`)
    return transformTracking(raw)
  }

  async createShipment(credentials: Credentials, data: Partial<Shipment>): Promise<Shipment> {
    const customerId = (credentials.extra as Record<string, unknown> | undefined)?.customerId ?? ''
    const client = new UberDirectClient(credentials)
    const raw = await client.post<UberDirectShipment>(`${customerId}/deliveries`, {
      pickup_address: data.originAddress,
      dropoff_address: data.destinationAddress,
      external_id: data.reference,
    })
    return transformShipment(raw)
  }

  async getRates(credentials: Credentials, params: RateRequestParams): Promise<Rate[]> {
    const customerId = (credentials.extra as Record<string, unknown> | undefined)?.customerId ?? ''
    const client = new UberDirectClient(credentials)
    const raw = await client.post<UberDirectQuote>(`${customerId}/delivery_quotes`, {
      pickup_address: params.originAddress,
      dropoff_address: params.destinationAddress,
    })
    return [transformRate(raw)]
  }
}
