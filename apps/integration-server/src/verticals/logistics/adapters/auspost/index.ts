// ── Resource coverage ──────────────────────────────────────────────
// Unavailable: carrier — AusPost is a single carrier; no carrier-config endpoint exists in the API
// Unavailable: warehouse — AusPost has no warehouse/facility management API

import type {
  LogisticsAdapter,
  Credentials,
  RateRequestParams,
} from '../../adapter/interface'
import type { Shipment } from '../../schema/shipment'
import type { TrackingEvent } from '../../schema/trackingevent'
import type { Rate } from '../../schema/rate'
import type { Label } from '../../schema/label'
import type { Order } from '../../schema/order'
import type { Manifest } from '../../schema/manifest'

import { buildAuthUrl, exchangeCredentials, refreshCredentials as doRefresh } from './auth'
import { AusPostClient } from './client'

import { transformRate, type AusPostRateResult } from './transform/rate'
import { transformTrackingEvents, type AusPostTrackingResponse } from './transform/tracking'
import { transformShipment, type AusPostCreateShipmentResponse } from './transform/shipment'
import { transformLabel, type AusPostLabelsResponse } from './transform/label'
import {
  transformOrder,
  type AusPostCreateOrderResponse,
  type AusPostOrderResponse,
} from './transform/order'
import { transformManifest } from './transform/manifest'

export interface AusPostAdapterConfig {
  clientId?: string
  clientSecret?: string
  sandbox?: boolean
}

export class AusPostAdapter implements LogisticsAdapter {
  readonly platform = 'auspost'
  readonly version = '1'

  private config: AusPostAdapterConfig

  constructor(config: AusPostAdapterConfig = {}) {
    this.config = config
  }

  // ── Auth ───────────────────────────────────────────────────────────────────

  getAuthUrl(state: string): string {
    return buildAuthUrl(state)
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    if (!this.config.clientId || !this.config.clientSecret) {
      throw new Error('auspost: clientId and clientSecret are required')
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
    const client = new AusPostClient(credentials)
    const firstPkg = params.packages[0]

    const body = {
      from_postcode: params.originAddress.postalCode,
      to_postcode: params.destinationAddress.postalCode,
      length: firstPkg?.dimensions?.length,
      width: firstPkg?.dimensions?.width,
      height: firstPkg?.dimensions?.height,
      weight: firstPkg?.weight?.value,
    }

    const res = await client.post<{ services: AusPostRateResult[] }>('/postage/parcel/domestic/calculate', body)
    return (res.services ?? []).map(transformRate)
  }

  // ── Tracking Events ────────────────────────────────────────────────────────

  async getTrackingEvents(credentials: Credentials, trackingNumber: string): Promise<TrackingEvent[]> {
    const client = new AusPostClient(credentials)
    const res = await client.get<AusPostTrackingResponse>('/shipping/v1/track', {
      tracking_ids: trackingNumber,
    })
    const results = res.tracking_results ?? []
    return results.flatMap(transformTrackingEvents)
  }

  // ── Shipments ──────────────────────────────────────────────────────────────

  async createShipment(credentials: Credentials, data: Partial<Shipment>): Promise<Shipment> {
    const client = new AusPostClient(credentials)

    const body = {
      shipments: [
        {
          service_code: data.serviceCode,
          from: {
            name: data.originAddress?.name,
            company: data.originAddress?.company,
            lines: [data.originAddress?.street1, data.originAddress?.street2].filter(Boolean),
            suburb: data.originAddress?.city,
            state: data.originAddress?.state,
            postcode: data.originAddress?.postalCode,
            country: data.originAddress?.country,
            phone: data.originAddress?.phone,
            email: data.originAddress?.email,
          },
          to: {
            name: data.destinationAddress?.name,
            company: data.destinationAddress?.company,
            lines: [data.destinationAddress?.street1, data.destinationAddress?.street2].filter(Boolean),
            suburb: data.destinationAddress?.city,
            state: data.destinationAddress?.state,
            postcode: data.destinationAddress?.postalCode,
            country: data.destinationAddress?.country,
            phone: data.destinationAddress?.phone,
            email: data.destinationAddress?.email,
          },
          items: [
            {
              weight: data.totalWeight?.value,
            },
          ],
        },
      ],
    }

    const res = await client.post<AusPostCreateShipmentResponse>('/shipping/v1/shipments', body)
    const shipment = res.shipments?.[0]
    if (!shipment) {
      throw new Error('Australia Post createShipment returned no shipments')
    }
    return transformShipment(shipment)
  }

  async cancelShipment(credentials: Credentials, id: string): Promise<void> {
    const client = new AusPostClient(credentials)
    await client.delete(`/shipping/v1/shipments/${id}`)
  }

  // ── Orders ─────────────────────────────────────────────────────────────────
  // AusPost uses PUT /shipping/v1/orders to group shipments into a dispatchable order.

  async createOrder(credentials: Credentials, data: Partial<Order>): Promise<Order> {
    const client = new AusPostClient(credentials)

    const body = {
      shipments: (data.shipmentIds ?? []).map((id) => ({ shipment_id: id })),
    }

    const res = await client.post<AusPostCreateOrderResponse>('/shipping/v1/orders', body)
    const order = res.order
    if (!order) {
      throw new Error('Australia Post createOrder returned no order')
    }
    return transformOrder(order)
  }

  // ── Manifests ──────────────────────────────────────────────────────────────
  // Derived from the same /shipping/v1/orders endpoint — AusPost's "order" IS the manifest.

  async createManifest(credentials: Credentials, data: Partial<Manifest>): Promise<Manifest> {
    const client = new AusPostClient(credentials)

    const body = {
      shipments: (data.shipmentIds ?? []).map((id) => ({ shipment_id: id })),
    }

    const res = await client.post<AusPostCreateOrderResponse>('/shipping/v1/orders', body)
    const order = res.order
    if (!order) {
      throw new Error('Australia Post createManifest returned no order')
    }
    return transformManifest(order as AusPostOrderResponse)
  }

  // ── Labels ─────────────────────────────────────────────────────────────────

  async createLabel(credentials: Credentials, data: Partial<Label>): Promise<Label> {
    const client = new AusPostClient(credentials)
    const shipmentId = data.shipmentId ?? data.id

    const res = await client.post<AusPostLabelsResponse>('/shipping/v1/labels', {
      shipments: [{ shipment_id: shipmentId }],
      preferences: { type: data.format ?? 'PDF' },
    })

    const label = res.labels?.[0]
    if (!label) {
      throw new Error('Australia Post createLabel returned no labels')
    }
    return transformLabel(label)
  }
}
