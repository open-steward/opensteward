// ── Resource coverage ──────────────────────────────────────────────
// Unavailable: carrier   — Skynet is itself the sole carrier; no carrier-listing endpoint exists in the API
// Unavailable: manifest  — no dedicated /manifests endpoint; manifestation is embedded in shipment creation
// Unavailable: order     — Skynet is a courier, not an OMS; no order management API documented
// Unavailable: rate      — no rate-quoting endpoint found in public or partner documentation
// Unavailable: warehouse — Skynet is a courier, not a WMS; no warehouse management API documented
// Derived:     label     — label URL is returned inside the shipment creation response (label_url field)

import { simpleApiKey } from '@opensteward/shared'
import type {
  LogisticsAdapter,
  Credentials,
} from '../../adapter/interface'
import type { Shipment } from '../../schema/shipment'
import type { TrackingEvent } from '../../schema/trackingevent'
import type { Label } from '../../schema/label'

import { buildAuthUrl, exchangeApiKey, refreshCredentials as doRefresh } from './auth'
import { SkynetClient } from './client'

import { transformTracking, type SkynetTracking } from './transform/tracking'
import { transformShipment, type SkynetShipment } from './transform/shipment'
import { transformLabel } from './transform/label'

interface SkynetAdapterConfig {
  sandbox?: boolean
}
const SIMPLE_API_KEY_FORM = simpleApiKey()


export class SkynetAdapter implements LogisticsAdapter {

  // Connect Link support — single API-key form.

  credentialFields = SIMPLE_API_KEY_FORM.credentialFields

  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'skynet'
  readonly version = '1'

  constructor(_config: SkynetAdapterConfig = {}) {}

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
    const client = new SkynetClient(credentials)
    const raw = await client.get<SkynetTracking>(`tracking/${trackingNumber}`)
    return transformTracking(raw, trackingNumber)
  }

  // ── Shipments ──────────────────────────────────────────────────────────────

  async createShipment(credentials: Credentials, data: Partial<Shipment>): Promise<Shipment> {
    const client = new SkynetClient(credentials)
    const raw = await client.post<SkynetShipment>('shipments', {
      sender: data.originAddress
        ? {
            name: data.originAddress.name,
            company: data.originAddress.company,
            address_line1: data.originAddress.street1,
            address_line2: data.originAddress.street2,
            city: data.originAddress.city,
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

  // ── Labels (derived from shipment response) ────────────────────────────────

  async createLabel(credentials: Credentials, data: Partial<Label>): Promise<Label> {
    const client = new SkynetClient(credentials)
    const raw = await client.post<SkynetShipment>('shipments', {
      sender: undefined,
      recipient: undefined,
      service_code: data.serviceCode,
    })
    return transformLabel(raw)
  }

  async getLabel(credentials: Credentials, id: string): Promise<Label> {
    const client = new SkynetClient(credentials)
    const raw = await client.get<SkynetShipment>(`shipments/${id}`)
    return transformLabel(raw)
  }
}
