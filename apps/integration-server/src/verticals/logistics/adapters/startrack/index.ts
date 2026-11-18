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
import type { Manifest } from '../../schema/manifest'

import { buildAuthUrl, exchangeApiKey, refreshCredentials as doRefresh } from './auth'
import { StartrackClient } from './client'

import { transformTracking, type StartrackTrackingResponse } from './transform/tracking'
import { transformShipment, type StartrackShipment } from './transform/shipment'
import { transformRate, type StartrackRate } from './transform/rate'
import { transformLabel, type StartrackLabelResponse, type StartrackLabelItem } from './transform/label'
import { transformManifest, type StartrackOrderResponse } from './transform/manifest'

// ── Resource coverage ──────────────────────────────────────────────
// Unavailable: carrier   — StarTrack has no /carriers endpoint; it is itself the single carrier; no carrier listing concept in the AusPost API
// Unavailable: order     — AusPost has no merchant-order resource; their "order" concept is the end-of-day manifest, not a fulfillment order
// Unavailable: warehouse — No /warehouses endpoint exists in the Australia Post Shipping and Tracking API

interface StartrackAdapterConfig {
  sandbox?: boolean
}
const SIMPLE_API_KEY_FORM = simpleApiKey()


export class StartrackAdapter implements LogisticsAdapter {

  // Connect Link support — single API-key form.

  credentialFields = SIMPLE_API_KEY_FORM.credentialFields

  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'startrack'
  readonly version = '1'

  constructor(_config: StartrackAdapterConfig = {}) {}

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
    const client = new StartrackClient(credentials)
    const raw = await client.get<StartrackTrackingResponse>(`tracking/${encodeURIComponent(trackingNumber)}`)
    return transformTracking(raw)
  }

  // ── Shipments ──────────────────────────────────────────────────────────────

  async createShipment(credentials: Credentials, data: Partial<Shipment>): Promise<Shipment> {
    const client = new StartrackClient(credentials)
    const raw = await client.post<StartrackShipment>('shipments', {
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
    const client = new StartrackClient(credentials)
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
    const res = await client.post<{ rates: StartrackRate[] }>('rates', body)
    return (res.rates ?? []).map(transformRate)
  }

  // ── Labels ─────────────────────────────────────────────────────────────────
  // POST /labels — Australia Post Shipping and Tracking API (confirmed)

  async createLabel(credentials: Credentials, data: Partial<Label>): Promise<Label> {
    const client = new StartrackClient(credentials)
    const body = {
      shipments: [
        {
          shipment_id: data.shipmentId,
        },
      ],
      wait_for_label_url: true,
      preferences: [
        {
          type: 'STANDARD',
          format: data.format ?? 'PDF',
          groups: [{ group: 'Parcel Post', layout: 'A4-1pp' }],
        },
      ],
    }
    const res = await client.post<StartrackLabelResponse>('labels', body)
    const first: StartrackLabelItem = (res.labels ?? [])[0] ?? {}
    return transformLabel(first)
  }

  // ── Manifests ──────────────────────────────────────────────────────────────
  // PUT /orders — In AusPost the "order" IS the end-of-day manifest (confirmed)

  async createManifest(credentials: Credentials, data: Partial<Manifest>): Promise<Manifest> {
    const client = new StartrackClient(credentials)
    const body = {
      order: {
        shipments: (data.shipmentIds ?? []).map((id) => ({ shipment_id: id })),
      },
    }
    const res = await client.put<StartrackOrderResponse>('orders', body)
    return transformManifest(res)
  }
}
