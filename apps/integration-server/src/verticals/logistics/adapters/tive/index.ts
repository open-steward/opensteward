// ── Resource coverage ──────────────────────────────────────────────
// Unavailable: label    — Tive is a visibility/IoT-tracker platform; no label generation or management endpoints exist
// Unavailable: manifest — no manifest endpoint in Tive API v3
// Unavailable: order    — no order management endpoints in Tive API v3
// Unavailable: rate     — no rate-quoting endpoints in Tive API v3
// Unavailable: warehouse — no warehouse endpoints in Tive API v3

import { simpleApiKey } from '@opensteward/shared'
import type { LogisticsAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { Carrier } from '../../schema/carrier'
import type { TrackingEvent } from '../../schema/trackingevent'

import { buildAuthUrl, exchangeApiKey, refreshCredentials as doRefresh } from './auth'
import { TiveClient } from './client'
import { transformCarrier, type TiveCarrierRaw, type TiveCarriersResponse } from './transform/carrier'
import { transformTracking, type TiveTrackingResponse } from './transform/tracking'

interface TiveAdapterConfig {
  sandbox?: boolean
}
const SIMPLE_API_KEY_FORM = simpleApiKey()


export class TiveAdapter implements LogisticsAdapter {

  // Connect Link support — single API-key form.

  credentialFields = SIMPLE_API_KEY_FORM.credentialFields

  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'tive'
  readonly version = '1'

  constructor(_config: TiveAdapterConfig = {}) {}

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
    const client = new TiveClient(credentials)
    const raw = await client.get<TiveTrackingResponse>(`shipments/${trackingNumber}`)
    return transformTracking(raw)
  }

  async listTrackingEvents(credentials: Credentials, params: QueryParams): Promise<TrackingEvent[]> {
    const client = new TiveClient(credentials)
    const raw = await client.get<{ data: TiveTrackingResponse[] }>('shipments', params)
    const list = raw.data ?? []
    return list.flatMap((r) => transformTracking(r))
  }

  async listCarriers(credentials: Credentials, params: QueryParams): Promise<Carrier[]> {
    const client = new TiveClient(credentials)
    const raw = await client.get<TiveCarriersResponse>('carriers', params)
    return (raw.data ?? []).map(transformCarrier)
  }

  async getCarrier(credentials: Credentials, id: string): Promise<Carrier> {
    const client = new TiveClient(credentials)
    const raw = await client.get<TiveCarrierRaw>(`carriers/${id}`)
    return transformCarrier(raw)
  }
}
