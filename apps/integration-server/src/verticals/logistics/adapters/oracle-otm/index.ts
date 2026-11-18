// ── Resource coverage ──────────────────────────────────────────────
// Unavailable: label    — OTM is a TMS planning/execution platform; parcel label
//                         generation is handled by connected carrier systems; no
//                         /labels REST endpoint exists in the OTM REST API.
// Unavailable: manifest — OTM has no manifest concept in its REST API; carrier
//                         manifests are managed externally by parcel carriers.

import type {
  LogisticsAdapter,
  Credentials,
  QueryParams,
  RateRequestParams,
} from '../../adapter/interface'
import type { Shipment } from '../../schema/shipment'
import type { TrackingEvent } from '../../schema/trackingevent'
import type { Order } from '../../schema/order'
import type { Carrier } from '../../schema/carrier'
import type { Warehouse } from '../../schema/warehouse'
import type { Rate } from '../../schema/rate'

import { buildAuthUrl, exchangeCredentials, refreshCredentials as doRefresh } from './auth'
import { OracleOtmClient } from './client'

import { transformTrackingEvents, type OracleOtmTrackingResponse } from './transform/tracking'
import { transformShipment, type OracleOtmShipmentResponse } from './transform/shipment'
import { transformOrder, type OracleOtmOrderResponse } from './transform/order'
import { transformCarrier, type OracleOtmServiceProviderResponse, type OracleOtmServiceProvidersListResponse } from './transform/carrier'
import { transformWarehouse, type OracleOtmLocationResponse, type OracleOtmLocationsListResponse } from './transform/warehouse'
import { transformRate, type OracleOtmRateAndRouteResponse } from './transform/rate'

export interface OracleOtmAdapterConfig {
  clientId?: string
  clientSecret?: string
}

export class OracleOtmAdapter implements LogisticsAdapter {
  readonly platform = 'oracle-otm'
  readonly version = '1'

  private config: OracleOtmAdapterConfig

  constructor(config: OracleOtmAdapterConfig = {}) {
    this.config = config
  }

  // ── Auth ───────────────────────────────────────────────────────────────────

  getAuthUrl(state: string): string {
    return buildAuthUrl(state)
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    if (!this.config.clientId || !this.config.clientSecret) {
      throw new Error('oracle-otm: clientId and clientSecret are required')
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
    const client = new OracleOtmClient(credentials)
    const res = await client.get<OracleOtmTrackingResponse>(`/shipments/${trackingNumber}/tracking`)
    return transformTrackingEvents(res)
  }

  // ── Shipments ──────────────────────────────────────────────────────────────

  async createShipment(credentials: Credentials, data: Partial<Shipment>): Promise<Shipment> {
    const client = new OracleOtmClient(credentials)

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

    const res = await client.post<OracleOtmShipmentResponse>('/shipments', body)
    return transformShipment(res)
  }

  async cancelShipment(credentials: Credentials, id: string): Promise<void> {
    const client = new OracleOtmClient(credentials)
    await client.delete(`/shipments/${id}`)
  }

  // ── Orders ─────────────────────────────────────────────────────────────────

  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const client = new OracleOtmClient(credentials)
    const res = await client.get<{ orders?: OracleOtmOrderResponse[] }>('/orders', {
      page: params.page,
      limit: params.limit,
    })
    return (res.orders ?? []).map(transformOrder)
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const client = new OracleOtmClient(credentials)
    const res = await client.get<OracleOtmOrderResponse>(`/orders/${id}`)
    return transformOrder(res)
  }

  // ── Tracking Events (listTrackingEvents) ──────────────────────────────────

  async listTrackingEvents(credentials: Credentials, params: QueryParams): Promise<TrackingEvent[]> {
    const trackingNumber =
      typeof params.trackingNumber === 'string'
        ? params.trackingNumber
        : typeof params.shipmentId === 'string'
          ? params.shipmentId
          : undefined
    if (!trackingNumber) return []
    return this.getTrackingEvents(credentials, trackingNumber)
  }

  async listShipments(credentials: Credentials, params: QueryParams): Promise<Shipment[]> {
    const client = new OracleOtmClient(credentials)
    const res = await client.get<{ shipments: OracleOtmShipmentResponse[] }>('/shipments', {
      page: params.page,
      limit: params.limit,
    })
    return (res.shipments ?? []).map(transformShipment)
  }

  async getShipment(credentials: Credentials, id: string): Promise<Shipment> {
    const client = new OracleOtmClient(credentials)
    const res = await client.get<OracleOtmShipmentResponse>(`/shipments/${id}`)
    return transformShipment(res)
  }

  // ── Carriers (Service Providers) ───────────────────────────────────────────

  async listCarriers(credentials: Credentials, params: QueryParams): Promise<Carrier[]> {
    const client = new OracleOtmClient(credentials)
    const res = await client.get<OracleOtmServiceProvidersListResponse>('/serviceProviders', {
      limit: params.limit,
      offset: params.page != null && params.limit != null ? (params.page - 1) * params.limit : undefined,
    })
    return (res.items ?? []).map(transformCarrier)
  }

  async getCarrier(credentials: Credentials, id: string): Promise<Carrier> {
    const client = new OracleOtmClient(credentials)
    const res = await client.get<OracleOtmServiceProviderResponse>(`/serviceProviders/${id}`)
    return transformCarrier(res)
  }

  // ── Warehouses (Locations) ─────────────────────────────────────────────────

  async listWarehouses(credentials: Credentials, params: QueryParams): Promise<Warehouse[]> {
    const client = new OracleOtmClient(credentials)
    const res = await client.get<OracleOtmLocationsListResponse>('/locations', {
      limit: params.limit,
      offset: params.page != null && params.limit != null ? (params.page - 1) * params.limit : undefined,
    })
    return (res.items ?? []).map(transformWarehouse)
  }

  async getWarehouse(credentials: Credentials, id: string): Promise<Warehouse> {
    const client = new OracleOtmClient(credentials)
    const res = await client.get<OracleOtmLocationResponse>(`/locations/${id}`)
    return transformWarehouse(res)
  }

  // ── Rates ──────────────────────────────────────────────────────────────────

  async getRates(credentials: Credentials, params: RateRequestParams): Promise<Rate[]> {
    const client = new OracleOtmClient(credentials)
    const body = {
      requestType: 'AllOptions',
      perspective: 'B',
      orderReleases: [
        {
          sourceLocation: {
            city: params.originAddress.city,
            province: params.originAddress.state,
            postalCode: params.originAddress.postalCode,
            countryCode3Gid: params.originAddress.country,
          },
          destinationLocation: {
            city: params.destinationAddress.city,
            province: params.destinationAddress.state,
            postalCode: params.destinationAddress.postalCode,
            countryCode3Gid: params.destinationAddress.country,
          },
          lines: params.packages.map((pkg) => ({
            weight: pkg.weight ? { value: pkg.weight.value, uomCode: pkg.weight.unit } : undefined,
          })),
        },
      ],
    }
    const res = await client.post<OracleOtmRateAndRouteResponse>(
      '/custom-actions/riqRateAndRoute',
      body,
    )
    return (res.rateAndRouteResponse ?? []).map(transformRate)
  }
}
