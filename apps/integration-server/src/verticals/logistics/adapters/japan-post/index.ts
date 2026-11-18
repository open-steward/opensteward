// ── Resource coverage ──────────────────────────────────────────────
// Unavailable: carrier   — Japan Post public REST API is tracking-only; no carrier-listing endpoint is publicly documented.
// Unavailable: label     — Label generation requires the contracted WMS Web API (specs in non-public PDF) or a third-party intermediary.
// Unavailable: manifest  — Manifest management is not part of the publicly documented Japan Post REST API.
// Unavailable: order     — Order management is not part of the publicly documented Japan Post REST API.
// Unavailable: rate      — Rate quoting is not part of the publicly documented Japan Post REST API.
// Unavailable: shipment  — Shipment creation/retrieval is not part of the publicly documented Japan Post REST API.
// Unavailable: warehouse — Warehouse management is not part of the publicly documented Japan Post REST API.

import { simpleApiKey } from '@opensteward/shared'
import type {
  LogisticsAdapter,
  Credentials,
  QueryParams,
} from '../../adapter/interface'
import type { TrackingEvent } from '../../schema/trackingevent'

import { buildAuthUrl, exchangeApiKey, refreshCredentials as doRefresh } from './auth'
import { JapanPostClient } from './client'

import { transformTracking, type JapanPostTrackingResponse } from './transform/tracking'
import { transformTrackingEvent, type JapanPostTrackingEvent } from './transform/trackingevent'

interface JapanPostAdapterConfig {
  sandbox?: boolean
}
const SIMPLE_API_KEY_FORM = simpleApiKey()


export class JapanPostAdapter implements LogisticsAdapter {

  // Connect Link support — single API-key form.

  credentialFields = SIMPLE_API_KEY_FORM.credentialFields

  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'japan-post'
  readonly version = '1'

  constructor(_config: JapanPostAdapterConfig = {}) {}

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

  async getTrackingEvents(credentials: Credentials, trackingNumber: string): Promise<TrackingEvent[]> {
    const client = new JapanPostClient(credentials)
    const raw = await client.get<JapanPostTrackingResponse>(`tracking/v1/${trackingNumber}`)
    return transformTracking(raw)
  }

  async listTrackingEvents(credentials: Credentials, params: QueryParams): Promise<TrackingEvent[]> {
    const trackingNumber = String(params['trackingNumber'] ?? params['id'] ?? '')
    if (!trackingNumber) return []
    const client = new JapanPostClient(credentials)
    const raw = await client.get<JapanPostTrackingResponse>(`tracking/v1/${trackingNumber}`)
    const events: JapanPostTrackingEvent[] = raw.events ?? []
    return events.map((evt) => transformTrackingEvent(evt, raw.tracking_number ?? trackingNumber))
  }
}
