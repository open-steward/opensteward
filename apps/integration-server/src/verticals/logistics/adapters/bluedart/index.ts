import { simpleApiKey } from '@opensteward/shared'
import type {
  LogisticsAdapter,
  Credentials,
} from '../../adapter/interface'
import type { Shipment } from '../../schema/shipment'
import type { TrackingEvent } from '../../schema/trackingevent'
import type { Label } from '../../schema/label'

import { buildAuthUrl, exchangeApiKey, refreshCredentials as doRefresh } from './auth'
import { BlueDartClient } from './client'

import { transformTracking, type BlueDartTrackingResponse } from './transform/tracking'
import { transformShipment, type BlueDartShipment } from './transform/shipment'
import { transformLabel } from './transform/label'

// ── Resource coverage ──────────────────────────────────────────────
// Unavailable: carrier   — BlueDart is a single carrier; no API endpoint exists to list carriers
// Unavailable: manifest  — No dedicated manifest endpoint in the BlueDart REST/SOAP API
// Unavailable: order     — BlueDart has no order management API; platform covers shipping and tracking only
// Unavailable: rate      — Transit Time Finder returns EDD only, not pricing; no rate-quote endpoint confirmed
// Unavailable: warehouse — BlueDart has no warehouse management API

interface BlueDartAdapterConfig {
  sandbox?: boolean
}
const SIMPLE_API_KEY_FORM = simpleApiKey()


export class BlueDartAdapter implements LogisticsAdapter {

  // Connect Link support — single API-key form.

  credentialFields = SIMPLE_API_KEY_FORM.credentialFields

  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'bluedart'
  readonly version = '1'

  constructor(_config: BlueDartAdapterConfig = {}) {}

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

  async getTrackingEvents(credentials: Credentials, waybillNumber: string): Promise<TrackingEvent[]> {
    const client = new BlueDartClient(credentials)
    const raw = await client.get<BlueDartTrackingResponse>(`tracking/awb/${waybillNumber}`)
    return transformTracking(raw)
  }

  // ── Labels (derived from shipment/waybill) ─────────────────────────────────

  async getLabel(credentials: Credentials, id: string): Promise<Label> {
    const client = new BlueDartClient(credentials)
    const raw = await client.get<BlueDartShipment>(`shipments/${id}`)
    return transformLabel(raw)
  }

  async createLabel(credentials: Credentials, data: Partial<Label>): Promise<Label> {
    const client = new BlueDartClient(credentials)
    const raw = await client.post<BlueDartShipment>('shipments', {
      service_code: data.serviceCode,
    })
    return transformLabel(raw)
  }

  // ── Shipments ──────────────────────────────────────────────────────────────

  async createShipment(credentials: Credentials, data: Partial<Shipment>): Promise<Shipment> {
    const client = new BlueDartClient(credentials)
    const raw = await client.post<BlueDartShipment>('shipments', {
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
