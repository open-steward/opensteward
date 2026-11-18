// ── Resource coverage ──────────────────────────────────────────────
// Unavailable: order     — Canpar is a parcel carrier with no order management concept
// Unavailable: warehouse — Canpar has no warehouse or depot listing endpoint
// Unverified:  manifest  — Canpar requires End of Day manifesting via SOAP; no confirmed REST endpoint path under .svc wrapper
// Built:       carrier   — derived static record (Canpar is itself the single carrier)
// Built:       rate      — getRates implemented via CanshipBusinessService.svc/ws/rate

import type {
  LogisticsAdapter,
  Credentials,
  RateRequestParams,
  QueryParams,
} from '../../adapter/interface'
import type { Shipment } from '../../schema/shipment'
import type { TrackingEvent } from '../../schema/trackingevent'
import type { Rate } from '../../schema/rate'
import type { Label } from '../../schema/label'
import type { Carrier } from '../../schema/carrier'

import { buildAuthUrl, exchangeApiKey, refreshCredentials as doRefresh } from './auth'
import { CanparClient } from './client'

import { transformTracking, type CanparTrackingResponse } from './transform/tracking'
import { transformShipment, type CanparShipment } from './transform/shipment'
import { transformLabel } from './transform/label'
import { transformRate, type CanparRate } from './transform/rate'
import { transformCarrier } from './transform/carrier'

interface CanparAdapterConfig {
  sandbox?: boolean
}

export class CanparAdapter implements LogisticsAdapter {
  readonly platform = 'canpar'
  readonly version = '1'

  constructor(_config: CanparAdapterConfig = {}) {}

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
    const client = new CanparClient(credentials)
    const raw = await client.post<CanparTrackingResponse>(
      'CanparAddonsService.svc/ws/business',
      { barcode: trackingNumber },
    )
    return transformTracking(raw)
  }

  // ── Shipments ──────────────────────────────────────────────────────────────

  async createShipment(credentials: Credentials, data: Partial<Shipment>): Promise<Shipment> {
    const client = new CanparClient(credentials)
    const raw = await client.post<CanparShipment>('CanshipBusinessService.svc/ws/business', {
      pickup_address: data.originAddress
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
      delivery_address: data.destinationAddress
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
      reported_weight: data.totalWeight?.value,
      weight_unit: data.totalWeight?.unit,
      user_reference: data.reference,
      service_type: data.serviceCode,
    })
    return transformShipment(raw)
  }

  // ── Rates ──────────────────────────────────────────────────────────────────

  async getRates(credentials: Credentials, params: RateRequestParams): Promise<Rate[]> {
    const client = new CanparClient(credentials)
    const raw = await client.post<{ rates?: CanparRate[] }>('CanshipBusinessService.svc/ws/rate', {
      origin: params.originAddress,
      destination: params.destinationAddress,
      packages: params.packages,
    })
    return (raw.rates ?? []).map(transformRate)
  }

  // ── Carriers ───────────────────────────────────────────────────────────────

  async listCarriers(_credentials: Credentials, _params: QueryParams): Promise<Carrier[]> {
    return [transformCarrier()]
  }

  async getCarrier(_credentials: Credentials, _id: string): Promise<Carrier> {
    return transformCarrier()
  }

  // ── Labels (waybills) ──────────────────────────────────────────────────────

  /**
   * Canpar does not expose a standalone /labels endpoint; the waybill PDF
   * is returned as `label_url` on the shipment object. `createLabel` fetches
   * the shipment and projects its waybill fields.
   */
  async createLabel(credentials: Credentials, data: Partial<Label>): Promise<Label> {
    if (!data.shipmentId) throw new Error('Canpar createLabel requires a shipmentId')
    const client = new CanparClient(credentials)
    const raw = await client.post<CanparShipment>(
      'CanshipBusinessService.svc/ws/business',
      { shipment_id: data.shipmentId, action: 'getShipment' },
    )
    return transformLabel(raw)
  }

  async getLabel(credentials: Credentials, id: string): Promise<Label> {
    const client = new CanparClient(credentials)
    const raw = await client.post<CanparShipment>(
      'CanshipBusinessService.svc/ws/business',
      { shipment_id: id, action: 'getShipment' },
    )
    return transformLabel(raw)
  }
}
