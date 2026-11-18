import type {
  LogisticsAdapter,
  Credentials,
  RateRequestParams,
  QueryParams,
} from '../../adapter/interface'
import type { TrackingEvent } from '../../schema/trackingevent'
import type { Rate } from '../../schema/rate'
import type { Shipment } from '../../schema/shipment'
import type { Carrier } from '../../schema/carrier'
import type { Label } from '../../schema/label'

import { buildAuthUrl, exchangeCredentials, refreshCredentials as doRefresh } from './auth'
import { XpoClient } from './client'

import { transformRate, type XpoRateResponse } from './transform/rate'
import { transformTrackingEvents, type XpoTrackingResponse } from './transform/tracking'
import {
  transformShipment,
  type XpoBolListResponse,
  type XpoBolGetResponse,
} from './transform/shipment'
import { transformCarrier } from './transform/carrier'
import { transformLabel, type XpoBolLabelResponse } from './transform/label'

// ── Resource coverage ──────────────────────────────────────────────────────
// Unavailable: manifest — XPO manifest reports are portal-only (Reports section); no REST API endpoint exists
// Unavailable: order    — XPO is an LTL freight carrier with no order management concept; pickup requests map to shipments, not orders
// Unavailable: warehouse — XPO has no warehouse management API; service centers are not exposed as warehouses via the LTL API

export interface XpoAdapterConfig {
  clientId?: string
  clientSecret?: string
  sandbox?: boolean
  accountNumber?: string
}

export class XpoAdapter implements LogisticsAdapter {
  readonly platform = 'xpo'
  readonly version = '1'

  private config: XpoAdapterConfig

  constructor(config: XpoAdapterConfig = {}) {
    this.config = config
  }

  // ── Auth ───────────────────────────────────────────────────────────────────

  getAuthUrl(state: string): string {
    return buildAuthUrl(state)
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    if (!this.config.clientId || !this.config.clientSecret) {
      throw new Error('xpo: clientId and clientSecret are required')
    }
    return exchangeCredentials({
      clientId: this.config.clientId,
      clientSecret: this.config.clientSecret,
      sandbox: this.config.sandbox,
    })
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return doRefresh(credentials)
  }

  // ── Rates (LTL Rate Quotes) ───────────────────────────────────────────────

  async getRates(credentials: Credentials, params: RateRequestParams): Promise<Rate[]> {
    const client = new XpoClient(credentials)
    const firstPkg = params.packages[0]

    const body = {
      accountNumber: this.config.accountNumber,
      origin: {
        postalCode: params.originAddress.postalCode,
        stateProvince: params.originAddress.state,
        city: params.originAddress.city,
        country: params.originAddress.country ?? 'US',
      },
      destination: {
        postalCode: params.destinationAddress.postalCode,
        stateProvince: params.destinationAddress.state,
        city: params.destinationAddress.city,
        country: params.destinationAddress.country ?? 'US',
      },
      commodities: [
        {
          weight: firstPkg?.weight
            ? { value: firstPkg.weight.value, unit: firstPkg.weight.unit === 'kg' ? 'KG' : 'LB' }
            : undefined,
          dimensions: firstPkg?.dimensions
            ? {
                length: firstPkg.dimensions.length,
                width: firstPkg.dimensions.width,
                height: firstPkg.dimensions.height,
                unit: firstPkg.dimensions.unit === 'cm' ? 'CM' : 'IN',
              }
            : undefined,
        },
      ],
    }

    const res = await client.post<XpoRateResponse>('/rate-quotes', body)
    return (res.rateQuotes ?? []).map(transformRate)
  }

  // ── Tracking Events (PRO Number) ──────────────────────────────────────────

  async getTrackingEvents(credentials: Credentials, trackingNumber: string): Promise<TrackingEvent[]> {
    const client = new XpoClient(credentials)
    const res = await client.get<XpoTrackingResponse>(`/tracking/${trackingNumber}`)
    return transformTrackingEvents(res)
  }

  // ── Shipments (XPO Bill of Lading) ────────────────────────────────────────
  // Endpoint: GET /billoflading/1.0/billsoflading/requester (list)
  //           GET /billoflading/1.0/billsoflading/{bolInstId}/requester (get)
  // Note: The XPO client baseURL is /ltl/v1; paths below are relative to the
  //       billoflading sub-API. Production base: https://api.ltl.xpo.com

  async listShipments(credentials: Credentials, params: QueryParams): Promise<Shipment[]> {
    const client = new XpoClient(credentials)
    const res = await client.get<XpoBolListResponse>('/billsoflading/requester', params as Record<string, unknown>)
    const items = res.data?.bolInfo ?? []
    return items.map(transformShipment)
  }

  async getShipment(credentials: Credentials, id: string): Promise<Shipment> {
    const client = new XpoClient(credentials)
    const res = await client.get<XpoBolGetResponse>(`/billsoflading/${id}/requester`)
    const raw = res.data?.bolInfo
    if (!raw) throw new Error(`xpo: no bolInfo in response for id=${id}`)
    return transformShipment(raw)
  }

  // ── Carriers (derived — XPO is a single LTL carrier; no list endpoint) ───

  async listCarriers(_credentials: Credentials, _params: QueryParams): Promise<Carrier[]> {
    return [transformCarrier()]
  }

  async getCarrier(_credentials: Credentials, _id: string): Promise<Carrier> {
    return transformCarrier()
  }

  // ── Labels (derived from BOL creation with shipping labels) ───────────────
  // Endpoint: POST /billoflading/1.0/billsoflading (create with label)
  //           GET  /imaging/1.0/shipments/{proNumber}/labels (retrieve hosted URL)

  async createLabel(credentials: Credentials, data: Partial<Label>): Promise<Label> {
    const client = new XpoClient(credentials)
    const raw = await client.post<XpoBolLabelResponse>('/billsoflading', {
      requester: { roleCd: 'S' },
      referenceNumbers: {
        proNbr: data.trackingNumber,
      },
      images: {
        includeBol: false,
        includeShippingLabels: true,
        shippingLabels: {
          format: data.format ?? 'PDF',
          quantity: 1,
        },
      },
    })
    return transformLabel(raw)
  }
}
