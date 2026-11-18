// ── Resource coverage ──────────────────────────────────────────────
// Unavailable: label    — Macropoint is a freight-visibility platform; it does not generate or manage shipping labels.
// Unavailable: manifest — No manifest management; platform is scoped to tracking-session lifecycle on loads.
// Unavailable: order    — No order-management API; loads are tracking sessions, not purchase/fulfillment orders.
// Unavailable: rate     — Macropoint is visibility-only and provides no rate-quote APIs.
// Unavailable: warehouse — No warehouse/location-directory endpoints; stop locations are embedded in load payloads only.
// Unverified:  carrier  — API docs are behind a login portal; no public /carriers endpoint confirmed on api.macropoint.com/v2.

import { simpleApiKey } from '@opensteward/shared'
import type {
  LogisticsAdapter,
  Credentials,
  QueryParams,
} from '../../adapter/interface'
import type { Shipment } from '../../schema/shipment'
import type { TrackingEvent } from '../../schema/trackingevent'

import { buildAuthUrl, exchangeApiKey, refreshCredentials as doRefresh } from './auth'
import { MacropointClient } from './client'

import { transformTrackingEvents, type MacropointTrackingResponse } from './transform/tracking'
import { transformShipment, type MacropointShipmentResponse } from './transform/shipment'

interface MacropointAdapterConfig {
  sandbox?: boolean
}
const SIMPLE_API_KEY_FORM = simpleApiKey()


export class MacropointAdapter implements LogisticsAdapter {

  // Connect Link support — single API-key form.

  credentialFields = SIMPLE_API_KEY_FORM.credentialFields

  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'macropoint'
  readonly version = '1'

  constructor(_config: MacropointAdapterConfig = {}) {}

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

  async getTrackingEvents(credentials: Credentials, loadId: string): Promise<TrackingEvent[]> {
    const client = new MacropointClient(credentials)
    const raw = await client.get<MacropointTrackingResponse>(`/loads/${loadId}/tracking`)
    return transformTrackingEvents(raw)
  }

  // ── Shipments ──────────────────────────────────────────────────────────────

  async listShipments(credentials: Credentials, params: QueryParams): Promise<Shipment[]> {
    const client = new MacropointClient(credentials)
    const res = await client.get<{ loads: MacropointShipmentResponse[] }>('/loads', {
      page: params.page,
      limit: params.limit,
    })
    return (res.loads ?? []).map(transformShipment)
  }

  async createShipment(credentials: Credentials, data: Partial<Shipment>): Promise<Shipment> {
    const client = new MacropointClient(credentials)

    const body = {
      serviceType: data.serviceCode,
      origin: {
        name: data.originAddress?.name,
        company: data.originAddress?.company,
        address: data.originAddress?.street1,
        city: data.originAddress?.city,
        state: data.originAddress?.state,
        zipCode: data.originAddress?.postalCode,
        country: data.originAddress?.country,
        phone: data.originAddress?.phone,
        email: data.originAddress?.email,
      },
      destination: {
        name: data.destinationAddress?.name,
        company: data.destinationAddress?.company,
        address: data.destinationAddress?.street1,
        city: data.destinationAddress?.city,
        state: data.destinationAddress?.state,
        zipCode: data.destinationAddress?.postalCode,
        country: data.destinationAddress?.country,
        phone: data.destinationAddress?.phone,
        email: data.destinationAddress?.email,
      },
      weight: data.totalWeight
        ? { value: data.totalWeight.value, unit: data.totalWeight.unit === 'kg' ? 'KG' : 'LBS' }
        : undefined,
    }

    const res = await client.post<MacropointShipmentResponse>('/loads', body)
    return transformShipment(res)
  }
}
