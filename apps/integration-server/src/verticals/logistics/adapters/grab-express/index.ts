// ── Resource coverage ──────────────────────────────────────────────
// Available:   shipment, trackingevent, rate, order
// Unavailable: carrier  — Grab Express is a single carrier; no carrier-listing endpoint exists
// Unavailable: label    — no label download/PDF endpoint; trackingURL is a web tracking link only
// Unavailable: manifest — no manifest/consolidation concept in the Grab Express API
// Unavailable: warehouse — no warehouse/hub management endpoint in the Grab Express API

import type {
  LogisticsAdapter,
  Credentials,
  RateRequestParams,
} from '../../adapter/interface'
import type { Shipment } from '../../schema/shipment'
import type { TrackingEvent } from '../../schema/trackingevent'
import type { Rate } from '../../schema/rate'
import type { Order } from '../../schema/order'

import { buildAuthUrl, exchangeCredentials, refreshCredentials as doRefresh, type GrabExpressAdapterAuthConfig } from './auth'
import { GrabExpressClient } from './client'

import { transformTracking, type GrabExpressTrackingResponse } from './transform/tracking'
import { transformShipment, type GrabExpressShipmentRaw } from './transform/shipment'
import { transformOrder, type GrabExpressDeliveryRaw } from './transform/order'

interface GrabExpressAdapterConfig { clientId?: string; clientSecret?: string; sandbox?: boolean }

export class GrabExpressAdapter implements LogisticsAdapter {
  readonly platform = 'grab-express'
  readonly version = '1'

  private authConfig: GrabExpressAdapterAuthConfig
  constructor(config: GrabExpressAdapterConfig = {}) {
    this.authConfig = { clientId: config.clientId ?? '', clientSecret: config.clientSecret ?? '' }
    void config
  }

  // ── Auth ───────────────────────────────────────────────────────────────────

  getAuthUrl(state: string): string {
    return buildAuthUrl(state)
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    return exchangeCredentials({ clientId: this.authConfig.clientId, clientSecret: this.authConfig.clientSecret })
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return doRefresh(credentials)
  }

  // ── Tracking Events ────────────────────────────────────────────────────────

  async getTrackingEvents(credentials: Credentials, trackingNumber: string): Promise<TrackingEvent[]> {
    const client = new GrabExpressClient(credentials)
    const raw = await client.get<GrabExpressTrackingResponse>(`tracking/${trackingNumber}`)
    return transformTracking({ ...raw, tracking_number: raw.tracking_number ?? trackingNumber })
  }

  // ── Shipments ──────────────────────────────────────────────────────────────

  async createShipment(credentials: Credentials, data: Partial<Shipment>): Promise<Shipment> {
    const client = new GrabExpressClient(credentials)
    const raw = await client.post<GrabExpressShipmentRaw>('shipments', {
      reference: data.reference,
      service_code: data.serviceCode,
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
    })
    return transformShipment(raw)
  }

  // ── Rates ──────────────────────────────────────────────────────────────────

  async getRates(credentials: Credentials, params: RateRequestParams): Promise<Rate[]> {
    const client = new GrabExpressClient(credentials)
    const pkg = params.packages[0]
    // POST /v1/deliveries/quotes — returns { quotes: [...] }
    const res = await client.post<{ quotes?: Array<Record<string, unknown>> }>('deliveries/quotes', {
      origin: {
        address: params.originAddress.street1,
        cityCode: params.originAddress.city,
      },
      destination: {
        address: params.destinationAddress.street1,
        cityCode: params.destinationAddress.city,
      },
      packages: pkg
        ? [{ name: 'package', quantity: 1, dimensions: { weight: pkg.weight?.value } }]
        : [],
    })
    const list = res.quotes ?? []
    return list.map((r) => ({
      carrierId: 'grab-express',
      serviceCode: (r.serviceType as string | undefined),
      serviceName: (r.serviceType as string | undefined),
      currency: (r.currency as string | undefined) ?? 'SGD',
      totalAmount: typeof r.amount === 'number' ? r.amount : undefined,
      metadata: r as Record<string, unknown>,
    }))
  }

  // ── Orders ─────────────────────────────────────────────────────────────────

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const client = new GrabExpressClient(credentials)
    const raw = await client.get<GrabExpressDeliveryRaw>(`deliveries/${id}`)
    return transformOrder(raw)
  }

  async createOrder(credentials: Credentials, data: Partial<Order>): Promise<Order> {
    const client = new GrabExpressClient(credentials)
    const raw = await client.post<GrabExpressDeliveryRaw>('deliveries', {
      merchantOrderID: data.orderNumber,
      serviceType: data.requestedServiceCode ?? 'INSTANT',
      sender: data.originAddress
        ? {
            firstName: data.originAddress.name,
            companyName: data.originAddress.company,
            email: data.originAddress.email,
            phone: data.originAddress.phone,
          }
        : undefined,
      recipient: data.destinationAddress
        ? {
            firstName: data.destinationAddress.name,
            companyName: data.destinationAddress.company,
            email: data.destinationAddress.email,
            phone: data.destinationAddress.phone,
          }
        : undefined,
      origin: data.originAddress
        ? { address: data.originAddress.street1, cityCode: data.originAddress.city }
        : undefined,
      destination: data.destinationAddress
        ? { address: data.destinationAddress.street1, cityCode: data.destinationAddress.city }
        : undefined,
    })
    return transformOrder(raw)
  }

  async cancelOrder(credentials: Credentials, id: string): Promise<void> {
    const client = new GrabExpressClient(credentials)
    await client.delete(`deliveries/${id}`)
  }
}
