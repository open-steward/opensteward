// ── Resource coverage ──────────────────────────────────────────────
// Unverified: carrier   — API docs behind private enterprise portal (api.cjlogistics.com refuses public connections)
// Unverified: label     — API docs behind private enterprise portal (api.cjlogistics.com refuses public connections)
// Unverified: manifest  — API docs behind private enterprise portal (api.cjlogistics.com refuses public connections)
// Unverified: order     — API docs behind private enterprise portal (api.cjlogistics.com refuses public connections)
// Unverified: rate      — API docs behind private enterprise portal (api.cjlogistics.com refuses public connections)
// Unverified: warehouse — API docs behind private enterprise portal (api.cjlogistics.com refuses public connections)

import { simpleApiKey } from '@opensteward/shared'
import type {
  LogisticsAdapter,
  Credentials,
} from '../../adapter/interface'
import type { Shipment } from '../../schema/shipment'
import type { TrackingEvent } from '../../schema/trackingevent'

import { buildAuthUrl, exchangeApiKey, refreshCredentials as doRefresh } from './auth'
import { CjLogisticsClient } from './client'

import { transformTracking, type CjLogisticsTrackingResponse } from './transform/tracking'
import { transformShipment, type CjLogisticsShipment } from './transform/shipment'

interface CjLogisticsAdapterConfig {
  sandbox?: boolean
}
const SIMPLE_API_KEY_FORM = simpleApiKey()


export class CjLogisticsAdapter implements LogisticsAdapter {

  // Connect Link support — single API-key form.

  credentialFields = SIMPLE_API_KEY_FORM.credentialFields

  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'cjlogistics'
  readonly version = '1'

  constructor(_config: CjLogisticsAdapterConfig = {}) {}

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
    const client = new CjLogisticsClient(credentials)
    const raw = await client.get<CjLogisticsTrackingResponse>(`tracking/${trackingNumber}`)
    return transformTracking(raw)
  }

  // ── Shipments ──────────────────────────────────────────────────────────────

  async createShipment(credentials: Credentials, data: Partial<Shipment>): Promise<Shipment> {
    const client = new CjLogisticsClient(credentials)
    const raw = await client.post<CjLogisticsShipment>('shipments', {
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
      weight_unit: data.totalWeight?.unit ?? 'kg',
      service_code: data.serviceCode,
      reference: data.reference,
    })
    return transformShipment(raw)
  }
}
