// ── Resource coverage ──────────────────────────────────────────────
// Available:   shipment, trackingevent
// Unverified:  carrier — no carrier-management API publicly documented; full API reference gated behind sales/demo access
// Unavailable: label — Tradlinx is a read-only ocean visibility platform; label generation is outside its scope
// Unverified:  manifest — bill-of-lading surfaces as shipment tracking data; no standalone manifest CRUD API publicly documented
// Unverified:  order — no order-management API publicly documented; platform is read-only visibility
// Unavailable: rate — Tradlinx does not offer rate shopping or freight quoting; outside its product scope
// Unverified:  warehouse — no warehouse-management API publicly documented; platform is read-only visibility

import { simpleApiKey } from '@opensteward/shared'
import type { LogisticsAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { Shipment } from '../../schema/shipment'
import type { TrackingEvent } from '../../schema/trackingevent'

import { buildAuthUrl, exchangeApiKey, refreshCredentials as doRefresh } from './auth'
import { TradlinxClient } from './client'
import {
  transformShipment,
  transformTrackingEvents,
  type TradlinxShipment,
  type TradlinxEventsResponse,
} from './transform/tracking'

const SIMPLE_API_KEY_FORM = simpleApiKey()

export class TradlinxAdapter implements LogisticsAdapter {
  readonly platform = 'tradlinx'
  readonly version = '1'

  credentialFields = SIMPLE_API_KEY_FORM.credentialFields
  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  getAuthUrl(state: string): string {
    return buildAuthUrl(state)
  }

  async exchangeCode(code: string, _redirectUri: string): Promise<Credentials> {
    return exchangeApiKey(code)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return doRefresh(credentials)
  }

  async listShipments(credentials: Credentials, params: QueryParams): Promise<Shipment[]> {
    const client = new TradlinxClient(credentials)
    const res = await client.get<{ shipments?: TradlinxShipment[] }>('/shipments', {
      page: params.page,
      limit: params.limit,
    })
    return (res.shipments ?? []).map(transformShipment)
  }

  async getShipment(credentials: Credentials, id: string): Promise<Shipment> {
    const client = new TradlinxClient(credentials)
    const res = await client.get<TradlinxShipment>(`/shipments/${id}`)
    return transformShipment(res)
  }

  async getTrackingEvents(credentials: Credentials, trackingNumber: string): Promise<TrackingEvent[]> {
    const client = new TradlinxClient(credentials)
    const res = await client.get<TradlinxEventsResponse>(`/shipments/${trackingNumber}/events`)
    return transformTrackingEvents(trackingNumber, res)
  }
}
