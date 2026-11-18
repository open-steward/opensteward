// ── Resource coverage ──────────────────────────────────────────────────────
// Built (derived): carrier  — Dayton Freight is itself the single LTL carrier;
//                             record derived from publicly documented services.
// Unverified:      label    — REST API is fully gated behind auth; no public
//                             docs confirm a Labels/ endpoint exists.
// Unverified:      manifest — No documented REST manifest endpoint; LTL
//                             carriers do not expose parcel-style manifests.
// Unverified:      order    — No documented REST order endpoint; Dayton Freight
//                             has no order-management API.
// Unverified:      warehouse — SOAP service has GetAllServiceCenterInformation
//                             but REST API docs are behind authentication.

import { simpleApiKey } from '@opensteward/shared'
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

import { buildAuthUrl, exchangeApiKey, refreshCredentials as doRefresh } from './auth'
import { DaytonFreightClient } from './client'

import { transformShipment, type DaytonShipment } from './transform/shipment'
import { transformTracking, type DaytonTrackingResponse } from './transform/tracking'
import { transformRate, type DaytonRateResponse } from './transform/rate'
import { transformCarrier } from './transform/carrier'

interface DaytonFreightAdapterConfig {
  sandbox?: boolean
}
const SIMPLE_API_KEY_FORM = simpleApiKey()


export class DaytonFreightAdapter implements LogisticsAdapter {

  // Connect Link support — single API-key form.

  credentialFields = SIMPLE_API_KEY_FORM.credentialFields

  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'dayton-freight'
  readonly version = '1'

  constructor(_config: DaytonFreightAdapterConfig = {}) {}

  getAuthUrl(state: string): string {
    return buildAuthUrl(state)
  }

  async exchangeCode(code: string, _redirectUri: string): Promise<Credentials> {
    return exchangeApiKey(code)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return doRefresh(credentials)
  }

  async getTrackingEvents(credentials: Credentials, trackingNumber: string): Promise<TrackingEvent[]> {
    const client = new DaytonFreightClient(credentials)
    const raw = await client.get<DaytonTrackingResponse>(
      `Tracking/Shipments/${trackingNumber}`,
    )
    return transformTracking(raw)
  }

  async createShipment(credentials: Credentials, data: Partial<Shipment>): Promise<Shipment> {
    const client = new DaytonFreightClient(credentials)
    const raw = await client.post<DaytonShipment>('Shipments/Add', {
      shipper: data.originAddress
        ? {
            name: data.originAddress.name,
            company: data.originAddress.company,
            address1: data.originAddress.street1,
            address2: data.originAddress.street2,
            city: data.originAddress.city,
            state: data.originAddress.state,
            zipCode: data.originAddress.postalCode,
            country: data.originAddress.country,
            phone: data.originAddress.phone,
            email: data.originAddress.email,
          }
        : undefined,
      consignee: data.destinationAddress
        ? {
            name: data.destinationAddress.name,
            company: data.destinationAddress.company,
            address1: data.destinationAddress.street1,
            address2: data.destinationAddress.street2,
            city: data.destinationAddress.city,
            state: data.destinationAddress.state,
            zipCode: data.destinationAddress.postalCode,
            country: data.destinationAddress.country,
            phone: data.destinationAddress.phone,
            email: data.destinationAddress.email,
          }
        : undefined,
      totalWeight: data.totalWeight?.value,
      weightUnit: data.totalWeight?.unit ?? 'lb',
      serviceLevel: data.serviceCode,
      reference: data.reference,
    })
    return transformShipment(raw)
  }

  // ── Carriers ───────────────────────────────────────────────────────────────

  async listCarriers(_credentials: Credentials, _params: QueryParams): Promise<Carrier[]> {
    return [transformCarrier()]
  }

  async getCarrier(_credentials: Credentials, _id: string): Promise<Carrier> {
    return transformCarrier()
  }

  async getRates(credentials: Credentials, params: RateRequestParams): Promise<Rate[]> {
    const client = new DaytonFreightClient(credentials)
    const pkg = params.packages[0]
    const raw = await client.post<DaytonRateResponse>('Rates/Quote', {
      origin: {
        city: params.originAddress.city,
        state: params.originAddress.state,
        zipCode: params.originAddress.postalCode,
        country: params.originAddress.country ?? 'US',
      },
      destination: {
        city: params.destinationAddress.city,
        state: params.destinationAddress.state,
        zipCode: params.destinationAddress.postalCode,
        country: params.destinationAddress.country ?? 'US',
      },
      commodity: {
        weight: pkg?.weight?.value,
        weightUnit: pkg?.weight?.unit ?? 'lb',
        pieces: params.packages.length,
      },
    })
    return raw.quote ? [transformRate(raw.quote)] : []
  }
}
