// ── Resource coverage ──────────────────────────────────────────────────────────
// Available:   rate, shipment, trackingevent
// Unverified:  carrier   — Coyote is a freight broker; no carrier-listing endpoint found in public docs; API docs require authenticated portal access.
// Unverified:  label     — BOL/label download exists in CoyoteGO UI but no public REST endpoint documented; API docs require authenticated portal access.
// Unverified:  manifest  — Coyote uses BOLs, not parcel manifests; no manifest endpoint documented publicly; API docs require authenticated portal access.
// Unverified:  order     — No orders endpoint documented publicly; /loads is the booking primitive; API docs require authenticated portal access.
// Unverified:  warehouse — Coyote is a non-asset-based freight broker with no warehouses; no warehouse endpoint documented publicly; API docs require authenticated portal access.

import type {
  LogisticsAdapter,
  Credentials,
  QueryParams,
  RateRequestParams,
} from '../../adapter/interface'
import type { Shipment } from '../../schema/shipment'
import type { TrackingEvent } from '../../schema/trackingevent'
import type { Rate } from '../../schema/rate'

import { buildAuthUrl, exchangeCredentials, refreshCredentials as doRefresh } from './auth'
import { CoyoteClient } from './client'

import { transformTrackingEvents, type CoyoteTrackingResponse } from './transform/tracking'
import { transformShipment, type CoyoteShipmentResponse } from './transform/shipment'
import { transformRate, type CoyoteRatesResponse } from './transform/rate'

export interface CoyoteAdapterConfig {
  clientId?: string
  clientSecret?: string
}

export class CoyoteAdapter implements LogisticsAdapter {
  readonly platform = 'coyote'
  readonly version = '1'

  private config: CoyoteAdapterConfig

  constructor(config: CoyoteAdapterConfig = {}) {
    this.config = config
  }

  // ── Auth ───────────────────────────────────────────────────────────────────

  getAuthUrl(state: string): string {
    return buildAuthUrl(state)
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    if (!this.config.clientId || !this.config.clientSecret) {
      throw new Error('coyote: clientId and clientSecret are required')
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
    const client = new CoyoteClient(credentials)

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

    const res = await client.post<CoyoteRatesResponse>('/quotes', body)
    return (res.quotes ?? []).map(transformRate)
  }

  // ── Tracking Events ────────────────────────────────────────────────────────

  async getTrackingEvents(credentials: Credentials, trackingNumber: string): Promise<TrackingEvent[]> {
    const client = new CoyoteClient(credentials)
    const res = await client.get<CoyoteTrackingResponse>(`/loads/${trackingNumber}/tracking`)
    return transformTrackingEvents(res)
  }

  // ── Shipments ──────────────────────────────────────────────────────────────

  async createShipment(credentials: Credentials, data: Partial<Shipment>): Promise<Shipment> {
    const client = new CoyoteClient(credentials)

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

    const res = await client.post<CoyoteShipmentResponse>('/loads', body)
    return transformShipment(res)
  }

  async cancelShipment(credentials: Credentials, id: string): Promise<void> {
    const client = new CoyoteClient(credentials)
    await client.delete(`/loads/${id}`)
  }

  // ── Shipment Listing ──────────────────────────────────────────────────────

  async listShipments(credentials: Credentials, params: QueryParams): Promise<Shipment[]> {
    const client = new CoyoteClient(credentials)
    const res = await client.get<{ loads: CoyoteShipmentResponse[] }>('/loads', {
      page: params.page,
      limit: params.limit,
    })
    return (res.loads ?? []).map(transformShipment)
  }

  async getShipment(credentials: Credentials, id: string): Promise<Shipment> {
    const client = new CoyoteClient(credentials)
    const res = await client.get<CoyoteShipmentResponse>(`/loads/${id}`)
    return transformShipment(res)
  }
}
