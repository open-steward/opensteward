import { simpleApiKey } from '@opensteward/shared'
import type {
  LogisticsAdapter,
  Credentials,
} from '../../adapter/interface'
import type { TrackingEvent } from '../../schema/trackingevent'

import { buildAuthUrl, exchangeApiKey, refreshCredentials as doRefresh } from './auth'
import { PostaKeClient } from './client'

import { transformTracking, type PostaKeTracking } from './transform/tracking'

// ── Resource coverage ──────────────────────────────────────────────
// Unverified: carrier   — Posta Kenya API docs are not publicly available; no evidence of a carrier listing endpoint
// Unverified: label     — Posta Kenya API docs are not publicly available; label generation appears routed through third-party aggregators only
// Unverified: manifest  — Posta Kenya API docs are not publicly available; manifestation endpoints not confirmed on the direct API
// Unverified: order     — Posta Kenya API docs are not publicly available; no evidence of an orders endpoint on api.posta.co.ke
// Unverified: rate      — Posta Kenya API docs are not publicly available; third-party integration notes explicitly state rate-shopping is absent
// Unverified: shipment  — Posta Kenya API docs are not publicly available; no evidence of a shipment management endpoint on api.posta.co.ke
// Unverified: warehouse — Posta Kenya API docs are not publicly available; third-party integration notes explicitly state warehouse management is absent

interface PostaKeAdapterConfig {
  sandbox?: boolean
}
const SIMPLE_API_KEY_FORM = simpleApiKey()


export class PostaKeAdapter implements LogisticsAdapter {

  // Connect Link support — single API-key form.

  credentialFields = SIMPLE_API_KEY_FORM.credentialFields

  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'posta-ke'
  readonly version = '1'

  constructor(_config: PostaKeAdapterConfig = {}) {}

  // -- Auth -----------------------------------------------------------------

  getAuthUrl(state: string): string {
    return buildAuthUrl(state)
  }

  async exchangeCode(code: string, _redirectUri: string): Promise<Credentials> {
    return exchangeApiKey(code)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return doRefresh(credentials)
  }

  // -- Tracking Events ------------------------------------------------------

  async getTrackingEvents(credentials: Credentials, trackingNumber: string): Promise<TrackingEvent[]> {
    const client = new PostaKeClient(credentials)
    const raw = await client.get<PostaKeTracking>(`tracking/${trackingNumber}`)
    return transformTracking(raw, trackingNumber)
  }
}
