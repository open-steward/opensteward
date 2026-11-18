// ── Resource coverage ──────────────────────────────────────────────────────
// Available:   label, shipment, trackingevent
// Unavailable: carrier    — GLS exposes no carrier-listing endpoint; it is itself the single carrier.
// Unavailable: manifest   — POST /endofday is a day-close procedure, not a retrievable manifest resource; no list/get endpoint exists.
// Unavailable: order      — GLS has no order management API; the platform processes parcels only.
// Unavailable: rate       — POST /allowedservices returns service names only, no pricing or transit-time estimates.
// Unavailable: warehouse  — GLS has no warehouse management API; depot operations are internal and not exposed publicly.

import type {
  LogisticsAdapter,
  Credentials,
} from '../../adapter/interface'
import type { Shipment } from '../../schema/shipment'
import type { TrackingEvent } from '../../schema/trackingevent'
import type { Label } from '../../schema/label'

import { buildAuthUrl, exchangeApiKey, refreshCredentials as doRefresh } from './auth'
import { GlsClient } from './client'

import { transformShipment, type GlsShipment } from './transform/shipment'
import { transformTracking, type GlsTracking } from './transform/tracking'
import { transformLabels } from './transform/label'

interface GlsAdapterConfig {
  sandbox?: boolean
}

export class GlsAdapter implements LogisticsAdapter {
  readonly platform = 'gls'
  readonly version = '1'

  constructor(_config: GlsAdapterConfig = {}) {}

  // ── Auth ───────────────────────────────────────────────────────────────────

  getAuthUrl(state: string): string {
    return buildAuthUrl(state)
  }

  async exchangeCode(code: string, _redirectUri: string): Promise<Credentials> {
    // For GLS the "code" is the "contactId:password" pair.
    return exchangeApiKey(code)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return doRefresh(credentials)
  }

  // ── Tracking Events ────────────────────────────────────────────────────────

  async getTrackingEvents(credentials: Credentials, trackingNumber: string): Promise<TrackingEvent[]> {
    const client = new GlsClient(credentials)
    const raw = await client.get<GlsTracking>(`tracking/references/${trackingNumber}`)
    return transformTracking(raw, trackingNumber)
  }

  // ── Shipments ──────────────────────────────────────────────────────────────

  async createShipment(credentials: Credentials, data: Partial<Shipment>): Promise<Shipment> {
    const client = new GlsClient(credentials)
    const raw = await client.post<GlsShipment>('shipments', {
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
    const client = new GlsClient(credentials)
    const raw = await client.get<GlsShipment>(`shipments/${id}`)
    const labels = transformLabels(raw)
    if (labels.length === 0) {
      throw new Error(`No labels found on shipment ${id}`)
    }
    return labels[0]
  }
}
