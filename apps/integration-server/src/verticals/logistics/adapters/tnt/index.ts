// ── Resource coverage ──────────────────────────────────────────────
// Unavailable: manifest  — TNT's manifest is a print document produced by the XML-based ExpressConnect system; no REST endpoint exposes manifest objects with list/get semantics
// Unavailable: order     — TNT Express is a carrier network with no order management concept or API
// Unavailable: warehouse — TNT does not expose depot/warehouse locations via any public REST API

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
import type { Label } from '../../schema/label'

import { buildAuthUrl, exchangeApiKey, refreshCredentials as doRefresh } from './auth'
import { TntClient } from './client'

import { transformShipment, type TntShipment } from './transform/shipment'
import { transformTracking, type TntTracking } from './transform/tracking'
import { transformRate, type TntRateResponse } from './transform/rate'
import { transformCarrier } from './transform/carrier'
import { transformShipmentToLabel } from './transform/label'

interface TntAdapterConfig {
  sandbox?: boolean
}

export class TntAdapter implements LogisticsAdapter {
  readonly platform = 'tnt'
  readonly version = '1'

  constructor(_config: TntAdapterConfig = {}) {}

  // ── Auth ───────────────────────────────────────────────────────────────────

  getAuthUrl(state: string): string {
    return buildAuthUrl(state)
  }

  async exchangeCode(code: string, _redirectUri: string): Promise<Credentials> {
    // For TNT the "code" is the "username:password" pair.
    return exchangeApiKey(code)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return doRefresh(credentials)
  }

  // ── Tracking Events ────────────────────────────────────────────────────────

  async getTrackingEvents(credentials: Credentials, trackingNumber: string): Promise<TrackingEvent[]> {
    const client = new TntClient(credentials)
    const raw = await client.get<TntTracking>(`shipment/${trackingNumber}`)
    return transformTracking(raw, trackingNumber)
  }

  // ── Shipments ──────────────────────────────────────────────────────────────

  async createShipment(credentials: Credentials, data: Partial<Shipment>): Promise<Shipment> {
    const client = new TntClient(credentials)
    const raw = await client.post<TntShipment>('shipment', {
      sender: data.originAddress
        ? {
            name: data.originAddress.name,
            companyName: data.originAddress.company,
            addressLine1: data.originAddress.street1,
            addressLine2: data.originAddress.street2,
            city: data.originAddress.city,
            province: data.originAddress.state,
            postcode: data.originAddress.postalCode,
            country: data.originAddress.country,
            phone: data.originAddress.phone,
            email: data.originAddress.email,
          }
        : undefined,
      receiver: data.destinationAddress
        ? {
            name: data.destinationAddress.name,
            companyName: data.destinationAddress.company,
            addressLine1: data.destinationAddress.street1,
            addressLine2: data.destinationAddress.street2,
            city: data.destinationAddress.city,
            province: data.destinationAddress.state,
            postcode: data.destinationAddress.postalCode,
            country: data.destinationAddress.country,
            phone: data.destinationAddress.phone,
            email: data.destinationAddress.email,
          }
        : undefined,
      totalWeight: data.totalWeight?.value,
      weightUnit: data.totalWeight?.unit,
      pieces: data.dimensions
        ? [
            {
              sequenceNumber: 1,
              length: data.dimensions.length,
              width: data.dimensions.width,
              height: data.dimensions.height,
            },
          ]
        : undefined,
      dimensionUnit: data.dimensions?.unit,
      serviceCode: data.serviceCode,
      reference: data.reference,
    })
    return transformShipment(raw)
  }

  // ── Carriers ───────────────────────────────────────────────────────────────

  async listCarriers(_credentials: Credentials, _params: QueryParams): Promise<Carrier[]> {
    // TNT is itself a single carrier; return a static representation.
    return [transformCarrier([])]
  }

  async getCarrier(_credentials: Credentials, _id: string): Promise<Carrier> {
    return transformCarrier([])
  }

  // ── Labels ─────────────────────────────────────────────────────────────────

  async getLabel(credentials: Credentials, id: string): Promise<Label> {
    const client = new TntClient(credentials)
    const raw = await client.get<TntShipment>(`shipment/${id}`)
    return transformShipmentToLabel(raw)
  }

  // ── Rates ──────────────────────────────────────────────────────────────────

  async getRates(credentials: Credentials, params: RateRequestParams): Promise<Rate[]> {
    const client = new TntClient(credentials)
    const pkg = params.packages[0]
    const raw = await client.post<TntRateResponse>('pricing/getprice', {
      sender: {
        city: params.originAddress.city,
        postcode: params.originAddress.postalCode,
        country: params.originAddress.country,
      },
      receiver: {
        city: params.destinationAddress.city,
        postcode: params.destinationAddress.postalCode,
        country: params.destinationAddress.country,
      },
      weight: pkg?.weight?.value,
      weightUnit: pkg?.weight?.unit ?? 'kg',
      numberOfPieces: params.packages.length,
    })
    return (raw.rateOptions ?? []).map(transformRate)
  }
}
