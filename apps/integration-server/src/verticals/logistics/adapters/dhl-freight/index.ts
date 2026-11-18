import { simpleApiKey } from '@opensteward/shared'
import type { LogisticsAdapter, Credentials, RateRequestParams } from '../../adapter/interface'
import type { Shipment } from '../../schema/shipment'
import type { TrackingEvent } from '../../schema/trackingevent'
import type { Order } from '../../schema/order'
import type { Rate } from '../../schema/rate'
import type { Label } from '../../schema/label'

import { buildAuthUrl, exchangeApiKey, refreshCredentials as doRefresh } from './auth'
import { DhlFreightClient } from './client'
import { transformTracking, type DhlFreightTrackingResponse } from './transform/tracking'
import { transformShipment, type DhlFreightShipment } from './transform/shipment'
import { transformOrder, type DhlFreightOrderRaw } from './transform/order'
import { transformRate, type DhlFreightPriceQuoteResponse } from './transform/rate'
import { transformLabel, type DhlFreightPrintResponse } from './transform/label'

// ── Resource coverage ──────────────────────────────────────────────
// Available:   shipment, trackingevent, order, rate, label
// Unavailable: carrier   — DHL Freight is the carrier itself; no carrier-listing endpoint exists in the API
// Unavailable: manifest  — DHL Freight Road API exposes no manifest/end-of-day consolidation endpoint
// Unavailable: warehouse — DHL Freight API exposes no warehouse management endpoints

interface DhlFreightAdapterConfig {
  sandbox?: boolean
}
const SIMPLE_API_KEY_FORM = simpleApiKey()


export class DhlFreightAdapter implements LogisticsAdapter {

  // Connect Link support — single API-key form.

  credentialFields = SIMPLE_API_KEY_FORM.credentialFields

  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'dhl-freight'
  readonly version = '1'

  constructor(_config: DhlFreightAdapterConfig = {}) {}

  getAuthUrl(state: string): string {
    return buildAuthUrl(state)
  }

  async exchangeCode(code: string, _redirectUri: string): Promise<Credentials> {
    return exchangeApiKey(code)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return doRefresh(credentials)
  }

  async getTrackingEvents(credentials: Credentials, trackingNumber: string): Promise<TrackingEvent[]> {
    const client = new DhlFreightClient(credentials)
    const raw = await client.get<DhlFreightTrackingResponse>('tracking/v1/shipments', {
      trackingNumber,
    })
    return transformTracking(raw)
  }

  async createShipment(credentials: Credentials, data: Partial<Shipment>): Promise<Shipment> {
    const client = new DhlFreightClient(credentials)
    const raw = await client.post<DhlFreightShipment>('shipping/v1/orders', {
      sender: data.originAddress,
      recipient: data.destinationAddress,
      weight: data.totalWeight
        ? { value: data.totalWeight.value, unit: data.totalWeight.unit }
        : undefined,
      reference: data.reference,
      serviceCode: data.serviceCode,
    })
    return transformShipment(raw)
  }

  // ── Orders ────────────────────────────────────────────────────────
  // DHL Freight Shipment Booking API: POST shipping/orders/v1

  async createOrder(credentials: Credentials, data: Partial<Order>): Promise<Order> {
    const client = new DhlFreightClient(credentials)
    const raw = await client.post<DhlFreightOrderRaw>('shipping/orders/v1', {
      sender: data.originAddress,
      recipient: data.destinationAddress,
      serviceCode: data.requestedServiceCode,
      reference: data.orderNumber,
      notes: data.notes,
    })
    return transformOrder(raw)
  }

  // ── Rates ─────────────────────────────────────────────────────────
  // DHL Freight Price Quote API: POST freight/info/pricequote/v1

  async getRates(credentials: Credentials, params: RateRequestParams): Promise<Rate[]> {
    const client = new DhlFreightClient(credentials)
    const raw = await client.post<DhlFreightPriceQuoteResponse>('freight/info/pricequote/v1', {
      parties: [
        { type: 'consignor', address: params.originAddress },
        { type: 'consignee', address: params.destinationAddress },
      ],
      weight: params.packages?.[0]?.weight?.value,
      weightUnit: params.packages?.[0]?.weight?.unit ?? 'kg',
    })
    return [transformRate(raw)]
  }

  // ── Labels ────────────────────────────────────────────────────────
  // DHL Freight Print API: POST freight/shipping/labels/v1/print/printdocumentsbyid

  async getLabel(credentials: Credentials, shipmentId: string): Promise<Label> {
    const client = new DhlFreightClient(credentials)
    const raw = await client.post<DhlFreightPrintResponse>(
      'freight/shipping/labels/v1/print/printdocumentsbyid',
      { shipmentIds: [shipmentId] },
    )
    const doc = raw.documents?.[0]
    if (!doc) throw new Error(`No label returned for shipment ${shipmentId}`)
    return transformLabel(doc)
  }

  async createLabel(credentials: Credentials, data: Partial<Label>): Promise<Label> {
    const client = new DhlFreightClient(credentials)
    const shipmentId = data.shipmentId ?? ''
    const raw = await client.post<DhlFreightPrintResponse>(
      'freight/shipping/labels/v1/print/printdocumentsbyid',
      { shipmentIds: [shipmentId] },
    )
    const doc = raw.documents?.[0]
    if (!doc) throw new Error(`No label returned for shipment ${shipmentId}`)
    return transformLabel(doc)
  }
}
