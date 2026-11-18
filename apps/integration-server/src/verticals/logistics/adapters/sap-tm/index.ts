// ── Resource coverage ──────────────────────────────────────────────
// Unverified: label     — SAP TM has a label-print concept via freight-order output profiles, but
//                         the SAP Business Accelerator Hub API portal requires authentication and
//                         no public REST endpoint path for /labels is documented.
// Unverified: manifest  — SAP TM has a pickup-closeout/manifest concept in its freight-order
//                         workflow, but no public REST endpoint path for /manifests is documented.
// Unverified: rate      — SAP TM has a rate-determination engine for freight charges, but no
//                         public REST endpoint path for /rates is documented.
// Unverified: warehouse — SAP TM integrates with SAP eWM for warehousing, but no public REST
//                         endpoint path for /warehouses is documented.

import type {
  LogisticsAdapter,
  Credentials,
  QueryParams,
} from '../../adapter/interface'
import type { Shipment } from '../../schema/shipment'
import type { TrackingEvent } from '../../schema/trackingevent'
import type { Order } from '../../schema/order'
import type { Carrier } from '../../schema/carrier'

import { buildAuthUrl, exchangeCredentials, refreshCredentials as doRefresh } from './auth'
import { SapTmClient } from './client'

import { transformTrackingEvents, type SapTmTrackingResponse } from './transform/tracking'
import { transformShipment, type SapTmShipmentResponse } from './transform/shipment'
import { transformOrder, type SapTmOrderResponse } from './transform/order'
import { transformCarrier, type SapTmCarrierResponse } from './transform/carrier'

export interface SapTmAdapterConfig {
  clientId?: string
  clientSecret?: string
}

export class SapTmAdapter implements LogisticsAdapter {
  readonly platform = 'sap-tm'
  readonly version = '1'

  private config: SapTmAdapterConfig

  constructor(config: SapTmAdapterConfig = {}) {
    this.config = config
  }

  // ── Auth ───────────────────────────────────────────────────────────────────

  getAuthUrl(state: string): string {
    return buildAuthUrl(state)
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    if (!this.config.clientId || !this.config.clientSecret) {
      throw new Error('sap-tm: clientId and clientSecret are required')
    }
    return exchangeCredentials({
      clientId: this.config.clientId,
      clientSecret: this.config.clientSecret,
    })
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return doRefresh(credentials)
  }

  // ── Tracking Events ────────────────────────────────────────────────────────

  async getTrackingEvents(credentials: Credentials, trackingNumber: string): Promise<TrackingEvent[]> {
    const client = new SapTmClient(credentials)
    const res = await client.get<SapTmTrackingResponse>(`/shipments/${trackingNumber}/events`)
    return transformTrackingEvents(res)
  }

  // ── Shipments ──────────────────────────────────────────────────────────────

  async createShipment(credentials: Credentials, data: Partial<Shipment>): Promise<Shipment> {
    const client = new SapTmClient(credentials)

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

    const res = await client.post<SapTmShipmentResponse>('/shipments', body)
    return transformShipment(res)
  }

  async cancelShipment(credentials: Credentials, id: string): Promise<void> {
    const client = new SapTmClient(credentials)
    await client.delete(`/shipments/${id}`)
  }

  async listShipments(credentials: Credentials, params: QueryParams): Promise<Shipment[]> {
    const client = new SapTmClient(credentials)
    const res = await client.get<{ shipments: SapTmShipmentResponse[] }>('/shipments', {
      page: params.page,
      limit: params.limit,
    })
    return (res.shipments ?? []).map(transformShipment)
  }

  async getShipment(credentials: Credentials, id: string): Promise<Shipment> {
    const client = new SapTmClient(credentials)
    const res = await client.get<SapTmShipmentResponse>(`/shipments/${id}`)
    return transformShipment(res)
  }

  // ── Orders ─────────────────────────────────────────────────────────────────

  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const client = new SapTmClient(credentials)
    const res = await client.get<{ orders: SapTmOrderResponse[] }>('/orders', {
      page: params.page,
      limit: params.limit,
    })
    return (res.orders ?? []).map(transformOrder)
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const client = new SapTmClient(credentials)
    const res = await client.get<SapTmOrderResponse>(`/orders/${id}`)
    return transformOrder(res)
  }

  async createOrder(credentials: Credentials, data: Partial<Order>): Promise<Order> {
    const client = new SapTmClient(credentials)
    const body = {
      orderNumber: data.orderNumber,
      customerId: data.customerId,
      serviceType: data.requestedServiceCode,
      origin: data.originAddress
        ? {
            name: data.originAddress.name,
            address: data.originAddress.street1,
            city: data.originAddress.city,
            state: data.originAddress.state,
            zipCode: data.originAddress.postalCode,
            country: data.originAddress.country,
            phone: data.originAddress.phone,
            email: data.originAddress.email,
          }
        : undefined,
      destination: data.destinationAddress
        ? {
            name: data.destinationAddress.name,
            address: data.destinationAddress.street1,
            city: data.destinationAddress.city,
            state: data.destinationAddress.state,
            zipCode: data.destinationAddress.postalCode,
            country: data.destinationAddress.country,
            phone: data.destinationAddress.phone,
            email: data.destinationAddress.email,
          }
        : undefined,
      notes: data.notes,
    }
    const res = await client.post<SapTmOrderResponse>('/orders', body)
    return transformOrder(res)
  }

  // ── Carriers ───────────────────────────────────────────────────────────────

  async listCarriers(credentials: Credentials, params: QueryParams): Promise<Carrier[]> {
    const client = new SapTmClient(credentials)
    const res = await client.get<{ carriers: SapTmCarrierResponse[] }>('/carriers', {
      page: params.page,
      limit: params.limit,
    })
    return (res.carriers ?? []).map(transformCarrier)
  }

  async getCarrier(credentials: Credentials, id: string): Promise<Carrier> {
    const client = new SapTmClient(credentials)
    const res = await client.get<SapTmCarrierResponse>(`/carriers/${id}`)
    return transformCarrier(res)
  }
}
