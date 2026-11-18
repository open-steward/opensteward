import type {
  LogisticsAdapter,
  Credentials,
  QueryParams,
  RateRequestParams,
} from '../../adapter/interface'
import type { Shipment } from '../../schema/shipment'
import type { TrackingEvent } from '../../schema/trackingevent'
import type { Rate } from '../../schema/rate'

import { buildAuthUrl, exchangeCode as doExchangeCode, refreshCredentials as doRefresh } from './auth'
import { DatClient } from './client'
import { transformTrackingEvents, type DatLoadTrackingResponse } from './transform/tracking'

// ── Resource coverage ──────────────────────────────────────────────
// Available:   shipment, rate, trackingevent
// Unverified:  carrier  — DAT Carrier Management Suite exists in DAT One UI but no public REST carrier-listing endpoint documented; API docs behind authenticated portal
// Unverified:  label    — DAT is a freight load-board/rate platform, not a parcel carrier; no label endpoint documented publicly; API docs behind authenticated portal
// Unverified:  manifest — freight load-board platform; no manifest endpoint documented publicly; API docs behind authenticated portal
// Unverified:  order    — loads (/loads) are the booking primitive; no dedicated orders endpoint documented publicly; API docs behind authenticated portal
// Unverified:  warehouse — non-asset-based freight marketplace; no warehouse management capability documented publicly; API docs behind authenticated portal

export interface DatAdapterConfig {
  clientId?: string
  clientSecret?: string
  redirectUri?: string
}

interface DatLoadResponse {
  loadId: string
  referenceNumber?: string
  status?: string
  serviceMode?: string
  createdAt?: string
  totalWeight?: {
    value?: number
    unit?: string
  }
  origin?: {
    city?: string
    state?: string
    postalCode?: string
    country?: string
  }
  destination?: {
    city?: string
    state?: string
    postalCode?: string
    country?: string
  }
  [key: string]: unknown
}

interface DatRateQuote {
  quoteId?: string
  mode?: string
  carrier?: string
  rateUsd?: number
  estimatedTransitDays?: number
  estimatedDeliveryDate?: string
  [key: string]: unknown
}

interface DatRateResponse {
  quotes?: DatRateQuote[]
  [key: string]: unknown
}

function transformLoad(raw: DatLoadResponse): Shipment {
  return {
    id: raw.loadId,
    status: 'LABEL_CREATED',
    trackingNumber: raw.referenceNumber ?? undefined,
    carrierId: 'dat',
    serviceCode: raw.serviceMode ?? undefined,
    labelUrl: undefined,
    createdAt: raw.createdAt ? new Date(raw.createdAt) : new Date(),
    metadata: raw as Record<string, unknown>,
  }
}

function transformRate(raw: DatRateQuote): Rate {
  return {
    id: raw.quoteId ?? undefined,
    carrierId: raw.carrier ?? 'dat',
    serviceCode: raw.mode ?? undefined,
    currency: 'USD',
    totalAmount: raw.rateUsd != null ? raw.rateUsd : undefined,
    transitDays: raw.estimatedTransitDays ?? undefined,
    estimatedDeliveryAt: raw.estimatedDeliveryDate ? new Date(raw.estimatedDeliveryDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

export class DatAdapter implements LogisticsAdapter {
  readonly platform = 'dat'
  readonly version = '1'

  private config: DatAdapterConfig

  constructor(config: DatAdapterConfig = {}) {
    this.config = config
  }

  // ── Auth ───────────────────────────────────────────────────────────────────

  getAuthUrl(state: string, overrideScopes?: string[]): string {
    if (!this.config.clientId) {
      throw new Error('dat: clientId is required to build auth URL')
    }
    return buildAuthUrl(state, {
      clientId: this.config.clientId,
      redirectUri: this.config.redirectUri,
      scopes: overrideScopes,
    })
  }

  async exchangeCode(code: string, _redirectUri: string): Promise<Credentials> {
    if (!this.config.clientId || !this.config.clientSecret) {
      throw new Error('dat: clientId and clientSecret are required')
    }
    return doExchangeCode(code, {
      clientId: this.config.clientId,
      clientSecret: this.config.clientSecret,
      redirectUri: this.config.redirectUri ?? _redirectUri,
    })
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return doRefresh(credentials)
  }

  // ── Rates ──────────────────────────────────────────────────────────────────

  async getRates(credentials: Credentials, params: RateRequestParams): Promise<Rate[]> {
    const client = new DatClient(credentials)

    const body = {
      originLocation: {
        city: params.originAddress.city,
        state: params.originAddress.state,
        postalCode: params.originAddress.postalCode,
        country: params.originAddress.country ?? 'US',
      },
      destinationLocation: {
        city: params.destinationAddress.city,
        state: params.destinationAddress.state,
        postalCode: params.destinationAddress.postalCode,
        country: params.destinationAddress.country ?? 'US',
      },
      equipment: 'VAN',
      weight: params.packages[0]?.weight
        ? {
            value: params.packages[0].weight.value,
            unit: params.packages[0].weight.unit === 'kg' ? 'KG' : 'LBS',
          }
        : undefined,
    }

    const res = await client.post<DatRateResponse>('/rates/quotes', body)
    return (res.quotes ?? []).map(transformRate)
  }

  // ── Tracking Events ────────────────────────────────────────────────────────

  async getTrackingEvents(credentials: Credentials, trackingNumber: string): Promise<TrackingEvent[]> {
    const client = new DatClient(credentials)
    const res = await client.get<DatLoadTrackingResponse>(`/loads/${trackingNumber}/tracking`)
    return transformTrackingEvents(res)
  }

  // ── Shipments (Loads) ──────────────────────────────────────────────────────

  async listShipments(credentials: Credentials, params: QueryParams): Promise<Shipment[]> {
    const client = new DatClient(credentials)
    const res = await client.get<{ loads: DatLoadResponse[] }>('/loads', {
      page: params.page,
      limit: params.limit,
    })
    return (res.loads ?? []).map(transformLoad)
  }

  async getShipment(credentials: Credentials, id: string): Promise<Shipment> {
    const client = new DatClient(credentials)
    const res = await client.get<DatLoadResponse>(`/loads/${id}`)
    return transformLoad(res)
  }

  async createShipment(credentials: Credentials, data: Partial<Shipment>): Promise<Shipment> {
    const client = new DatClient(credentials)

    const body = {
      referenceNumber: data.trackingNumber,
      serviceMode: data.serviceCode,
      originLocation: data.originAddress
        ? {
            city: data.originAddress.city,
            state: data.originAddress.state,
            postalCode: data.originAddress.postalCode,
            country: data.originAddress.country ?? 'US',
          }
        : undefined,
      destinationLocation: data.destinationAddress
        ? {
            city: data.destinationAddress.city,
            state: data.destinationAddress.state,
            postalCode: data.destinationAddress.postalCode,
            country: data.destinationAddress.country ?? 'US',
          }
        : undefined,
    }

    const res = await client.post<DatLoadResponse>('/loads', body)
    return transformLoad(res)
  }

  async cancelShipment(credentials: Credentials, id: string): Promise<void> {
    const client = new DatClient(credentials)
    await client.delete(`/loads/${id}`)
  }

  // ── Webhooks ───────────────────────────────────────────────────────────────

  verifyWebhook(_payload: Buffer, _headers: Record<string, string>, _secret: string): boolean {
    return false
  }
}
