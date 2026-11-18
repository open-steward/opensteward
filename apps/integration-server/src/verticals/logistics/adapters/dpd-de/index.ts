// ── Resource coverage ──────────────────────────────────────────────
// Unavailable: manifest  — DPD Germany does not require manifesting; no manifest endpoint exists
// Unavailable: order     — DPD DE is a parcel carrier with no order management concept or endpoint
// Unavailable: rate      — DPD Germany does not support rate shopping via API (no rates endpoint)
// Unavailable: warehouse — DPD DE has no depot or warehouse listing endpoint in its API
// Built:       carrier   — derived static record (DPD DE is itself the single carrier)

import type {
  LogisticsAdapter,
  Credentials,
  QueryParams,
} from '../../adapter/interface'
import type { Shipment } from '../../schema/shipment'
import type { TrackingEvent } from '../../schema/trackingevent'
import type { Label } from '../../schema/label'
import type { Carrier } from '../../schema/carrier'

import { buildAuthUrl, exchangeCredentials, refreshCredentials as doRefresh } from './auth'
import { DpdDeClient } from './client'

import { transformTracking, type DpdDeTrackingResponse } from './transform/tracking'
import { transformShipment, type DpdDeShipmentResponse } from './transform/shipment'
import { transformLabels } from './transform/label'
import { transformCarrier } from './transform/carrier'

type DpdDeAdapterConfig = Record<string, unknown>

export class DpdDeAdapter implements LogisticsAdapter {
  readonly platform = 'dpd-de'
  readonly version = '1'

  private config: DpdDeAdapterConfig

  constructor(config: DpdDeAdapterConfig = {}) {
    this.config = config
  }

  // ── Auth ───────────────────────────────────────────────────────────────────

  getAuthUrl(state: string): string {
    return buildAuthUrl(state)
  }

  async exchangeCode(code: string, _redirectUri: string): Promise<Credentials> {
    // code is "clientId:clientSecret"
    const sepIdx = code.indexOf(':')
    if (sepIdx < 0) throw new Error('DPD-DE exchangeCode expects code as "clientId:clientSecret"')
    const clientId = code.slice(0, sepIdx)
    const clientSecret = code.slice(sepIdx + 1)
    return exchangeCredentials(clientId, clientSecret)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return doRefresh(credentials)
  }

  // ── Tracking Events ────────────────────────────────────────────────────────

  async getTrackingEvents(credentials: Credentials, trackingNumber: string): Promise<TrackingEvent[]> {
    const client = new DpdDeClient(credentials)
    const raw = await client.get<DpdDeTrackingResponse>(`tracking/${trackingNumber}`)
    return transformTracking(raw, trackingNumber)
  }

  // ── Shipments ──────────────────────────────────────────────────────────────

  async createShipment(credentials: Credentials, data: Partial<Shipment>): Promise<Shipment> {
    const client = new DpdDeClient(credentials)
    const raw = await client.post<DpdDeShipmentResponse>('shipments', {
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
    const client = new DpdDeClient(credentials)
    const raw = await client.get<DpdDeShipmentResponse>(`shipments/${id}`)
    const labels = transformLabels(raw)
    if (labels.length === 0) {
      throw new Error(`No labels found on shipment ${id}`)
    }
    return labels[0]
  }

  // ── Carriers ───────────────────────────────────────────────────────────────
  //
  // DPD Germany does not expose a carrier listing API.
  // The adapter itself represents a single carrier; the record is derived
  // from publicly known constants.

  async listCarriers(_credentials: Credentials, _params: QueryParams): Promise<Carrier[]> {
    return [transformCarrier()]
  }

  async getCarrier(_credentials: Credentials, _id: string): Promise<Carrier> {
    return transformCarrier()
  }
}
