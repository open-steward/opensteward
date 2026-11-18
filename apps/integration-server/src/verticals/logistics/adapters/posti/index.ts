// ── Resource coverage ──────────────────────────────────────────────
// Available:   shipment, trackingevent
// Unavailable: carrier — no carrier listing endpoint exists in any Posti REST API
// Unavailable: label — labels embedded in shipment response as label_url; no standalone /labels endpoint
// Unavailable: manifest — no manifest endpoint exists in any Posti REST API
// Unavailable: rate — no rate quoting endpoint; Nextshipping shipping-methods uses separate auth
// Unverified:  order — Orders API exists at ecom-api.posti.com/ecommerce/v3/orders (OAuth), different base URL and auth from this adapter's api.posti.fi/v3/ API key client
// Unverified:  warehouse — Warehouses API exists at ecom-api.posti.com/v2/warehouses (OAuth), different base URL and auth from this adapter's api.posti.fi/v3/ API key client

import { simpleApiKey } from '@opensteward/shared'
import type {
  LogisticsAdapter,
  Credentials,
} from '../../adapter/interface'
import type { Shipment } from '../../schema/shipment'
import type { TrackingEvent } from '../../schema/trackingevent'

import { buildAuthUrl, exchangeApiKey, refreshCredentials as doRefresh } from './auth'
import { PostiClient } from './client'

import { transformTracking, type PostiTrackingResponse } from './transform/tracking'
import { transformShipment, type PostiShipment } from './transform/shipment'

interface PostiAdapterConfig {
  sandbox?: boolean
}
const SIMPLE_API_KEY_FORM = simpleApiKey()


export class PostiAdapter implements LogisticsAdapter {

  // Connect Link support — single API-key form.

  credentialFields = SIMPLE_API_KEY_FORM.credentialFields

  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'posti'
  readonly version = '1'

  constructor(_config: PostiAdapterConfig = {}) {}

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
    const client = new PostiClient(credentials)
    const raw = await client.get<PostiTrackingResponse>(`tracking/${trackingNumber}`)
    return transformTracking(raw)
  }

  // ── Shipments ──────────────────────────────────────────────────────────────

  async createShipment(credentials: Credentials, data: Partial<Shipment>): Promise<Shipment> {
    const client = new PostiClient(credentials)
    const raw = await client.post<PostiShipment>('shipments', {
      sender: data.originAddress
        ? {
            name: data.originAddress.name,
            company: data.originAddress.company,
            street1: data.originAddress.street1,
            street2: data.originAddress.street2,
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
            street1: data.destinationAddress.street1,
            street2: data.destinationAddress.street2,
            city: data.destinationAddress.city,
            postal_code: data.destinationAddress.postalCode,
            country: data.destinationAddress.country,
            phone: data.destinationAddress.phone,
            email: data.destinationAddress.email,
          }
        : undefined,
      weight: data.totalWeight
        ? { value: data.totalWeight.value, unit: data.totalWeight.unit }
        : undefined,
      reference: data.reference,
      service_code: data.serviceCode,
    })
    return transformShipment(raw)
  }
}
