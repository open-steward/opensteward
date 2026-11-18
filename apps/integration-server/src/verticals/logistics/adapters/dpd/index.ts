// ── Resource coverage ──────────────────────────────────────────────
// Unavailable: order — DPD is a pure carrier; no order management concept or endpoint
// Unavailable: rate — DPD UK does not provide a Rates API (confirmed; no quote endpoint)
// Unavailable: warehouse — DPD does not expose depot/warehouse resources via the API

import type { LogisticsAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { Shipment } from '../../schema/shipment'
import type { TrackingEvent } from '../../schema/trackingevent'
import type { Manifest } from '../../schema/manifest'
import type { Label } from '../../schema/label'
import type { Carrier } from '../../schema/carrier'

import { buildAuthUrl, exchangeCredentials, refreshCredentials as doRefresh } from './auth'
import { DPDClient } from './client'

import { transformTracking, type DPDTrackingResponse } from './transform/tracking'
import { transformShipment, type DPDShipmentResponse } from './transform/shipment'
import { transformManifest, type DPDManifestResponse } from './transform/manifest'
import { transformLabel, type DPDLabelResponse } from './transform/label'
import { transformSelfCarrier } from './transform/carrier'
import { pageLocally } from '@opensteward/shared'

type DPDAdapterConfig = Record<string, unknown>

export class DPDAdapter implements LogisticsAdapter {
  readonly platform = 'dpd'
  readonly version = '1'

  private config: DPDAdapterConfig

  constructor(config: DPDAdapterConfig = {}) {
    this.config = config
  }

  // ── Auth ───────────────────────────────────────────────────────────────────

  getAuthUrl(state: string): string {
    return buildAuthUrl(state)
  }

  async exchangeCode(code: string, _redirectUri: string): Promise<Credentials> {
    // code is "userid:password"
    const sepIdx = code.indexOf(':')
    if (sepIdx < 0) throw new Error('DPD exchangeCode expects code as "userid:password"')
    const userid = code.slice(0, sepIdx)
    const password = code.slice(sepIdx + 1)
    return exchangeCredentials(userid, password)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return doRefresh(credentials)
  }

  // ── Tracking Events ────────────────────────────────────────────────────────

  async getTrackingEvents(
    credentials: Credentials,
    trackingNumber: string,
  ): Promise<TrackingEvent[]> {
    const client = new DPDClient(credentials)
    const raw = await client.get<DPDTrackingResponse>(`tracking/${trackingNumber}`)
    return transformTracking(raw, trackingNumber)
  }

  // ── Shipments ──────────────────────────────────────────────────────────────

  async createShipment(credentials: Credentials, data: Partial<Shipment>): Promise<Shipment> {
    const client = new DPDClient(credentials)
    const raw = await client.post<DPDShipmentResponse>('shipments', {
      collectionDate:
        data.createdAt?.toISOString().slice(0, 10) ?? new Date().toISOString().slice(0, 10),
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

  // ── Manifests ──────────────────────────────────────────────────────────────

  async createManifest(credentials: Credentials, data: Partial<Manifest>): Promise<Manifest> {
    const client = new DPDClient(credentials)
    const raw = await client.post<DPDManifestResponse>('manifests', {
      shipmentIds: data.shipmentIds,
    })
    return transformManifest(raw)
  }

  // ── Labels ─────────────────────────────────────────────────────────────────

  async getLabel(credentials: Credentials, shipmentId: string): Promise<Label> {
    const client = new DPDClient(credentials)
    const raw = await client.get<DPDLabelResponse>(`shipments/${shipmentId}/label`)
    return transformLabel(raw, shipmentId)
  }

  // ── Carriers ───────────────────────────────────────────────────────────────

  // DPD is the only carrier here, so the collection is its static
  // self-descriptor, paged locally and served with no request. The API's
  // /shipping/network/ looks up the services for one collection/delivery lane
  // (it refuses a call without collectionDetails.address.postcode); it is not
  // a list of carriers. The old GET /v1/network did not exist (404).
  async listCarriers(_credentials: Credentials, params: QueryParams): Promise<Carrier[]> {
    return pageLocally([transformSelfCarrier()], params)
  }
}
