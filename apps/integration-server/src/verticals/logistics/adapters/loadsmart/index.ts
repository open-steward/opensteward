// ── Resource coverage ──────────────────────────────────────────────
// Unavailable: label     — Loadsmart is a freight TMS/broker (FTL); no parcel label or BOL generation API
// Unavailable: manifest  — No manifest concept in the Loadsmart ShipperGuide freight TMS API
// Unavailable: warehouse — No warehouse endpoints on the ShipperGuide API (api.loadsmart.com/v2); Opendock is a separate product at a different base URL

import type {
  LogisticsAdapter,
  Credentials,
  QueryParams,
  RateRequestParams,
} from '../../adapter/interface'
import type { Shipment } from '../../schema/shipment'
import type { TrackingEvent } from '../../schema/trackingevent'
import type { Rate } from '../../schema/rate'
import type { Carrier } from '../../schema/carrier'
import type { Order } from '../../schema/order'

import { buildAuthUrl, exchangeCredentials, refreshCredentials as doRefresh } from './auth'
import { LoadsmartClient } from './client'

import { transformTrackingEvents, type LoadsmartTrackingResponse } from './transform/tracking'
import { transformShipment, type LoadsmartShipmentResponse } from './transform/shipment'
import { transformRate, type LoadsmartRatesResponse } from './transform/rate'
import { transformCarrier, type LoadsmartCarrierResponse } from './transform/carrier'
import { transformOrder, type LoadsmartOrderResponse } from './transform/order'

export interface LoadsmartAdapterConfig {
  clientId?: string
  clientSecret?: string
}

export class LoadsmartAdapter implements LogisticsAdapter {
  readonly platform = 'loadsmart'
  readonly version = '1'

  private config: LoadsmartAdapterConfig

  constructor(config: LoadsmartAdapterConfig = {}) {
    this.config = config
  }

  // ── Auth ───────────────────────────────────────────────────────────────────

  getAuthUrl(state: string): string {
    return buildAuthUrl(state)
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    if (!this.config.clientId || !this.config.clientSecret) {
      throw new Error('loadsmart: clientId and clientSecret are required')
    }
    return exchangeCredentials({
      clientId: this.config.clientId,
      clientSecret: this.config.clientSecret,
    })
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return doRefresh(credentials)
  }

  // ── Rates ──────────────────────────────────────────────────────────────────

  async getRates(credentials: Credentials, params: RateRequestParams): Promise<Rate[]> {
    const client = new LoadsmartClient(credentials)

    const body = {
      origin: {
        address: params.originAddress.street1,
        city: params.originAddress.city,
        state: params.originAddress.state,
        zipCode: params.originAddress.postalCode,
        country: params.originAddress.country,
      },
      destination: {
        address: params.destinationAddress.street1,
        city: params.destinationAddress.city,
        state: params.destinationAddress.state,
        zipCode: params.destinationAddress.postalCode,
        country: params.destinationAddress.country,
      },
      weight: params.packages[0]?.weight
        ? { value: params.packages[0].weight.value, unit: params.packages[0].weight.unit === 'kg' ? 'KG' : 'LBS' }
        : undefined,
    }

    const res = await client.post<LoadsmartRatesResponse>('/quotes', body)
    return (res.quotes ?? []).map(transformRate)
  }

  // ── Tracking Events ────────────────────────────────────────────────────────

  async getTrackingEvents(credentials: Credentials, trackingNumber: string): Promise<TrackingEvent[]> {
    const client = new LoadsmartClient(credentials)
    const res = await client.get<LoadsmartTrackingResponse>(`/shipments/${trackingNumber}/tracking`)
    return transformTrackingEvents(res)
  }

  // ── Shipments ──────────────────────────────────────────────────────────────

  async createShipment(credentials: Credentials, data: Partial<Shipment>): Promise<Shipment> {
    const client = new LoadsmartClient(credentials)

    const body = {
      serviceType: data.serviceCode,
      origin: {
        name: data.originAddress?.name,
        company: data.originAddress?.company,
        address: data.originAddress?.street1,
        city: data.originAddress?.city,
        state: data.originAddress?.state,
        zipCode: data.originAddress?.postalCode,
        country: data.originAddress?.country,
        phone: data.originAddress?.phone,
        email: data.originAddress?.email,
      },
      destination: {
        name: data.destinationAddress?.name,
        company: data.destinationAddress?.company,
        address: data.destinationAddress?.street1,
        city: data.destinationAddress?.city,
        state: data.destinationAddress?.state,
        zipCode: data.destinationAddress?.postalCode,
        country: data.destinationAddress?.country,
        phone: data.destinationAddress?.phone,
        email: data.destinationAddress?.email,
      },
      weight: data.totalWeight
        ? { value: data.totalWeight.value, unit: data.totalWeight.unit === 'kg' ? 'KG' : 'LBS' }
        : undefined,
    }

    const res = await client.post<LoadsmartShipmentResponse>('/shipments', body)
    return transformShipment(res)
  }

  async cancelShipment(credentials: Credentials, id: string): Promise<void> {
    const client = new LoadsmartClient(credentials)
    await client.delete(`/shipments/${id}`)
  }

  // ── Shipment Listing ──────────────────────────────────────────────────────

  async listShipments(credentials: Credentials, params: QueryParams): Promise<Shipment[]> {
    const client = new LoadsmartClient(credentials)
    const res = await client.get<{ shipments: LoadsmartShipmentResponse[] }>('/shipments', {
      page: params.page,
      limit: params.limit,
    })
    return (res.shipments ?? []).map(transformShipment)
  }

  async getShipment(credentials: Credentials, id: string): Promise<Shipment> {
    const client = new LoadsmartClient(credentials)
    const res = await client.get<LoadsmartShipmentResponse>(`/shipments/${id}`)
    return transformShipment(res)
  }

  // ── Carriers ───────────────────────────────────────────────────────────────
  // Loadsmart exposes GET /api/v2/carrier/search?mc={id} — lookup by MC or DOT.
  // There is no list-all endpoint; listCarriers is not implemented.

  async getCarrier(credentials: Credentials, id: string): Promise<Carrier> {
    const client = new LoadsmartClient(credentials)
    const res = await client.get<LoadsmartCarrierResponse>('/carrier/search', { mc: id })
    return transformCarrier(res)
  }

  // ── Orders ─────────────────────────────────────────────────────────────────
  // Loadsmart exposes POST /orders/ (create) and PUT /orders/{uuid} (update).
  // There are no GET endpoints for orders; listOrders / getOrder not implemented.

  async createOrder(credentials: Credentials, data: Partial<Order>): Promise<Order> {
    const client = new LoadsmartClient(credentials)
    const body = {
      externalId: data.orderNumber ?? undefined,
      primaryReference: data.orderNumber ?? undefined,
      pickup: data.originAddress
        ? {
            facilityName: data.originAddress.company ?? data.originAddress.name,
            addressLine: data.originAddress.street1,
            city: data.originAddress.city,
            state: data.originAddress.state,
            zipCode: data.originAddress.postalCode,
            country: data.originAddress.country,
            contactName: data.originAddress.name,
            contactPhone: data.originAddress.phone,
            contactEmail: data.originAddress.email,
          }
        : undefined,
      delivery: data.destinationAddress
        ? {
            facilityName: data.destinationAddress.company ?? data.destinationAddress.name,
            addressLine: data.destinationAddress.street1,
            city: data.destinationAddress.city,
            state: data.destinationAddress.state,
            zipCode: data.destinationAddress.postalCode,
            country: data.destinationAddress.country,
            contactName: data.destinationAddress.name,
            contactPhone: data.destinationAddress.phone,
            contactEmail: data.destinationAddress.email,
          }
        : undefined,
      notes: data.notes,
    }
    const res = await client.post<LoadsmartOrderResponse>('/orders/', body)
    return transformOrder(res)
  }

  async updateOrder(credentials: Credentials, id: string, data: Partial<Order>): Promise<Order> {
    const client = new LoadsmartClient(credentials)
    const body = {
      externalId: data.orderNumber ?? undefined,
      primaryReference: data.orderNumber ?? undefined,
      pickup: data.originAddress
        ? {
            facilityName: data.originAddress.company ?? data.originAddress.name,
            addressLine: data.originAddress.street1,
            city: data.originAddress.city,
            state: data.originAddress.state,
            zipCode: data.originAddress.postalCode,
            country: data.originAddress.country,
            contactName: data.originAddress.name,
            contactPhone: data.originAddress.phone,
            contactEmail: data.originAddress.email,
          }
        : undefined,
      delivery: data.destinationAddress
        ? {
            facilityName: data.destinationAddress.company ?? data.destinationAddress.name,
            addressLine: data.destinationAddress.street1,
            city: data.destinationAddress.city,
            state: data.destinationAddress.state,
            zipCode: data.destinationAddress.postalCode,
            country: data.destinationAddress.country,
            contactName: data.destinationAddress.name,
            contactPhone: data.destinationAddress.phone,
            contactEmail: data.destinationAddress.email,
          }
        : undefined,
      notes: data.notes,
    }
    const res = await client.put<LoadsmartOrderResponse>(`/orders/${id}`, body)
    return transformOrder(res)
  }
}
