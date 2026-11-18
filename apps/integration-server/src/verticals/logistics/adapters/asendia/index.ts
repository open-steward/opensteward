import { simpleApiKey } from '@opensteward/shared'
import type {
  LogisticsAdapter,
  Credentials,
  RateRequestParams,
} from '../../adapter/interface'
import type { Shipment } from '../../schema/shipment'
import type { TrackingEvent } from '../../schema/trackingevent'
import type { Rate } from '../../schema/rate'

import { buildAuthUrl, exchangeApiKey, refreshCredentials as doRefresh } from './auth'
import { AsendiaClient } from './client'

import { transformTracking, type AsendiaTrackingResponse } from './transform/tracking'
import { transformShipment, type AsendiaShipment } from './transform/shipment'
import { transformRate, type AsendiaRate } from './transform/rate'

// ── Resource coverage ──────────────────────────────────────────────────────────
// Available:   rate, shipment, trackingevent
// Unavailable: carrier    — Asendia is itself a carrier; no carrier directory endpoint exists
// Unavailable: label      — Labels are per-parcel binary document streams (PDF/image); no structured list/get JSON endpoint
// Unavailable: order      — Pure carrier; no order management concept (confirmed via Asendia Sync Swagger)
// Unavailable: warehouse  — No warehouse management concept (confirmed via Asendia Sync Swagger)
// Unverified:  manifest   — Asendia Sync (asendia-sync.com) has /api/manifests but api.asendia.com/v1/ manifest support is not publicly documented

interface AsendiaAdapterConfig {
  sandbox?: boolean
}
const SIMPLE_API_KEY_FORM = simpleApiKey()


export class AsendiaAdapter implements LogisticsAdapter {

  // Connect Link support — single API-key form.

  credentialFields = SIMPLE_API_KEY_FORM.credentialFields

  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'asendia'
  readonly version = '1'

  constructor(_config: AsendiaAdapterConfig = {}) {}

  // ── Auth ───────────────────────────────────────────────────��───────────────

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
    const client = new AsendiaClient(credentials)
    const raw = await client.get<AsendiaTrackingResponse>(`tracking/${trackingNumber}`)
    return transformTracking(raw)
  }

  // ── Shipments ──────────────────────────────────────────────────────────────

  async createShipment(credentials: Credentials, data: Partial<Shipment>): Promise<Shipment> {
    const client = new AsendiaClient(credentials)
    const raw = await client.post<AsendiaShipment>('shipments', {
      sender: data.originAddress
        ? {
            name: data.originAddress.name,
            company: data.originAddress.company,
            address_line1: data.originAddress.street1,
            address_line2: data.originAddress.street2,
            city: data.originAddress.city,
            state: data.originAddress.state,
            postal_code: data.originAddress.postalCode,
            country: data.originAddress.country,
            phone: data.originAddress.phone,
            email: data.originAddress.email,
          }
        : undefined,
      recipient: data.destinationAddress
        ? {
            name: data.destinationAddress.name,
            company: data.destinationAddress.company,
            address_line1: data.destinationAddress.street1,
            address_line2: data.destinationAddress.street2,
            city: data.destinationAddress.city,
            state: data.destinationAddress.state,
            postal_code: data.destinationAddress.postalCode,
            country: data.destinationAddress.country,
            phone: data.destinationAddress.phone,
            email: data.destinationAddress.email,
          }
        : undefined,
      weight: data.totalWeight?.value,
      weight_unit: data.totalWeight?.unit ?? 'g',
      service_code: data.serviceCode,
      reference: data.reference,
    })
    return transformShipment(raw)
  }

  // ── Rates ───────────────────────────────────��───────────────────────────��─

  async getRates(credentials: Credentials, params: RateRequestParams): Promise<Rate[]> {
    const client = new AsendiaClient(credentials)
    const raw = await client.post<{ rates: AsendiaRate[] }>('rates', {
      origin: params.originAddress,
      destination: params.destinationAddress,
      packages: params.packages,
      service_codes: params.serviceCodes,
    })
    return (raw.rates ?? []).map(transformRate)
  }
}
