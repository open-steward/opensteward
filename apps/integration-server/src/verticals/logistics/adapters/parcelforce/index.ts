// ── Resource coverage ──────────────────────────────────────────────
// Available (built/derived): carrier, label, shipment, trackingevent
// Unavailable: order — Parcelforce is a carrier-only service with no order management concept
// Unavailable: rate — Parcelforce does not expose estimated rates via its API (confirmed by ShipEngine docs)
// Unavailable: warehouse — Parcelforce has no warehouse management concept
// Unverified:  manifest — SOAP API has createManifest but no confirmed REST endpoint at api.parcelforce.net/v1/manifests

import { simpleApiKey } from '@opensteward/shared'
import type {
  LogisticsAdapter,
  Credentials,
  QueryParams,
} from '../../adapter/interface'
import type { Shipment } from '../../schema/shipment'
import type { TrackingEvent } from '../../schema/trackingevent'
import type { Carrier } from '../../schema/carrier'
import type { Label } from '../../schema/label'

import { buildAuthUrl, exchangeApiKey, refreshCredentials as doRefresh } from './auth'
import { ParcelforceClient } from './client'

import { transformTracking, type ParcelforceTrackingResponse } from './transform/tracking'
import { transformShipment, type ParcelforceShipment } from './transform/shipment'
import { transformCarrier } from './transform/carrier'
import { transformLabel, type ParcelforceLabel } from './transform/label'

interface ParcelforceAdapterConfig {
  sandbox?: boolean
}
const SIMPLE_API_KEY_FORM = simpleApiKey()


export class ParcelforceAdapter implements LogisticsAdapter {

  // Connect Link support — single API-key form.

  credentialFields = SIMPLE_API_KEY_FORM.credentialFields

  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'parcelforce'
  readonly version = '1'

  constructor(_config: ParcelforceAdapterConfig = {}) {}

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

  // ── Carrier ────────────────────────────────────────────────────────────────
  // Parcelforce is itself the single carrier; derived as a static record.

  async listCarriers(_credentials: Credentials, _params: QueryParams): Promise<Carrier[]> {
    return [transformCarrier()]
  }

  async getCarrier(_credentials: Credentials, _id: string): Promise<Carrier> {
    return transformCarrier()
  }

  // ── Labels ─────────────────────────────────────────────────────────────────
  // Labels are derived from the shipment creation response (label_url field).

  async getLabel(credentials: Credentials, id: string): Promise<Label> {
    const client = new ParcelforceClient(credentials)
    const raw = await client.get<ParcelforceLabel>(`shipments/${id}`)
    return transformLabel(raw)
  }

  async createLabel(credentials: Credentials, data: Partial<Label>): Promise<Label> {
    const client = new ParcelforceClient(credentials)
    const raw = await client.post<ParcelforceLabel>('shipments', {
      service_code: data.serviceCode,
      label_format: data.format,
    })
    return transformLabel(raw)
  }

  // ── Tracking Events ────────────────────────────────────────────────────────

  async getTrackingEvents(credentials: Credentials, trackingNumber: string): Promise<TrackingEvent[]> {
    const client = new ParcelforceClient(credentials)
    const raw = await client.get<ParcelforceTrackingResponse>(`tracking/${trackingNumber}`)
    return transformTracking(raw)
  }

  // ── Shipments ──────────────────────────────────────────────────────────────

  async createShipment(credentials: Credentials, data: Partial<Shipment>): Promise<Shipment> {
    const client = new ParcelforceClient(credentials)
    const raw = await client.post<ParcelforceShipment>('shipments', {
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
