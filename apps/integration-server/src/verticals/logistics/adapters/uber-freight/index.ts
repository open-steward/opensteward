// ── Resource coverage ──────────────────────────────────────────────
// Unavailable: carrier  — Uber Freight IS the sole carrier/broker; no /carriers list endpoint exists in their API
// Unavailable: label    — Uber Freight is a freight brokerage, not a parcel carrier; no label issuance or /labels endpoint
// Unavailable: manifest — No manifest concept or endpoint documented for freight brokerage operations
// Unverified:  warehouse — Scheduling/facility API exists but /warehouses list endpoint not confirmed; docs behind registration wall

import type {
  LogisticsAdapter,
  Credentials,
  QueryParams,
  RateRequestParams,
} from '../../adapter/interface'
import type { Shipment } from '../../schema/shipment'
import type { TrackingEvent } from '../../schema/trackingevent'
import type { Rate } from '../../schema/rate'
import type { Order } from '../../schema/order'

import { buildAuthUrl, exchangeCredentials, refreshCredentials as doRefresh } from './auth'
import { UberFreightClient } from './client'

import { transformTrackingEvents, type UberFreightTrackingResponse } from './transform/tracking'
import { transformShipment, type UberFreightShipmentResponse } from './transform/shipment'
import { transformRate, type UberFreightRatesResponse } from './transform/rate'
import { transformTrackingEvent, type UberFreightSingleTrackingEvent } from './transform/trackingevent'
import { transformOrder, type UberFreightOrderRaw } from './transform/order'

export interface UberFreightAdapterConfig {
  clientId?: string
  clientSecret?: string
}

export class UberFreightAdapter implements LogisticsAdapter {
  readonly platform = 'uber-freight'
  readonly version = '1'

  private config: UberFreightAdapterConfig

  constructor(config: UberFreightAdapterConfig = {}) {
    this.config = config
  }

  // ── Auth ───────────────────────────────────────────────────────────────────

  getAuthUrl(state: string): string {
    return buildAuthUrl(state)
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    if (!this.config.clientId || !this.config.clientSecret) {
      throw new Error('uber-freight: clientId and clientSecret are required')
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
    const client = new UberFreightClient(credentials)

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

    const res = await client.post<UberFreightRatesResponse>('/quotes', body)
    return (res.quotes ?? []).map(transformRate)
  }

  // ── Tracking Events ────────────────────────────────────────────────────────

  async getTrackingEvents(credentials: Credentials, trackingNumber: string): Promise<TrackingEvent[]> {
    const client = new UberFreightClient(credentials)
    const res = await client.get<UberFreightTrackingResponse>(`/shipments/${trackingNumber}/tracking`)
    return transformTrackingEvents(res)
  }

  /**
   * List tracking events for a shipment identified by tracking number.
   *
   * GET /shipments/{trackingNumber}/tracking
   * Callers pass `params.trackingNumber` (or `params.id`) to identify the load.
   */
  async listTrackingEvents(credentials: Credentials, params: QueryParams): Promise<TrackingEvent[]> {
    const trackingNumber = String(params['trackingNumber'] ?? params['id'] ?? '')
    if (!trackingNumber) return []
    const client = new UberFreightClient(credentials)
    const res = await client.get<UberFreightTrackingResponse>(`/shipments/${trackingNumber}/tracking`)
    const events: UberFreightSingleTrackingEvent[] = res.events ?? []
    const tn = res.shipmentId ?? trackingNumber
    if (events.length > 0) {
      return events.map((evt) => transformTrackingEvent(evt, tn))
    }
    // No events — synthesise a single entry from top-level status.
    return [
      transformTrackingEvent(
        { status: res.status ?? null, description: res.statusDescription ?? null },
        tn,
      ),
    ]
  }

  // ── Shipments ──────────────────────────────────────────────────────────────

  async createShipment(credentials: Credentials, data: Partial<Shipment>): Promise<Shipment> {
    const client = new UberFreightClient(credentials)

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

    const res = await client.post<UberFreightShipmentResponse>('/shipments', body)
    return transformShipment(res)
  }

  async cancelShipment(credentials: Credentials, id: string): Promise<void> {
    const client = new UberFreightClient(credentials)
    await client.delete(`/shipments/${id}`)
  }

  // ── Shipment Listing ──────────────────────────────────────────────────────

  async listShipments(credentials: Credentials, params: QueryParams): Promise<Shipment[]> {
    const client = new UberFreightClient(credentials)
    const res = await client.get<{ shipments: UberFreightShipmentResponse[] }>('/shipments', {
      page: params.page,
      limit: params.limit,
    })
    return (res.shipments ?? []).map(transformShipment)
  }

  async getShipment(credentials: Credentials, id: string): Promise<Shipment> {
    const client = new UberFreightClient(credentials)
    const res = await client.get<UberFreightShipmentResponse>(`/shipments/${id}`)
    return transformShipment(res)
  }

  // ── Orders (derived from loads/shipments) ─────────────────────────────────
  // Uber Freight's "load" (tender) is the closest concept to an order.
  // The /shipments endpoint represents tendered loads and is reused here.

  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const client = new UberFreightClient(credentials)
    const res = await client.get<{ shipments: UberFreightOrderRaw[] }>('/shipments', {
      page: params.page,
      limit: params.limit,
    })
    return (res.shipments ?? []).map(transformOrder)
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const client = new UberFreightClient(credentials)
    const res = await client.get<UberFreightOrderRaw>(`/shipments/${id}`)
    return transformOrder(res)
  }
}
