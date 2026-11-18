import { simpleApiKey } from '@opensteward/shared'
import type {
  LogisticsAdapter,
  Credentials,
} from '../../adapter/interface'
import type { Shipment } from '../../schema/shipment'
import type { TrackingEvent } from '../../schema/trackingevent'
import type { Label } from '../../schema/label'

import { buildAuthUrl, exchangeApiKey, refreshCredentials as doRefresh } from './auth'
import { StarkenClient } from './client'

import { transformTracking, type StarkenTrackingResponse } from './transform/tracking'
import { transformShipment, type StarkenEnvio } from './transform/shipment'
import { transformLabel } from './transform/label'

// ── Resource coverage ──────────────────────────────────────────────────────
// Available:   shipment, trackingevent, label (derived from shipment)
// Unavailable: carrier — Starken is a single-carrier platform; no carriers list endpoint exists
// Unavailable: order   — Starken is a carrier-only platform with no order management API
// Unverified:  rate    — A rate endpoint exists at gateway.starken.cl/quote/cotizador but cannot be confirmed at the adapter base URL api.starken.cl/v1/
// Unverified:  manifest — No public documentation found; official API docs are gated
// Unverified:  warehouse — Agency/city data exists at gateway.starken.cl/agency/city but cannot be confirmed at the adapter base URL api.starken.cl/v1/

interface StarkenAdapterConfig {
  sandbox?: boolean
}
const SIMPLE_API_KEY_FORM = simpleApiKey()


export class StarkenAdapter implements LogisticsAdapter {

  // Connect Link support — single API-key form.

  credentialFields = SIMPLE_API_KEY_FORM.credentialFields

  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'starken'
  readonly version = '1'

  constructor(_config: StarkenAdapterConfig = {}) {}

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
    const client = new StarkenClient(credentials)
    const raw = await client.get<StarkenTrackingResponse>(`envios/${trackingNumber}/seguimiento`)
    return transformTracking(raw)
  }

  // ── Labels (derived from shipment) ────────────────────────────────────────
  // Starken embeds the label URL inside the shipment response (label_url).
  // A dedicated labels endpoint is not documented; labels are derived here.

  async getLabel(credentials: Credentials, id: string): Promise<Label> {
    const client = new StarkenClient(credentials)
    const raw = await client.get<StarkenEnvio>(`envios/${id}`)
    return transformLabel(raw)
  }

  // ── Shipments ──────────────────────────────────────────────────────────────

  async createShipment(credentials: Credentials, data: Partial<Shipment>): Promise<Shipment> {
    const client = new StarkenClient(credentials)
    const raw = await client.post<StarkenEnvio>('envios', {
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
