// ── Resource coverage ──────────────────────────────────────────────
// Unavailable: carrier   — ShipperHQ exposes no list/get carrier endpoint; carrier data only appears embedded in rate responses
// Unavailable: warehouse — Origins/warehouses are dashboard-only configuration; no API to list or retrieve them
// Unavailable: manifest  — ShipperHQ provides no end-of-day / manifest API operation
// Unverified:  label     — createListing operation exists but Labels API is closed beta behind enterprise gating; full field schema unverifiable

import { simpleApiKey } from '@opensteward/shared'
import type { LogisticsAdapter, Credentials, RateRequestParams } from '../../adapter/interface'
import type { Shipment } from '../../schema/shipment'
import type { Order } from '../../schema/order'
import type { TrackingEvent } from '../../schema/trackingevent'
import type { Rate } from '../../schema/rate'

import { buildAuthUrl, exchangeApiKey, refreshCredentials as doRefresh } from './auth'
import { ShipperhqClient } from './client'

import { transformTracking, type ShipperhqTrackingResponse } from './transform/tracking'
import { transformShipment, type ShipperhqShipment } from './transform/shipment'
import { transformOrder, type ShipperhqOrder } from './transform/order'
import { transformRates, type ShipperhqRateResponse } from './transform/rate'

interface ShipperhqAdapterConfig {
  sandbox?: boolean
}
const SIMPLE_API_KEY_FORM = simpleApiKey()


export class ShipperhqAdapter implements LogisticsAdapter {

  // Connect Link support — single API-key form.

  credentialFields = SIMPLE_API_KEY_FORM.credentialFields

  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'shipperhq'
  readonly version = '1'

  constructor(_config: ShipperhqAdapterConfig = {}) {}

  getAuthUrl(state: string): string {
    return buildAuthUrl(state)
  }

  async exchangeCode(code: string, _redirectUri: string): Promise<Credentials> {
    return exchangeApiKey(code)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return doRefresh(credentials)
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const client = new ShipperhqClient(credentials)
    const raw = await client.get<ShipperhqOrder>(`v1/orders/${encodeURIComponent(id)}`)
    return transformOrder(raw)
  }

  async createOrder(credentials: Credentials, data: Partial<Order>): Promise<Order> {
    const client = new ShipperhqClient(credentials)
    const raw = await client.post<ShipperhqOrder>('v1/orders', {
      orderNumber: data.orderNumber,
      customerId: data.customerId,
      warehouseId: data.warehouseId,
      destination: data.destinationAddress,
      origin: data.originAddress,
      items: data.lineItems?.map((li) => ({
        sku: li.sku,
        quantity: li.quantity,
        name: li.description,
        price: li.unitAmount,
      })),
      notes: data.notes,
      serviceCode: data.requestedServiceCode,
    })
    return transformOrder(raw)
  }

  async getShipment(credentials: Credentials, id: string): Promise<Shipment> {
    const client = new ShipperhqClient(credentials)
    const raw = await client.get<ShipperhqShipment>(`v1/shipments/${encodeURIComponent(id)}`)
    return transformShipment(raw)
  }

  async createShipment(credentials: Credentials, data: Partial<Shipment>): Promise<Shipment> {
    const client = new ShipperhqClient(credentials)
    const raw = await client.post<ShipperhqShipment>('v1/shipments', {
      origin: data.originAddress,
      destination: data.destinationAddress,
      weight: data.totalWeight?.value,
      weightUnit: data.totalWeight?.unit,
      serviceCode: data.serviceCode,
      reference: data.reference,
    })
    return transformShipment(raw)
  }

  async getTrackingEvents(credentials: Credentials, trackingNumber: string): Promise<TrackingEvent[]> {
    const client = new ShipperhqClient(credentials)
    const raw = await client.get<ShipperhqTrackingResponse>(
      `v1/tracking/${encodeURIComponent(trackingNumber)}`,
    )
    return transformTracking(raw)
  }

  async getRates(credentials: Credentials, params: RateRequestParams): Promise<Rate[]> {
    const client = new ShipperhqClient(credentials)
    const raw = await client.post<ShipperhqRateResponse>('v1/rates', {
      destination: params.destinationAddress,
      origin: params.originAddress,
      packages: params.packages,
      serviceCodes: params.serviceCodes,
    })
    return transformRates(raw)
  }
}
