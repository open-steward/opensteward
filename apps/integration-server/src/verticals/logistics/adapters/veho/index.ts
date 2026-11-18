import { simpleApiKey } from '@opensteward/shared'
import type { LogisticsAdapter, Credentials, RateRequestParams } from '../../adapter/interface'
import type { Shipment } from '../../schema/shipment'
import type { TrackingEvent } from '../../schema/trackingevent'
import type { Rate } from '../../schema/rate'
import type { Order } from '../../schema/order'
import type { Label } from '../../schema/label'

import { buildAuthUrl, exchangeApiKey, refreshCredentials as doRefresh } from './auth'
import { VehoClient } from './client'
import { transformTracking, type VehoPackage } from './transform/tracking'
import { transformShipment, type VehoShipment } from './transform/shipment'
import { transformRate, type VehoRate } from './transform/rate'
import { transformOrder, type VehoOrder } from './transform/order'
import { transformLabel, type VehoLabel } from './transform/label'

// ── Resource coverage ──────────────────────────────────────────────
// Unavailable: carrier   — Veho is itself the sole carrier; no /carriers list endpoint exists
// Unavailable: manifest  — Manifesting is contractual/manual; no list or get endpoint in Veho API v2
// Unavailable: warehouse — No warehouse endpoints documented in Veho API v2

const SIMPLE_API_KEY_FORM = simpleApiKey()


export class VehoAdapter implements LogisticsAdapter {

  // Connect Link support — single API-key form.

  credentialFields = SIMPLE_API_KEY_FORM.credentialFields

  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'veho'
  readonly version = '1'

  getAuthUrl(state: string): string { return buildAuthUrl(state) }
  async exchangeCode(code: string, _ru: string): Promise<Credentials> { return exchangeApiKey(code) }
  async refreshCredentials(c: Credentials): Promise<Credentials> { return doRefresh(c) }

  async getTrackingEvents(credentials: Credentials, trackingNumber: string): Promise<TrackingEvent[]> {
    const client = new VehoClient(credentials)
    const raw = await client.get<VehoPackage>(`packages/${trackingNumber}`)
    return transformTracking(raw)
  }

  async createShipment(credentials: Credentials, data: Partial<Shipment>): Promise<Shipment> {
    const client = new VehoClient(credentials)
    const raw = await client.post<VehoShipment>('packages', {
      origin_address: data.originAddress,
      destination_address: data.destinationAddress,
      weight_oz: data.totalWeight?.value,
      reference: data.reference,
    })
    return transformShipment(raw)
  }

  async getRates(credentials: Credentials, params: RateRequestParams): Promise<Rate[]> {
    const client = new VehoClient(credentials)
    const raw = await client.post<{ rates?: VehoRate[] }>('rates', {
      origin_address: params.originAddress,
      destination_address: params.destinationAddress,
    })
    return (raw.rates ?? []).map(transformRate)
  }

  async createOrder(credentials: Credentials, data: Partial<Order>): Promise<Order> {
    const client = new VehoClient(credentials)
    const raw = await client.post<VehoOrder>('orders', {
      destination: data.destinationAddress,
      serviceClass: data.requestedServiceCode,
      reference: data.orderNumber,
      notes: data.notes,
    })
    return transformOrder(raw)
  }

  async getLabel(credentials: Credentials, id: string): Promise<Label> {
    const client = new VehoClient(credentials)
    const raw = await client.get<VehoLabel>(`packages/${id}/label`)
    return transformLabel(raw)
  }
}
