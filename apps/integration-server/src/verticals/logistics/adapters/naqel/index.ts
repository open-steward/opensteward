import { simpleApiKey } from '@opensteward/shared'
import type {
  LogisticsAdapter,
  Credentials,
} from '../../adapter/interface'
import type { Shipment } from '../../schema/shipment'
import type { TrackingEvent } from '../../schema/trackingevent'
import type { Label } from '../../schema/label'

import { buildAuthUrl, exchangeApiKey, refreshCredentials as doRefresh } from './auth'
import { NaqelClient } from './client'

import { transformTracking, type NaqelTracking } from './transform/tracking'
import { transformShipment, type NaqelShipment } from './transform/shipment'
import { transformLabel } from './transform/label'

// ── Resource coverage ──────────────────────────────────────────────
// Unavailable:  carrier    — Naqel is a single-carrier platform; no carrier-listing endpoint exists in any API version
// Unverified:   rate       — SOAP API exposes GetRate but the v2 REST API base used by this adapter has no public docs confirming a /rates endpoint
// Unverified:   order      — SOAP API exposes GetPickupOrders but the v2 REST API base has no public docs confirming an /orders endpoint
// Unverified:   manifest   — SOAP API exposes GetDispatchInfo but the v2 REST API base has no public docs confirming a /manifests endpoint
// Unverified:   warehouse  — no warehouse endpoint found in any Naqel API version; docs are behind login

interface NaqelAdapterConfig {
  sandbox?: boolean
}
const SIMPLE_API_KEY_FORM = simpleApiKey()


export class NaqelAdapter implements LogisticsAdapter {

  // Connect Link support — single API-key form.

  credentialFields = SIMPLE_API_KEY_FORM.credentialFields

  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'naqel'
  readonly version = '1'

  constructor(_config: NaqelAdapterConfig = {}) {}

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
    const client = new NaqelClient(credentials)
    const raw = await client.get<NaqelTracking>(`tracking/${trackingNumber}`)
    return transformTracking(raw, trackingNumber)
  }

  // ── Labels ─────────────────────────────────────────────────────────────────
  // Labels are derived from shipment responses — the `label_url` field on a
  // NaqelShipment carries the hosted PDF sticker URL (no dedicated endpoint).

  async getLabel(credentials: Credentials, id: string): Promise<Label> {
    const client = new NaqelClient(credentials)
    const raw = await client.get<NaqelShipment>(`shipments/${id}`)
    return transformLabel(raw)
  }

  // ── Shipments ──────────────────────────────────────────────────────────────

  async createShipment(credentials: Credentials, data: Partial<Shipment>): Promise<Shipment> {
    const client = new NaqelClient(credentials)
    const raw = await client.post<NaqelShipment>('shipments', {
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
}
