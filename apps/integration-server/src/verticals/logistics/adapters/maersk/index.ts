// ── Resource coverage ──────────────────────────────────────────────────────────
// Available:   shipment, trackingevent
// Unavailable: carrier  — Maersk is itself a single ocean carrier; no carrier-listing endpoint exists.
// Unavailable: order    — No order management endpoint in any Maersk API product.
// Unavailable: warehouse — No warehouse management endpoint in any Maersk API product.
// Unverified:  rate     — MGF Ratings API (api.maersk.com/mgf/public-gateway/ratings) confirmed but
//                         requires account-specific locationId + tariffCode (CoPilot settings) not in
//                         the standard RateRequestParams; response schema behind authenticated portal.
// Unverified:  label    — MGF Label Creation API confirmed at delivers.maersk.com but the 2023 PDF
//                         spec resolves to a SOAP/WSDL endpoint; REST paths and field names are not
//                         publicly accessible without a CoPilot account.
// Unverified:  manifest — PackageHub (docs.packagehub.mec.maersk.com) has POST /Manifest and
//                         GET /Manifest but uses a separate JWT auth (POST /Account/Token to
//                         visiblescm.com) incompatible with this adapter's OAuth credentials.
// ──────────────────────────────────────────────────────────────────────────────
import type { LogisticsAdapter, Credentials } from '../../adapter/interface'
import type { TrackingEvent } from '../../schema/trackingevent'

import { buildAuthUrl, exchangeCode as doExchangeCode, refreshCredentials as doRefresh } from './auth'
import { MaerskClient } from './client'
import { transformTracking, type MaerskTrackingResponse } from './transform/tracking'

interface MaerskAdapterConfig {
  sandbox?: boolean
}

export class MaerskAdapter implements LogisticsAdapter {
  readonly platform = 'maersk'
  readonly version = '1'

  constructor(_config: MaerskAdapterConfig = {}) {}

  getAuthUrl(state: string): string {
    return buildAuthUrl(state)
  }

  async exchangeCode(code: string, redirectUri: string): Promise<Credentials> {
    return doExchangeCode(code, redirectUri)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return doRefresh(credentials)
  }

  async getTrackingEvents(credentials: Credentials, trackingNumber: string): Promise<TrackingEvent[]> {
    const client = new MaerskClient(credentials)
    const raw = await client.get<MaerskTrackingResponse>('track-and-trace-private/events', {
      containerNumber: trackingNumber,
    })
    return transformTracking(raw)
  }
}
