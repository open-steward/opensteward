// ── Resource coverage ──────────────────────────────────────────────
// Unavailable: manifest — APC Overnight does not require or support manifesting shipments
// Unavailable: order    — APC Overnight is a carrier-only API with no order management concept
// Unavailable: warehouse — no warehouse or pickup-point API exists in APC Overnight's platform

import { simpleApiKey } from '@opensteward/shared'
import type {
  LogisticsAdapter,
  Credentials,
  QueryParams,
  RateRequestParams,
} from '../../adapter/interface'
import type { Shipment } from '../../schema/shipment'
import type { TrackingEvent } from '../../schema/trackingevent'
import type { Rate } from '../../schema/rate'
import type { Carrier } from '../../schema/carrier'
import type { Label } from '../../schema/label'

import { buildAuthUrl, exchangeApiKey, refreshCredentials as doRefresh } from './auth'
import { ApcOvernightClient } from './client'

import { transformTracking, type ApcOvernightTrackingResponse } from './transform/tracking'
import { transformShipment, type ApcOvernightShipment } from './transform/shipment'
import { transformRate, type ApcOvernightRate } from './transform/rate'
import { transformTrackingEvent, type ApcOvernightTrackingEvent } from './transform/trackingevent'
import { transformCarrier, type ApcOvernightServiceAvailabilityResponse } from './transform/carrier'
import { transformLabel, type ApcOvernightLabelResponse } from './transform/label'

interface ApcOvernightAdapterConfig {
  sandbox?: boolean
}
const SIMPLE_API_KEY_FORM = simpleApiKey()


export class ApcOvernightAdapter implements LogisticsAdapter {

  // Connect Link support — single API-key form.

  credentialFields = SIMPLE_API_KEY_FORM.credentialFields

  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'apc-overnight'
  readonly version = '1'

  constructor(_config: ApcOvernightAdapterConfig = {}) {}

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
    const client = new ApcOvernightClient(credentials)
    const raw = await client.get<ApcOvernightTrackingResponse>(`tracking/${encodeURIComponent(trackingNumber)}`)
    return transformTracking(raw)
  }

  async listTrackingEvents(credentials: Credentials, params: QueryParams): Promise<TrackingEvent[]> {
    const trackingNumber = String(params['trackingNumber'] ?? params['id'] ?? '')
    if (!trackingNumber) return []
    const client = new ApcOvernightClient(credentials)
    const raw = await client.get<ApcOvernightTrackingResponse>(`tracking/${encodeURIComponent(trackingNumber)}`)
    const events: ApcOvernightTrackingEvent[] = raw.events ?? []
    const tn = raw.tracking_number ?? trackingNumber
    const sid = raw.shipment_id ?? undefined
    return events.map((evt) => transformTrackingEvent(evt, tn, sid))
  }

  // ── Shipments ──────────────────────────────────────────────────────────────

  async createShipment(credentials: Credentials, data: Partial<Shipment>): Promise<Shipment> {
    const client = new ApcOvernightClient(credentials)
    const raw = await client.post<ApcOvernightShipment>('shipments', {
      sender: data.originAddress
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
      recipient: data.destinationAddress
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
      service_code: data.serviceCode,
    })
    return transformShipment(raw)
  }

  // ── Rates ──────────────────────────────────────────────────────────────────

  async getRates(credentials: Credentials, params: RateRequestParams): Promise<Rate[]> {
    const client = new ApcOvernightClient(credentials)
    const firstPkg = params.packages[0]
    const body = {
      from: {
        postal_code: params.originAddress.postalCode,
        country: params.originAddress.country,
      },
      to: {
        postal_code: params.destinationAddress.postalCode,
        country: params.destinationAddress.country,
      },
      weight: firstPkg?.weight?.value,
      weight_unit: firstPkg?.weight?.unit,
      length: firstPkg?.dimensions?.length,
      width: firstPkg?.dimensions?.width,
      height: firstPkg?.dimensions?.height,
      service_codes: params.serviceCodes,
    }
    const res = await client.post<{ rates: ApcOvernightRate[] }>('rates', body)
    return (res.rates ?? []).map(transformRate)
  }

  // ── Carriers ───────────────────────────────────────────────────────────────

  async listCarriers(credentials: Credentials, _params: QueryParams): Promise<Carrier[]> {
    const client = new ApcOvernightClient(credentials)
    const raw = await client.get<ApcOvernightServiceAvailabilityResponse>('services')
    return [transformCarrier(raw)]
  }

  async getCarrier(credentials: Credentials, _id: string): Promise<Carrier> {
    const client = new ApcOvernightClient(credentials)
    const raw = await client.get<ApcOvernightServiceAvailabilityResponse>('services')
    return transformCarrier(raw)
  }

  // ── Labels ─────────────────────────────────────────────────────────────────

  async getLabel(credentials: Credentials, id: string): Promise<Label> {
    const client = new ApcOvernightClient(credentials)
    const raw = await client.get<ApcOvernightLabelResponse>(`labels/${encodeURIComponent(id)}`)
    return transformLabel(raw)
  }

  async createLabel(credentials: Credentials, data: Partial<Label>): Promise<Label> {
    const client = new ApcOvernightClient(credentials)
    const raw = await client.post<ApcOvernightLabelResponse>('labels', {
      consignment_id: data.shipmentId ?? data.id,
      tracking_number: data.trackingNumber,
      format: data.format ?? 'PDF',
    })
    return transformLabel(raw)
  }
}
