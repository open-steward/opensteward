// ── Resource coverage ──────────────────────────────────────────────────────────
// Available:   label, shipment, trackingevent
// Unavailable: carrier     — DPD UK is itself the single carrier; no carrier-listing endpoint exists
// Unavailable: manifest    — DPD UK does not require manifesting (confirmed: EasyPost, ShipEngine, AfterShip)
// Unavailable: order       — DPD UK API has no order-management concept or endpoint
// Unavailable: rate        — DPD UK provides no rates API (confirmed: ShipEngine carrier guide)
// Unavailable: warehouse   — DPD UK API exposes no warehouse/depot listing endpoint

import type {
  LogisticsAdapter,
  Credentials,
} from '../../adapter/interface'
import type { Shipment } from '../../schema/shipment'
import type { TrackingEvent } from '../../schema/trackingevent'
import type { Label } from '../../schema/label'

import { buildAuthUrl, exchangeCredentials, refreshCredentials as doRefresh } from './auth'
import { DpdUkClient } from './client'

import { transformTracking, type DpdUkTrackingResponse } from './transform/tracking'
import { transformShipment, type DpdUkShipmentResponse } from './transform/shipment'
import { transformLabels } from './transform/label'

type DpdUkAdapterConfig = Record<string, unknown>

export class DpdUkAdapter implements LogisticsAdapter {
  readonly platform = 'dpd-uk'
  readonly version = '1'

  private config: DpdUkAdapterConfig

  constructor(config: DpdUkAdapterConfig = {}) {
    this.config = config
  }

  // ── Auth ───────────────────────────────────────────────────────────────────

  getAuthUrl(state: string): string {
    return buildAuthUrl(state)
  }

  async exchangeCode(code: string, _redirectUri: string): Promise<Credentials> {
    // code is "clientId:clientSecret"
    const sepIdx = code.indexOf(':')
    if (sepIdx < 0) throw new Error('DPD-UK exchangeCode expects code as "clientId:clientSecret"')
    const clientId = code.slice(0, sepIdx)
    const clientSecret = code.slice(sepIdx + 1)
    return exchangeCredentials(clientId, clientSecret)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return doRefresh(credentials)
  }

  // ── Tracking Events ────────────────────────────────────────────────────────

  async getTrackingEvents(credentials: Credentials, trackingNumber: string): Promise<TrackingEvent[]> {
    const client = new DpdUkClient(credentials)
    const raw = await client.get<DpdUkTrackingResponse>(`tracking/${trackingNumber}`)
    return transformTracking(raw, trackingNumber)
  }

  // ── Shipments ──────────────────────────────────────────────────────────────

  async createShipment(credentials: Credentials, data: Partial<Shipment>): Promise<Shipment> {
    const client = new DpdUkClient(credentials)
    const raw = await client.post<DpdUkShipmentResponse>('shipments', {
      collectionDate: data.createdAt?.toISOString().slice(0, 10) ?? new Date().toISOString().slice(0, 10),
      networkCode: data.serviceCode ?? '1^01',
      numberOfParcels: data.packages?.length ?? 1,
      totalWeight: data.totalWeight?.value ?? 1,
      deliveryDetails: data.destinationAddress
        ? {
            address: {
              organisation: data.destinationAddress.company,
              countryCode: data.destinationAddress.country,
              postcode: data.destinationAddress.postalCode,
              town: data.destinationAddress.city,
              county: data.destinationAddress.state,
              street: data.destinationAddress.street1,
              locality: data.destinationAddress.street2,
              contactName: data.destinationAddress.name,
              contactTelephone: data.destinationAddress.phone,
              contactEmail: data.destinationAddress.email,
            },
          }
        : undefined,
      collectionDetails: data.originAddress
        ? {
            address: {
              organisation: data.originAddress.company,
              countryCode: data.originAddress.country,
              postcode: data.originAddress.postalCode,
              town: data.originAddress.city,
              county: data.originAddress.state,
              street: data.originAddress.street1,
              locality: data.originAddress.street2,
              contactName: data.originAddress.name,
              contactTelephone: data.originAddress.phone,
              contactEmail: data.originAddress.email,
            },
          }
        : undefined,
      parcels: (data.packages ?? []).map((pkg) => ({
        weight: pkg.weight?.value ?? data.totalWeight?.value ?? 1,
        length: pkg.dimensions?.length,
        width: pkg.dimensions?.width,
        height: pkg.dimensions?.height,
      })),
    })
    return transformShipment(raw)
  }

  // ── Labels ─────────────────────────────────────────────────────────────────

  async getLabel(credentials: Credentials, id: string): Promise<Label> {
    const client = new DpdUkClient(credentials)
    const raw = await client.get<DpdUkShipmentResponse>(`shipments/${id}`)
    const labels = transformLabels(raw)
    if (labels.length === 0) {
      throw new Error(`No labels found on shipment ${id}`)
    }
    return labels[0]
  }
}
