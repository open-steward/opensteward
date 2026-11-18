import { simpleApiKey } from '@opensteward/shared'
import type {
  LogisticsAdapter,
  Credentials,
} from '../../adapter/interface'
import type { Shipment } from '../../schema/shipment'
import type { TrackingEvent } from '../../schema/trackingevent'

import { buildAuthUrl, exchangeApiKey, refreshCredentials as doRefresh } from './auth'
import { GlobegisticsClient } from './client'

import { transformTracking, type GlobegisticsTrackingResponse } from './transform/tracking'
import { transformShipment, type GlobegisticsShipment } from './transform/shipment'

// ── Resource coverage ──────────────────────────────────────────────────────
// Unavailable:  carrier   — single-carrier postal service; no carrier list endpoint exists in their API
// Unavailable:  order     — carrier/postal service; no order management endpoints exist in their API
// Unavailable:  warehouse — carrier/postal service; no warehouse management endpoints exist in their API
// Unverified:   label     — supports labels (Shippo carrier capabilities) but native API docs are behind authentication
// Unverified:   manifest  — supports manifests (Shippo carrier capabilities) but native API docs are behind authentication
// Unverified:   rate      — supports rate quoting (Shippo carrier capabilities) but native API docs are behind authentication

interface GlobegisticsAdapterConfig {
  sandbox?: boolean
}
const SIMPLE_API_KEY_FORM = simpleApiKey()


export class GlobegisticsAdapter implements LogisticsAdapter {

  // Connect Link support — single API-key form.

  credentialFields = SIMPLE_API_KEY_FORM.credentialFields

  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'globegistics'
  readonly version = '1'

  constructor(_config: GlobegisticsAdapterConfig = {}) {}

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
    const client = new GlobegisticsClient(credentials)
    const raw = await client.get<GlobegisticsTrackingResponse>(`tracking/${trackingNumber}`)
    return transformTracking(raw)
  }

  // ── Shipments ──────────────────────────────────────────────────────────────

  async createShipment(credentials: Credentials, data: Partial<Shipment>): Promise<Shipment> {
    const client = new GlobegisticsClient(credentials)
    const raw = await client.post<GlobegisticsShipment>('shipments', {
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
      weight_unit: data.totalWeight?.unit ?? 'oz',
      service_code: data.serviceCode,
      reference: data.reference,
    })
    return transformShipment(raw)
  }
}
