// ── Resource coverage ──────────────────────────────────────────────────────
// Available:   carrier, rate, shipment, trackingevent
// Unavailable: label     — Truckstop is a freight load board, not a parcel carrier; no label generation API
// Unavailable: manifest  — parcel-manifest concept does not apply; Document API covers BOL/rate confirmations only
// Unavailable: order     — no order resource distinct from loads; loads are the core entity
// Unavailable: warehouse — no warehouse management API; platform manages freight loads and carrier matching only

import type {
  LogisticsAdapter,
  Credentials,
  QueryParams,
  RateRequestParams,
} from '../../adapter/interface'
import type { Shipment } from '../../schema/shipment'
import type { Carrier } from '../../schema/carrier'
import type { TrackingEvent } from '../../schema/trackingevent'
import type { Rate } from '../../schema/rate'

import { buildAuthUrl, exchangeCredentials, refreshCredentials as doRefresh } from './auth'
import { TruckstopClient } from './client'

import { transformLoad, type TruckstopLoad } from './transform/shipment'
import { transformTrackingEvents, type TruckstopTenderResponse } from './transform/tracking'
import { transformRateResponse, type TruckstopRateEstimateResponse } from './transform/rate'
import { transformCarrier, type TruckstopCarrierProfile } from './transform/carrier'

export interface TruckstopAdapterConfig {
  clientId?: string
  clientSecret?: string
  /**
   * Username for Resource Owner Password grant (proprietary integrations).
   * Leave unset to use authorization-code flow.
   */
  username?: string
  /** Password for Resource Owner Password grant. */
  password?: string
}

export class TruckstopAdapter implements LogisticsAdapter {
  readonly platform = 'truckstop'
  readonly version = '1'

  private config: TruckstopAdapterConfig

  constructor(config: TruckstopAdapterConfig = {}) {
    this.config = config
  }

  // ── Auth ───────────────────────────────────────────────────────────────────

  getAuthUrl(state: string): string {
    return buildAuthUrl(state)
  }

  async exchangeCode(code: string, redirectUri: string): Promise<Credentials> {
    if (!this.config.clientId || !this.config.clientSecret) {
      throw new Error('truckstop: clientId and clientSecret are required')
    }
    return exchangeCredentials(
      {
        clientId: this.config.clientId,
        clientSecret: this.config.clientSecret,
        username: this.config.username,
        password: this.config.password,
      },
      code,
      redirectUri,
    )
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return doRefresh(credentials)
  }

  // ── Rates ──────────────────────────────────────────────────────────────────

  async getRates(credentials: Credentials, params: RateRequestParams): Promise<Rate[]> {
    const client = new TruckstopClient(credentials)

    const body = {
      originCity: params.originAddress.city,
      originState: params.originAddress.state,
      originZip: params.originAddress.postalCode,
      destinationCity: params.destinationAddress.city,
      destinationState: params.destinationAddress.state,
      destinationZip: params.destinationAddress.postalCode,
      weight: params.packages[0]?.weight?.value,
      equipmentType: params.serviceCodes?.[0],
    }

    const res = await client.post<TruckstopRateEstimateResponse>(
      '/modeledrate/v3/booked/rateestimate',
      body,
    )
    return transformRateResponse(res)
  }

  // ── Tracking Events ────────────────────────────────────────────────────────

  async getTrackingEvents(credentials: Credentials, trackingNumber: string): Promise<TrackingEvent[]> {
    const client = new TruckstopClient(credentials)
    // Tracking in Truckstop is surfaced through the tendering API
    const res = await client.get<TruckstopTenderResponse>(
      `/tendering/v1/load/${encodeURIComponent(trackingNumber)}`,
    )
    return transformTrackingEvents(res)
  }

  // ── Shipments (Loads) ──────────────────────────────────────────────────────

  async listShipments(credentials: Credentials, params: QueryParams): Promise<Shipment[]> {
    const client = new TruckstopClient(credentials)
    const res = await client.post<{ loads?: TruckstopLoad[] }>('/loadmanagement/v2/load/search', {
      pagination: {
        page: params.page ?? 1,
        pageSize: params.limit ?? 50,
      },
    })
    return (res.loads ?? []).map(transformLoad)
  }

  async getShipment(credentials: Credentials, id: string): Promise<Shipment> {
    const client = new TruckstopClient(credentials)
    const res = await client.get<TruckstopLoad>(
      `/loadmanagement/v2/load/${encodeURIComponent(id)}`,
    )
    return transformLoad(res)
  }

  async createShipment(credentials: Credentials, data: Partial<Shipment>): Promise<Shipment> {
    const client = new TruckstopClient(credentials)

    const originStop = data.originAddress
      ? {
          stopType: 'Pickup',
          locationName: data.originAddress.company ?? data.originAddress.name,
          address1: data.originAddress.street1,
          address2: data.originAddress.street2,
          city: data.originAddress.city,
          state: data.originAddress.state,
          zip: data.originAddress.postalCode,
          country: data.originAddress.country,
        }
      : undefined

    const destStop = data.destinationAddress
      ? {
          stopType: 'Delivery',
          locationName: data.destinationAddress.company ?? data.destinationAddress.name,
          address1: data.destinationAddress.street1,
          address2: data.destinationAddress.street2,
          city: data.destinationAddress.city,
          state: data.destinationAddress.state,
          zip: data.destinationAddress.postalCode,
          country: data.destinationAddress.country,
        }
      : undefined

    const stops = [originStop, destStop].filter(Boolean)

    const body: Record<string, unknown> = {
      loadNumber: data.reference,
      loadStops: stops.length > 0 ? stops : undefined,
      equipmentAttributes: data.serviceCode
        ? { equipmentType: data.serviceCode, weight: data.totalWeight?.value }
        : undefined,
      rateAttributes:
        data.cost != null
          ? {
              rateType: 'FLAT',
              // cost.amount is in minor units — convert back to dollars
              amount: (data.cost.amount ?? 0) / 100,
              currency: data.cost.currency,
            }
          : undefined,
      note: data.notes,
    }

    const res = await client.post<TruckstopLoad>('/loadmanagement/v2/load', body)
    return transformLoad(res)
  }

  async cancelShipment(credentials: Credentials, id: string): Promise<void> {
    const client = new TruckstopClient(credentials)
    await client.delete(`/loadmanagement/v2/load/${encodeURIComponent(id)}`)
  }

  // ── Carriers ───────────────────────────────────────────────────────────────

  async listCarriers(credentials: Credentials, params: QueryParams): Promise<Carrier[]> {
    const client = new TruckstopClient(credentials)
    const res = await client.post<{ carriers?: TruckstopCarrierProfile[] }>(
      '/companymanagement/v2/carrier/search',
      {
        pagination: {
          page: params.page ?? 1,
          pageSize: params.limit ?? 50,
        },
      },
    )
    return (res.carriers ?? []).map(transformCarrier)
  }

  async getCarrier(credentials: Credentials, id: string): Promise<Carrier> {
    const client = new TruckstopClient(credentials)
    const res = await client.get<TruckstopCarrierProfile>(
      `/companymanagement/v2/carrier/${encodeURIComponent(id)}`,
    )
    return transformCarrier(res)
  }
}
