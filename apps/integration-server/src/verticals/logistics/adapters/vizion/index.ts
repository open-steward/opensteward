import { simpleApiKey } from '@opensteward/shared'
import type { LogisticsAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { TrackingEvent } from '../../schema/trackingevent'
import type { Carrier } from '../../schema/carrier'

import { buildAuthUrl, exchangeApiKey, refreshCredentials as doRefresh } from './auth'
import { VizionClient } from './client'
import { transformTracking, type VizionTrackingResponse } from './transform/tracking'
import { transformTrackingEvent, type VizionTrackingEvent } from './transform/trackingevent'
import { transformCarrier, type VizionCarrier } from './transform/carrier'

// ── Resource coverage ──────────────────────────────────────────────
// Unavailable: label     — Vizion is a container-tracking API only; no parcel label generation
// Unavailable: manifest  — no manifest concept or endpoint in Vizion API
// Unavailable: order     — no order management in Vizion API
// Unavailable: rate      — no rating/quoting in Vizion API
// Unavailable: warehouse — no warehouse management in Vizion API

interface VizionAdapterConfig {
  sandbox?: boolean
}
const SIMPLE_API_KEY_FORM = simpleApiKey()


export class VizionAdapter implements LogisticsAdapter {

  // Connect Link support — single API-key form.

  credentialFields = SIMPLE_API_KEY_FORM.credentialFields

  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'vizion'
  readonly version = '1'

  constructor(_config: VizionAdapterConfig = {}) {}

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
    const client = new VizionClient(credentials)
    const raw = await client.get<VizionTrackingResponse>(`references/${trackingNumber}`)
    return transformTracking(raw)
  }

  async listTrackingEvents(credentials: Credentials, params: QueryParams): Promise<TrackingEvent[]> {
    const client = new VizionClient(credentials)
    const raw = await client.get<{ data: VizionTrackingResponse[] }>('references', params)
    const list = raw.data ?? []
    return list.flatMap((r) => {
      const events: VizionTrackingEvent[] = r.events ?? []
      const tn = r.container_number ?? undefined
      return events.map((evt) => transformTrackingEvent(evt, tn))
    })
  }

  async listCarriers(credentials: Credentials, _params: QueryParams): Promise<Carrier[]> {
    const client = new VizionClient(credentials)
    const raw = await client.get<VizionCarrier[]>('carriers')
    return (raw ?? []).map(transformCarrier)
  }

  async getCarrier(credentials: Credentials, id: string): Promise<Carrier> {
    const client = new VizionClient(credentials)
    const raw = await client.get<VizionCarrier[]>('carriers')
    const found = (raw ?? []).find((c) => (c.carrier_code ?? c.scac) === id)
    return transformCarrier(found ?? { carrier_code: id })
  }
}
