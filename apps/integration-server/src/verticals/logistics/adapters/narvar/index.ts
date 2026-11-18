// ── Resource coverage ──────────────────────────────────────────────────────────
// Available:   trackingevent
// Unavailable: carrier       — no carrier management API; carriers are configured in Narvar Hub dashboard only
// Unavailable: manifest      — no manifest concept; Narvar is a post-purchase notification platform, not a carrier manifest system
// Unavailable: rate          — no rate-shopping functionality; Narvar does not provide shipping rate quotes
// Unavailable: shipment      — no GET shipment endpoints; shipment data is POST-only inside order push payload
// Unavailable: warehouse     — no fulfillment warehouse concept; /api/return_locations covers public drop-off points only
// Unverified:  label         — Returns Label API exists at ws.narvar.com (Basic Auth) but uses a different base URL and auth scheme than this adapter; cannot safely unify without confirmed credential compatibility
// Unverified:  order         — Order API is documented as push-only (POST); no public GET list/retrieve endpoint found; full docs behind login wall

import { simpleApiKey } from '@opensteward/shared'
import type {
  LogisticsAdapter,
  Credentials,
  QueryParams,
} from '../../adapter/interface'
import type { TrackingEvent } from '../../schema/trackingevent'

import { buildAuthUrl, exchangeApiKey, refreshCredentials as doRefresh } from './auth'
import { NarvarClient } from './client'
import { transformTracking, type NarvarTrackingEventRaw } from './transform/tracking'

interface NarvarAdapterConfig { sandbox?: boolean }
const SIMPLE_API_KEY_FORM = simpleApiKey()

export class NarvarAdapter implements LogisticsAdapter {
  credentialFields = SIMPLE_API_KEY_FORM.credentialFields
  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'narvar'
  readonly version = '1'

  constructor(_config: NarvarAdapterConfig = {}) {}

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
    const client = new NarvarClient(credentials)
    const raw = await client.get<NarvarTrackingEventRaw>(`/tracking/${trackingNumber}`)
    return transformTracking({ ...raw, tracking_number: raw.tracking_number ?? trackingNumber })
  }

  async listTrackingEvents(credentials: Credentials, params: QueryParams): Promise<TrackingEvent[]> {
    const client = new NarvarClient(credentials)
    const raw = await client.get<{ events?: NarvarTrackingEventRaw[] }>('/tracking', {
      page: params.page ?? 1,
      limit: params.limit ?? 20,
      updated_after: params.updatedAfter?.toISOString(),
    })
    return (raw.events ?? []).flatMap((e) => transformTracking(e))
  }
}
