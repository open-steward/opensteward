// ── Resource coverage ──────────────────────────────────────────────────────
// Unavailable: carrier  — Mondial Relay is a single carrier; the API has no carrier-listing endpoint.
// Unavailable: manifest — No manifest/end-of-day close endpoint in the SOAP or REST API.
// Unavailable: order    — Carrier-only API; order management is not part of their API surface.
// Unavailable: warehouse — Only relay-point (pickup-point) search exists; no merchant warehouse endpoint.

import type {
  LogisticsAdapter,
  Credentials,
  RateRequestParams,
} from '../../adapter/interface'
import type { Shipment } from '../../schema/shipment'
import type { TrackingEvent } from '../../schema/trackingevent'
import type { Label } from '../../schema/label'
import type { Rate } from '../../schema/rate'

import { buildAuthUrl, exchangeApiKey, refreshCredentials as doRefresh } from './auth'
import { MondialRelayClient } from './client'

import { transformTracking, type MondialRelayTrackingResponse } from './transform/tracking'
import { transformShipment, type MondialRelayShipment } from './transform/shipment'
import { transformLabels } from './transform/label'
import { transformRate, extractRates, type MondialRelayRatesResponse } from './transform/rate'

interface MondialRelayAdapterConfig {
  sandbox?: boolean
}

export class MondialRelayAdapter implements LogisticsAdapter {
  readonly platform = 'mondialrelay'
  readonly version = '1'

  constructor(_config: MondialRelayAdapterConfig = {}) {}

  // ── Auth ───────────────────────────────────────────────────────────────────

  getAuthUrl(state: string): string {
    return buildAuthUrl(state)
  }

  async exchangeCode(code: string, _redirectUri: string): Promise<Credentials> {
    // For Mondial Relay the "code" is the "siteId:key" pair.
    return exchangeApiKey(code)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return doRefresh(credentials)
  }

  // ── Tracking Events ────────────────────────────────────────────────────────

  async getTrackingEvents(credentials: Credentials, trackingNumber: string): Promise<TrackingEvent[]> {
    const client = new MondialRelayClient(credentials)
    const raw = await client.get<MondialRelayTrackingResponse>(`shipments/${trackingNumber}/tracking`)
    return transformTracking(raw)
  }

  // ── Shipments ──────────────────────────────────────────────────────────────

  async createShipment(credentials: Credentials, data: Partial<Shipment>): Promise<Shipment> {
    const client = new MondialRelayClient(credentials)
    const raw = await client.post<MondialRelayShipment>('shipments', {
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
    const client = new MondialRelayClient(credentials)
    const raw = await client.get<MondialRelayShipment>(`shipments/${id}`)
    const labels = transformLabels(raw)
    if (labels.length === 0) {
      throw new Error(`No labels found on shipment ${id}`)
    }
    return labels[0]
  }

  // ── Rates ──────────────────────────────────────────────────────────────────

  /**
   * Request shipping rates from Mondial Relay. The rates endpoint accepts
   * origin country + postal code, destination country + postal code, weight,
   * and returns available relay service offers with pricing.
   */
  async getRates(credentials: Credentials, params: RateRequestParams): Promise<Rate[]> {
    const client = new MondialRelayClient(credentials)
    const body: Record<string, unknown> = {
      from: params.originAddress
        ? {
            countryCode: params.originAddress.country,
            postalCode: params.originAddress.postalCode,
            city: params.originAddress.city,
          }
        : undefined,
      to: params.destinationAddress
        ? {
            countryCode: params.destinationAddress.country,
            postalCode: params.destinationAddress.postalCode,
            city: params.destinationAddress.city,
          }
        : undefined,
      weight: params.packages?.[0]?.weight
        ? {
            value: params.packages[0].weight.value,
            unit: params.packages[0].weight.unit,
          }
        : undefined,
    }
    const raw = await client.post<MondialRelayRatesResponse>('rates', body)
    return extractRates(raw).map(transformRate)
  }
}
