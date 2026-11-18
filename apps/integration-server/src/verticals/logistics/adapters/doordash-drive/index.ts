// ── Resource coverage ──────────────────────────────────────────────────────────
// Unavailable: carrier   — DoorDash Drive has no carrier management API; DoorDash itself is the carrier
// Unavailable: label     — DoorDash Drive dispatches Dashers and does not generate shipping labels
// Unavailable: manifest  — Manifesting is not supported or required for DoorDash Drive (confirmed by docs)
// Unavailable: warehouse — DoorDash Drive has no warehouse management API

import type { LogisticsAdapter, Credentials, RateRequestParams } from '../../adapter/interface'
import type { Shipment } from '../../schema/shipment'
import type { TrackingEvent } from '../../schema/trackingevent'
import type { Rate } from '../../schema/rate'
import type { Order } from '../../schema/order'

import { buildAuthUrl, exchangeCode as doExchangeCode, refreshCredentials as doRefresh } from './auth'
import { DoordashDriveClient } from './client'
import { transformTracking, type DoordashDelivery } from './transform/tracking'
import { transformShipment, type DoordashShipment } from './transform/shipment'
import { transformRate, type DoordashQuote } from './transform/rate'
import { transformOrder, type DoordashDriveDelivery } from './transform/order'

export class DoordashDriveAdapter implements LogisticsAdapter {
  readonly platform = 'doordash-drive'
  readonly version = '1'

  getAuthUrl(state: string): string { return buildAuthUrl(state) }
  async exchangeCode(code: string, redirectUri: string): Promise<Credentials> { return doExchangeCode(code, redirectUri) }
  async refreshCredentials(credentials: Credentials): Promise<Credentials> { return doRefresh(credentials) }

  async getTrackingEvents(credentials: Credentials, trackingNumber: string): Promise<TrackingEvent[]> {
    const client = new DoordashDriveClient(credentials)
    const raw = await client.get<DoordashDelivery>(`deliveries/${trackingNumber}`)
    return transformTracking(raw)
  }

  async createShipment(credentials: Credentials, data: Partial<Shipment>): Promise<Shipment> {
    const client = new DoordashDriveClient(credentials)
    const raw = await client.post<DoordashShipment>('deliveries', {
      external_delivery_id: data.reference,
      pickup_address: data.originAddress,
      dropoff_address: data.destinationAddress,
    })
    return transformShipment(raw)
  }

  async getRates(credentials: Credentials, params: RateRequestParams): Promise<Rate[]> {
    const client = new DoordashDriveClient(credentials)
    const raw = await client.post<DoordashQuote>('quotes', {
      pickup_address: params.originAddress,
      dropoff_address: params.destinationAddress,
    })
    return [transformRate(raw)]
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const client = new DoordashDriveClient(credentials)
    const raw = await client.get<DoordashDriveDelivery>(`deliveries/${id}`)
    return transformOrder(raw)
  }

  async createOrder(credentials: Credentials, data: Partial<Order>): Promise<Order> {
    const client = new DoordashDriveClient(credentials)
    const raw = await client.post<DoordashDriveDelivery>('deliveries', {
      external_delivery_id: data.orderNumber ?? data.id,
      pickup_address: data.originAddress,
      dropoff_address: data.destinationAddress,
      order_value: data.totalAmount != null ? Math.round(data.totalAmount * 100) : undefined,
      currency: data.currency,
      dropoff_instructions: data.notes,
    })
    return transformOrder(raw)
  }
}
