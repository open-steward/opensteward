// ── Resource coverage ──────────────────────────────────────────────────────
// Unavailable: order     — GLS-DE is a carrier-only service; no order management concept or endpoint exists
// Unavailable: rate      — getAllowedServices returns service codes only, no pricing data; no rate/quote endpoint
// Unavailable: warehouse — no warehouse/depot management endpoint; ParcelShop endpoints are customer pickup points only

import type {
  LogisticsAdapter,
  Credentials,
} from '../../adapter/interface'
import type { Shipment } from '../../schema/shipment'
import type { TrackingEvent } from '../../schema/trackingevent'
import type { Label } from '../../schema/label'
import type { Carrier } from '../../schema/carrier'
import type { Manifest } from '../../schema/manifest'

import { buildAuthUrl, exchangeApiKey, refreshCredentials as doRefresh } from './auth'
import { GlsDeClient } from './client'

import { transformShipment, type GlsDeShipment } from './transform/shipment'
import { transformTracking, type GlsDeTracking } from './transform/tracking'
import { transformLabels } from './transform/label'
import { transformCarrier } from './transform/carrier'
import { transformManifest, type GlsDeEndOfDayResponse } from './transform/manifest'

interface GlsDeAdapterConfig {
  sandbox?: boolean
}

export class GlsDeAdapter implements LogisticsAdapter {
  readonly platform = 'gls-de'
  readonly version = '1'

  constructor(_config: GlsDeAdapterConfig = {}) {}

  // ── Auth ───────────────────────────────────────────────────────────────────

  getAuthUrl(state: string): string {
    return buildAuthUrl(state)
  }

  async exchangeCode(code: string, _redirectUri: string): Promise<Credentials> {
    // For GLS-DE the "code" is the "contactId:password" pair.
    return exchangeApiKey(code)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return doRefresh(credentials)
  }

  // ── Tracking Events ────────────────────────────────────────────────────────

  async getTrackingEvents(credentials: Credentials, trackingNumber: string): Promise<TrackingEvent[]> {
    const client = new GlsDeClient(credentials)
    const raw = await client.get<GlsDeTracking>(`tracking/${trackingNumber}`)
    return transformTracking(raw, trackingNumber)
  }

  // ── Shipments ──────────────────────────────────────────────────────────────

  async createShipment(credentials: Credentials, data: Partial<Shipment>): Promise<Shipment> {
    const client = new GlsDeClient(credentials)
    const raw = await client.post<GlsDeShipment>('shipments', {
      shipper: data.originAddress
        ? {
            name: data.originAddress.name,
            company: data.originAddress.company,
            street1: data.originAddress.street1,
            street2: data.originAddress.street2,
            city: data.originAddress.city,
            state: data.originAddress.state,
            postal_code: data.originAddress.postalCode,
            country: data.originAddress.country,
            phone: data.originAddress.phone,
            email: data.originAddress.email,
          }
        : undefined,
      receiver: data.destinationAddress
        ? {
            name: data.destinationAddress.name,
            company: data.destinationAddress.company,
            street1: data.destinationAddress.street1,
            street2: data.destinationAddress.street2,
            city: data.destinationAddress.city,
            state: data.destinationAddress.state,
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
      serviceCode: data.serviceCode,
    })
    return transformShipment(raw)
  }

  // ── Labels ─────────────────────────────────────────────────────────────────

  async getLabel(credentials: Credentials, id: string): Promise<Label> {
    const client = new GlsDeClient(credentials)
    const raw = await client.get<GlsDeShipment>(`shipments/${id}`)
    const labels = transformLabels(raw)
    if (labels.length === 0) {
      throw new Error(`No labels found on shipment ${id}`)
    }
    return labels[0]
  }

  // ── Carriers ───────────────────────────────────────────────────────────────

  async listCarriers(_credentials: Credentials): Promise<Carrier[]> {
    // GLS-DE is a single-carrier adapter; the carrier record is synthesised
    // from known constants — there is no carrier-list endpoint in the API.
    return [transformCarrier()]
  }

  async getCarrier(_credentials: Credentials, _id: string): Promise<Carrier> {
    return transformCarrier()
  }

  // ── Manifests ──────────────────────────────────────────────────────────────

  async createManifest(credentials: Credentials, data: Partial<Manifest>): Promise<Manifest> {
    const client = new GlsDeClient(credentials)
    // GLS ShipIT exposes end-of-day as POST /endofday?date=YYYY-MM-DD
    const date = data.createdAt
      ? new Date(data.createdAt).toISOString().slice(0, 10)
      : new Date().toISOString().slice(0, 10)
    const raw = await client.post<GlsDeEndOfDayResponse>(`endofday?date=${date}`, {})
    return transformManifest(raw, date)
  }
}
