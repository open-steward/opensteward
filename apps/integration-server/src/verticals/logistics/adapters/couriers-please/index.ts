// ── Resource coverage ──────────────────────────────────────────────
// Unavailable: carrier    — single-carrier service; no carrier-listing API endpoint
// Unavailable: manifest   — manifesting not supported or required (confirmed by ShipEngine + EasyPost docs)
// Unavailable: order      — no order management concept or orders endpoint in the API
// Unavailable: warehouse  — no warehouse management concept or endpoint in the API

import { simpleApiKey } from '@opensteward/shared'
import type {
  LogisticsAdapter,
  Credentials,
  RateRequestParams,
} from '../../adapter/interface'
import type { Shipment } from '../../schema/shipment'
import type { TrackingEvent } from '../../schema/trackingevent'
import type { Rate } from '../../schema/rate'
import type { Label } from '../../schema/label'

import { buildAuthUrl, exchangeApiKey, refreshCredentials as doRefresh } from './auth'
import { CouriersPleaseClient } from './client'

import { transformTracking, type CouriersPleaseTrackingResponse } from './transform/tracking'
import { transformShipment, type CouriersPleaseShipment } from './transform/shipment'
import { transformRate, type CouriersPleaseRate } from './transform/rate'
import { transformLabel } from './transform/label'

interface CouriersPleaseAdapterConfig {
  sandbox?: boolean
}
const SIMPLE_API_KEY_FORM = simpleApiKey()


export class CouriersPleaseAdapter implements LogisticsAdapter {

  // Connect Link support — single API-key form.

  credentialFields = SIMPLE_API_KEY_FORM.credentialFields

  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'couriers-please'
  readonly version = '1'

  constructor(_config: CouriersPleaseAdapterConfig = {}) {}

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
    const client = new CouriersPleaseClient(credentials)
    const raw = await client.get<CouriersPleaseTrackingResponse>(`tracking/${encodeURIComponent(trackingNumber)}`)
    return transformTracking(raw)
  }

  // ── Shipments ──────────────────────────────────────────────────────────────

  async createShipment(credentials: Credentials, data: Partial<Shipment>): Promise<Shipment> {
    const client = new CouriersPleaseClient(credentials)
    const raw = await client.post<CouriersPleaseShipment>('shipments', {
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
    const client = new CouriersPleaseClient(credentials)
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
    const res = await client.post<{ rates: CouriersPleaseRate[] }>('rates', body)
    return (res.rates ?? []).map(transformRate)
  }

  // ── Labels ─────────────────────────────────────────────────────────────────

  /**
   * Couriers Please labels are embedded in the shipment response as `label_url`.
   * `getLabel` fetches the shipment and projects the label fields.
   */
  async getLabel(credentials: Credentials, id: string): Promise<Label> {
    const client = new CouriersPleaseClient(credentials)
    const raw = await client.get<CouriersPleaseShipment>(`shipments/${id}`)
    return transformLabel(raw)
  }

  async createLabel(credentials: Credentials, data: Partial<Label>): Promise<Label> {
    if (!data.shipmentId) throw new Error('CouriersPlease createLabel requires a shipmentId')
    const client = new CouriersPleaseClient(credentials)
    const raw = await client.get<CouriersPleaseShipment>(`shipments/${data.shipmentId}`)
    return transformLabel(raw)
  }
}
