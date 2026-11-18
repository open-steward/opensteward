import { simpleApiKey } from '@opensteward/shared'
import type {
  LogisticsAdapter,
  Credentials,
} from '../../adapter/interface'
import type { Shipment } from '../../schema/shipment'
import type { TrackingEvent } from '../../schema/trackingevent'
import type { Label } from '../../schema/label'

import { buildAuthUrl, exchangeApiKey, refreshCredentials as doRefresh } from './auth'
import { EvriClient } from './client'

import { transformTracking, type EvriTrackingResponse } from './transform/tracking'
import { transformShipment, type EvriParcel } from './transform/shipment'
import { transformLabel, type EvriLabelResponse } from './transform/label'

// ── Resource coverage ──────────────────────────────────────────────
// Unavailable: carrier    — Evri is a single carrier; no /carriers listing endpoint exists in their API
// Unavailable: manifest   — manifesting is not supported or required by Evri (confirmed via EasyPost and ShipEngine docs)
// Unavailable: order      — Evri API has no orders concept or endpoint
// Unavailable: rate       — Evri does not expose rate quotes via API (confirmed via ShipEngine docs)
// Unavailable: warehouse  — Evri API has no warehouse management endpoints

interface EvriAdapterConfig {
  sandbox?: boolean
}
const SIMPLE_API_KEY_FORM = simpleApiKey()


export class EvriAdapter implements LogisticsAdapter {

  // Connect Link support — single API-key form.

  credentialFields = SIMPLE_API_KEY_FORM.credentialFields

  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'evri'
  readonly version = '1'

  constructor(_config: EvriAdapterConfig = {}) {}

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
    const client = new EvriClient(credentials)
    const raw = await client.get<EvriTrackingResponse>(`parcels/${trackingNumber}/events`)
    return transformTracking(raw)
  }

  // ── Shipments ──────────────────────────────────────────────────────────────

  async createShipment(credentials: Credentials, data: Partial<Shipment>): Promise<Shipment> {
    const client = new EvriClient(credentials)
    const raw = await client.post<EvriParcel>('parcels', {
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

  // ── Labels ─────────────────────────────────────────────────────────────────

  async getLabel(credentials: Credentials, id: string): Promise<Label> {
    const client = new EvriClient(credentials)
    const raw = await client.get<EvriLabelResponse>(`labels/${id}`)
    return transformLabel(raw)
  }
}
