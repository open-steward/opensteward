import type {
  LogisticsAdapter,
  Credentials,
  QueryParams,
  RateRequestParams,
} from '../../adapter/interface'
import type { Shipment } from '../../schema/shipment'
import type { TrackingEvent } from '../../schema/trackingevent'
import type { Rate } from '../../schema/rate'
import type { Label } from '../../schema/label'
import type { Order } from '../../schema/order'

import { buildAuthUrl, exchangeCredentials, refreshCredentials as doRefresh } from './auth'
import { CHRobinsonClient } from './client'

import {
  transformShipment,
  type CHRShipmentResponse,
} from './transform/shipment'
import {
  transformTrackingEvents,
  type CHRTrackingResponse,
} from './transform/tracking'
import {
  transformRate,
  type CHRRateResponse,
  type CHRRatesListResponse,
} from './transform/rate'
import { transformLabel, type CHRLabelResponse } from './transform/label'
import { transformOrder, type CHROrderResponse } from './transform/order'

// ── Resource coverage ──────────────────────────────────────────────────────────
// Unverified: carrier   — API docs at developer.chrobinson.com require authenticated access; no public endpoint confirmed
// Unverified: manifest  — API docs at developer.chrobinson.com require authenticated access; no public endpoint confirmed
// Unverified: warehouse — API docs at developer.chrobinson.com require authenticated access; no public endpoint confirmed

// ── Config ────────────────────────────────────────────────────────────────────

export interface CHRobinsonAdapterConfig {
  clientId?: string
  clientSecret?: string
}

// ── Adapter ───────────────────────────────────────────────────────────────────

/**
 * C.H. Robinson (Navisphere) logistics adapter.
 *
 * Auth:     OAuth 2.0 client_credentials
 * Docs:     https://developer.chrobinson.com/
 * Supports: Shipments, Tracking, Rates, Labels, Orders
 */
export class CHRobinsonAdapter implements LogisticsAdapter {
  readonly platform = 'ch-robinson'
  readonly version = '1'

  private config: CHRobinsonAdapterConfig

  constructor(config: CHRobinsonAdapterConfig = {}) {
    this.config = config
  }

  // ── Auth ──────────────────────────────────────────────────────────────────

  getAuthUrl(state: string): string {
    return buildAuthUrl(state)
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    if (!this.config.clientId || !this.config.clientSecret) {
      throw new Error('ch-robinson: clientId and clientSecret are required')
    }
    return exchangeCredentials({
      clientId: this.config.clientId,
      clientSecret: this.config.clientSecret,
    })
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return doRefresh(credentials)
  }

  // ── Shipments ─────────────────────────────────────────────────────────────

  async listShipments(credentials: Credentials, params: QueryParams): Promise<Shipment[]> {
    const client = new CHRobinsonClient(credentials)
    const res = await client.get<{ shipments?: CHRShipmentResponse[]; loads?: CHRShipmentResponse[] }>(
      '/shipments',
      {
        page: params.page,
        pageSize: params.limit,
      },
    )
    const items = res.shipments ?? res.loads ?? []
    return items.map(transformShipment)
  }

  async getShipment(credentials: Credentials, id: string): Promise<Shipment> {
    const client = new CHRobinsonClient(credentials)
    const res = await client.get<CHRShipmentResponse>(`/shipments/${id}`)
    return transformShipment(res)
  }

  async createShipment(credentials: Credentials, data: Partial<Shipment>): Promise<Shipment> {
    const client = new CHRobinsonClient(credentials)

    const body = {
      serviceType: data.serviceCode,
      mode: data.mode,
      origin: data.originAddress
        ? {
            name: data.originAddress.name,
            companyName: data.originAddress.company,
            address1: data.originAddress.street1,
            address2: data.originAddress.street2,
            city: data.originAddress.city,
            stateProvince: data.originAddress.state,
            postalCode: data.originAddress.postalCode,
            country: data.originAddress.country,
            phone: data.originAddress.phone,
            email: data.originAddress.email,
          }
        : undefined,
      destination: data.destinationAddress
        ? {
            name: data.destinationAddress.name,
            companyName: data.destinationAddress.company,
            address1: data.destinationAddress.street1,
            address2: data.destinationAddress.street2,
            city: data.destinationAddress.city,
            stateProvince: data.destinationAddress.state,
            postalCode: data.destinationAddress.postalCode,
            country: data.destinationAddress.country,
            phone: data.destinationAddress.phone,
            email: data.destinationAddress.email,
          }
        : undefined,
      totalWeight: data.totalWeight
        ? {
            value: data.totalWeight.value,
            unit: data.totalWeight.unit === 'kg' ? 'KG' : 'LB',
          }
        : undefined,
      notes: data.notes,
      reference: data.reference,
    }

    const res = await client.post<CHRShipmentResponse>('/shipments', body)
    return transformShipment(res)
  }

  async cancelShipment(credentials: Credentials, id: string): Promise<void> {
    const client = new CHRobinsonClient(credentials)
    await client.delete(`/shipments/${id}`)
  }

  // ── Tracking Events ───────────────────────────────────────────────────────

  async getTrackingEvents(
    credentials: Credentials,
    trackingNumber: string,
  ): Promise<TrackingEvent[]> {
    const client = new CHRobinsonClient(credentials)
    const res = await client.get<CHRTrackingResponse>(
      `/shipments/${trackingNumber}/tracking`,
    )
    return transformTrackingEvents(res)
  }

  async listTrackingEvents(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<TrackingEvent[]> {
    const client = new CHRobinsonClient(credentials)
    const res = await client.get<{ events?: CHRTrackingResponse[] }>(
      '/tracking/events',
      {
        page: params.page,
        pageSize: params.limit,
      },
    )
    return (res.events ?? []).flatMap(transformTrackingEvents)
  }

  // ── Rates ─────────────────────────────────────────────────────────────────

  async getRates(credentials: Credentials, params: RateRequestParams): Promise<Rate[]> {
    const client = new CHRobinsonClient(credentials)

    const body = {
      origin: {
        address1: params.originAddress.street1,
        city: params.originAddress.city,
        stateProvince: params.originAddress.state,
        postalCode: params.originAddress.postalCode,
        country: params.originAddress.country,
      },
      destination: {
        address1: params.destinationAddress.street1,
        city: params.destinationAddress.city,
        stateProvince: params.destinationAddress.state,
        postalCode: params.destinationAddress.postalCode,
        country: params.destinationAddress.country,
      },
      totalWeight: params.packages[0]?.weight
        ? {
            value: params.packages[0].weight.value,
            unit: params.packages[0].weight.unit === 'kg' ? 'KG' : 'LB',
          }
        : undefined,
      serviceCodes: params.serviceCodes,
    }

    const res = await client.post<CHRRatesListResponse>('/rates/quotes', body)
    const items: CHRRateResponse[] = res.quotes ?? res.rates ?? []
    return items.map(transformRate)
  }

  // ── Labels ────────────────────────────────────────────────────────────────

  async listLabels(credentials: Credentials, params: QueryParams): Promise<Label[]> {
    const client = new CHRobinsonClient(credentials)
    const res = await client.get<{ labels?: CHRLabelResponse[] }>('/labels', {
      page: params.page,
      pageSize: params.limit,
    })
    return (res.labels ?? []).map(transformLabel)
  }

  async getLabel(credentials: Credentials, id: string): Promise<Label> {
    const client = new CHRobinsonClient(credentials)
    const res = await client.get<CHRLabelResponse>(`/labels/${id}`)
    return transformLabel(res)
  }

  async createLabel(credentials: Credentials, data: Partial<Label>): Promise<Label> {
    const client = new CHRobinsonClient(credentials)
    const body = {
      shipmentId: data.shipmentId,
      serviceCode: data.serviceCode,
      format: data.format ?? 'PDF',
    }
    const res = await client.post<CHRLabelResponse>('/labels', body)
    return transformLabel(res)
  }

  async voidLabel(credentials: Credentials, id: string): Promise<void> {
    const client = new CHRobinsonClient(credentials)
    await client.delete(`/labels/${id}`)
  }

  // ── Orders ────────────────────────────────────────────────────────────────

  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const client = new CHRobinsonClient(credentials)
    const res = await client.get<{ orders?: CHROrderResponse[] }>('/orders', {
      page: params.page,
      pageSize: params.limit,
    })
    return (res.orders ?? []).map(transformOrder)
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const client = new CHRobinsonClient(credentials)
    const res = await client.get<CHROrderResponse>(`/orders/${id}`)
    return transformOrder(res)
  }

  async createOrder(credentials: Credentials, data: Partial<Order>): Promise<Order> {
    const client = new CHRobinsonClient(credentials)
    const body = {
      orderNumber: data.orderNumber,
      customerId: data.customerId,
      warehouseId: data.warehouseId,
      currency: data.currency,
      totalAmount: data.totalAmount,
      shippingAmount: data.shippingAmount,
      notes: data.notes,
      requestedServiceCode: data.requestedServiceCode,
    }
    const res = await client.post<CHROrderResponse>('/orders', body)
    return transformOrder(res)
  }

  async updateOrder(
    credentials: Credentials,
    id: string,
    data: Partial<Order>,
  ): Promise<Order> {
    const client = new CHRobinsonClient(credentials)
    const body = {
      orderNumber: data.orderNumber,
      status: data.status,
      notes: data.notes,
      requestedServiceCode: data.requestedServiceCode,
    }
    const res = await client.put<CHROrderResponse>(`/orders/${id}`, body)
    return transformOrder(res)
  }

  async cancelOrder(credentials: Credentials, id: string): Promise<void> {
    const client = new CHRobinsonClient(credentials)
    await client.delete(`/orders/${id}`)
  }
}
