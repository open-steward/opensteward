// ── Resource coverage ──────────────────────────────────────────────
// Unavailable: carrier   — Hong Kong Post is itself a single national postal carrier; no carrier-management REST endpoint exists in the /v1/ API.
// Unavailable: label     — Label generation (getAddressPack) is SOAP-only (EC-Ship API); the public REST /v1/ API has no label endpoint.
// Unavailable: manifest  — No manifest concept exists in either the EC-Ship SOAP API or the REST /v1/ API.
// Unavailable: order     — Order operations (createOrder, getOrderInfo) are SOAP-only; not available via the REST /v1/ endpoint.
// Unavailable: rate      — Postage calculation (getTotalPostage) is SOAP-only (EC-Ship Postage API); not available via REST /v1/.
// Unavailable: shipment  — No shipment resource exists in the REST /v1/ API; all shipment operations are SOAP-only.
// Unavailable: warehouse — Hong Kong Post is a postal service with no warehouse management API.

import { simpleApiKey } from '@opensteward/shared'
import type {
  LogisticsAdapter,
  Credentials,
} from '../../adapter/interface'
import type { TrackingEvent } from '../../schema/trackingevent'

import { buildAuthUrl, exchangeApiKey, refreshCredentials as doRefresh } from './auth'
import { HongkongPostClient } from './client'

import { transformTracking, type HongkongPostTrackingResponse } from './transform/tracking'

interface HongkongPostAdapterConfig {
  sandbox?: boolean
}
const SIMPLE_API_KEY_FORM = simpleApiKey()


export class HongkongPostAdapter implements LogisticsAdapter {

  // Connect Link support — single API-key form.

  credentialFields = SIMPLE_API_KEY_FORM.credentialFields

  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'hongkong-post'
  readonly version = '1'

  constructor(_config: HongkongPostAdapterConfig = {}) {}

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

  // ── Tracking Events (only operation supported) ─────────────────────────────

  async getTrackingEvents(credentials: Credentials, trackingNumber: string): Promise<TrackingEvent[]> {
    const client = new HongkongPostClient(credentials)
    const raw = await client.get<HongkongPostTrackingResponse>(`tracking/${trackingNumber}`)
    return transformTracking(raw)
  }
}
