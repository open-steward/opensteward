// ── Resource coverage ──────────────────────────────────────────────
// Unavailable: carrier   — Deutsche Post DPI v1 has no /carriers endpoint; Deutsche Post is the sole carrier.
// Unavailable: manifest  — DPI v1 has no /manifests endpoint; POST /orders/{id}/finalize produces AWB labels, not a manifest.
// Unavailable: order     — DPI v1 only exposes POST /orders (create) and POST /orders/{id}/finalize; no GET list/get endpoints exist.
// Unavailable: warehouse — Warehouse management is a separate DHL Supply Chain product with its own credentials and base URL.

import type {
  LogisticsAdapter,
  Credentials,
  RateRequestParams,
} from '../../adapter/interface'
import type { Shipment } from '../../schema/shipment'
import type { TrackingEvent } from '../../schema/trackingevent'
import type { Rate } from '../../schema/rate'
import type { Label } from '../../schema/label'

import { buildAuthUrl, exchangeCredentials, refreshCredentials as doRefresh } from './auth'
import { DeutschePostClient } from './client'

import { transformRate, type DeutschePostRatesResponse } from './transform/rate'
import { transformTrackingEvents, type DeutschePostTrackingResponse } from './transform/tracking'
import { transformShipment, type DeutschePostShipmentResponse } from './transform/shipment'
import { transformLabel, type DeutschePostLabelResponse } from './transform/label'

export interface DeutschePostAdapterConfig {
  clientId?: string
  clientSecret?: string
  sandbox?: boolean
}

export class DeutschePostAdapter implements LogisticsAdapter {
  readonly platform = 'deutschepost'
  readonly version = '1'

  private config: DeutschePostAdapterConfig

  constructor(config: DeutschePostAdapterConfig = {}) {
    this.config = config
  }

  // ── Auth ───────────────────────────────────────────────────────────────────

  getAuthUrl(state: string): string {
    return buildAuthUrl(state)
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    if (!this.config.clientId || !this.config.clientSecret) {
      throw new Error('deutschepost: clientId and clientSecret are required')
    }
    return exchangeCredentials({
      clientId: this.config.clientId,
      clientSecret: this.config.clientSecret,
      sandbox: this.config.sandbox,
    })
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return doRefresh(credentials)
  }

  // ── Rates ──────────────────────────────────────────────────────────────────

  async getRates(credentials: Credentials, params: RateRequestParams): Promise<Rate[]> {
    const client = new DeutschePostClient(credentials)
    const res = await client.get<DeutschePostRatesResponse>('/products/prices', {
      originCountry: params.originAddress.country,
      destinationCountry: params.destinationAddress.country,
      weight: params.packages[0]?.weight?.value,
    })
    return (res.products ?? []).map(transformRate)
  }

  // ── Tracking Events ────────────────────────────────────────────────────────

  async getTrackingEvents(credentials: Credentials, trackingNumber: string): Promise<TrackingEvent[]> {
    const client = new DeutschePostClient(credentials)
    const res = await client.get<DeutschePostTrackingResponse>(`/shipments/${trackingNumber}/tracking`)
    return transformTrackingEvents(res)
  }

  // ── Shipments ──────────────────────────────────────────────────────────────

  async createShipment(credentials: Credentials, data: Partial<Shipment>): Promise<Shipment> {
    const client = new DeutschePostClient(credentials)

    const body = {
      product: data.serviceCode,
      sender: {
        name: data.originAddress?.name,
        company: data.originAddress?.company,
        addressLine1: data.originAddress?.street1,
        addressLine2: data.originAddress?.street2,
        city: data.originAddress?.city,
        state: data.originAddress?.state,
        postalCode: data.originAddress?.postalCode,
        countryCode: data.originAddress?.country,
      },
      recipient: {
        name: data.destinationAddress?.name,
        company: data.destinationAddress?.company,
        addressLine1: data.destinationAddress?.street1,
        addressLine2: data.destinationAddress?.street2,
        city: data.destinationAddress?.city,
        state: data.destinationAddress?.state,
        postalCode: data.destinationAddress?.postalCode,
        countryCode: data.destinationAddress?.country,
      },
      weight: data.totalWeight
        ? { value: data.totalWeight.value, unit: data.totalWeight.unit }
        : undefined,
    }

    const res = await client.post<DeutschePostShipmentResponse>('/shipments', body)
    return transformShipment(res)
  }

  async cancelShipment(credentials: Credentials, id: string): Promise<void> {
    const client = new DeutschePostClient(credentials)
    await client.delete(`/shipments/${id}`)
  }

  // ── Labels ─────────────────────────────────────────────────────────────────

  async createLabel(credentials: Credentials, data: Partial<Label>): Promise<Label> {
    const client = new DeutschePostClient(credentials)
    const shipmentId = data.shipmentId ?? data.id
    const res = await client.post<DeutschePostLabelResponse>(`/shipments/${shipmentId}/labels`, {
      format: data.format ?? 'PDF',
    })
    return transformLabel(res)
  }
}
