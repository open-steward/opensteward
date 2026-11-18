// ── Resource coverage ──────────────────────────────────────────────────────────
// Unavailable: manifest  — ODFL REST API (BOL, Pickup, Tracking, Document) has no manifest endpoint
// Unavailable: order     — ODFL is an LTL freight carrier with no order management API
// Unavailable: warehouse — ODFL exposes no service center / terminal data via REST API

import type {
  LogisticsAdapter,
  Credentials,
  RateRequestParams,
  QueryParams,
} from '../../adapter/interface'
import type { Shipment } from '../../schema/shipment'
import type { TrackingEvent } from '../../schema/trackingevent'
import type { Rate } from '../../schema/rate'
import type { Carrier } from '../../schema/carrier'
import type { Label } from '../../schema/label'

import { buildAuthUrl, exchangeCredentials, refreshCredentials as doRefresh } from './auth'
import { OldDominionClient } from './client'

import { transformRate, type OldDominionRateResponse } from './transform/rate'
import { transformTrackingEvents, type OldDominionTrackingResponse } from './transform/tracking'
import { transformShipment, type OldDominionPickupResponse } from './transform/shipment'
import { transformCarrier } from './transform/carrier'
import { transformLabel, type OldDominionBOLResponse } from './transform/label'

export interface OldDominionAdapterConfig {
  clientId?: string
  clientSecret?: string
  sandbox?: boolean
  accountNumber?: string
}

export class OldDominionAdapter implements LogisticsAdapter {
  readonly platform = 'old-dominion'
  readonly version = '1'

  private config: OldDominionAdapterConfig

  constructor(config: OldDominionAdapterConfig = {}) {
    this.config = config
  }

  // ── Auth ───────────────────────────────────────────────────────────────────

  getAuthUrl(state: string): string {
    return buildAuthUrl(state)
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    if (!this.config.clientId || !this.config.clientSecret) {
      throw new Error('old-dominion: clientId and clientSecret are required')
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
    const client = new OldDominionClient(credentials)
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

    const res = await client.post<OldDominionRateResponse>('/rating/rate-quote', body)
    return (res.rateQuotes ?? []).map(transformRate)
  }

  // ── Tracking Events (PRO Number) ──────────────────────────────────────────

  async getTrackingEvents(credentials: Credentials, trackingNumber: string): Promise<TrackingEvent[]> {
    const client = new OldDominionClient(credentials)
    const res = await client.get<OldDominionTrackingResponse>(`/tracking/shipments/${trackingNumber}`)
    return transformTrackingEvents(res)
  }

  // ── Carrier (static ODFL identity — no /carriers list endpoint) ───────────

  async listCarriers(_credentials: Credentials, _params: QueryParams): Promise<Carrier[]> {
    return [transformCarrier()]
  }

  async getCarrier(_credentials: Credentials, _id: string): Promise<Carrier> {
    return transformCarrier()
  }

  // ── Labels (via Bill of Lading API — POST /bill-of-lading/createBOL) ──────

  async createLabel(credentials: Credentials, data: Partial<Label>): Promise<Label> {
    const client = new OldDominionClient(credentials)
    const body = {
      accountNumber: this.config.accountNumber,
      shipmentReference: data.shipmentId,
    }
    const res = await client.post<OldDominionBOLResponse>('/bill-of-lading/createBOL', body)
    return transformLabel(res)
  }

  // ── Pickup Requests (LTL Shipments) ───────────────────────────────────────

  async createShipment(credentials: Credentials, data: Partial<Shipment>): Promise<Shipment> {
    const client = new OldDominionClient(credentials)

    const body = {
      accountNumber: this.config.accountNumber,
      requestorName: data.originAddress?.name,
      requestorPhone: data.originAddress?.phone,
      requestorEmail: data.originAddress?.email,
      pickupAddress: {
        name: data.originAddress?.name,
        company: data.originAddress?.company,
        addressLine1: data.originAddress?.street1,
        addressLine2: data.originAddress?.street2,
        city: data.originAddress?.city,
        stateProvince: data.originAddress?.state,
        postalCode: data.originAddress?.postalCode,
        country: data.originAddress?.country ?? 'US',
      },
      destinationAddress: {
        city: data.destinationAddress?.city,
        stateProvince: data.destinationAddress?.state,
        postalCode: data.destinationAddress?.postalCode,
        country: data.destinationAddress?.country ?? 'US',
      },
      weight: data.totalWeight
        ? { value: data.totalWeight.value, unit: data.totalWeight.unit === 'kg' ? 'KG' : 'LB' }
        : undefined,
      reference: data.reference,
      notes: data.notes,
    }

    const res = await client.post<OldDominionPickupResponse>('/pickup-requests', body)
    return transformShipment(res)
  }
}
