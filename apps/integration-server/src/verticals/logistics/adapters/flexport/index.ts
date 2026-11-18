// ── Resource coverage ──────────────────────────────────────────────
// Unavailable: manifest — Flexport has no manifest endpoint in the v2 or Logistics API
//   (confirmed: docs.logistics-api.flexport.com/2025-03 lists no manifest resource)

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
import type { Carrier } from '../../schema/carrier'
import type { Label } from '../../schema/label'
import type { Warehouse } from '../../schema/warehouse'

import { buildAuthUrl, exchangeCredentials, refreshCredentials as doRefresh } from './auth'
import { FlexportClient } from './client'
import { FLEXPORT_LOGISTICS_API_BASE } from './constants'

import { transformRate, type FlexportRateResponse } from './transform/rate'
import { transformTrackingEvents, type FlexportLegsResponse } from './transform/tracking'
import { transformShipment, type FlexportShipmentResponse, type FlexportShipmentsListResponse } from './transform/shipment'
import { transformOrder, type FlexportOrderResponse } from './transform/order'
import { transformCarrier, type FlexportCarrierResponse } from './transform/carrier'
import { transformLabel, type FlexportParcelResponse } from './transform/label'
import { transformWarehouse } from './transform/warehouse'

export interface FlexportAdapterConfig {
  clientId?: string
  clientSecret?: string
  sandbox?: boolean
}

export class FlexportAdapter implements LogisticsAdapter {
  readonly platform = 'flexport'
  readonly version = '1'

  private config: FlexportAdapterConfig

  constructor(config: FlexportAdapterConfig = {}) {
    this.config = config
  }

  // ── Auth ───────────────────────────────────────────────────────────────────

  getAuthUrl(state: string): string {
    return buildAuthUrl(state)
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    if (!this.config.clientId || !this.config.clientSecret) {
      throw new Error('flexport: clientId and clientSecret are required')
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

  // ── Rates ──────────────────────────────────────────────────────────────────

  async getRates(credentials: Credentials, params: RateRequestParams): Promise<Rate[]> {
    const client = new FlexportClient(credentials)
    const firstPkg = params.packages[0]

    const body = {
      origin: {
        postal_code: params.originAddress.postalCode,
        country_code: params.originAddress.country,
        city: params.originAddress.city,
        state: params.originAddress.state,
      },
      destination: {
        postal_code: params.destinationAddress.postalCode,
        country_code: params.destinationAddress.country,
        city: params.destinationAddress.city,
        state: params.destinationAddress.state,
      },
      cargo: {
        weight: firstPkg?.weight
          ? { value: firstPkg.weight.value, unit: firstPkg.weight.unit }
          : undefined,
        dimensions: firstPkg?.dimensions
          ? {
              length: firstPkg.dimensions.length,
              width: firstPkg.dimensions.width,
              height: firstPkg.dimensions.height,
              unit: firstPkg.dimensions.unit,
            }
          : undefined,
      },
    }

    const res = await client.post<FlexportRateResponse>('/rates', body)
    return (res.data ?? []).map(transformRate)
  }

  // ── Tracking Events ────────────────────────────────────────────────────────

  async getTrackingEvents(credentials: Credentials, trackingNumber: string): Promise<TrackingEvent[]> {
    const client = new FlexportClient(credentials)
    const res = await client.get<FlexportLegsResponse>(`/shipments/${trackingNumber}/legs`)
    return transformTrackingEvents(trackingNumber, res)
  }

  // ── Shipments ──────────────────────────────────────────────────────────────

  async listShipments(credentials: Credentials, params: QueryParams): Promise<Shipment[]> {
    const client = new FlexportClient(credentials)
    const res = await client.get<FlexportShipmentsListResponse>('/shipments', {
      page: params.page,
      per: params.limit,
    })
    return (res.data ?? []).map(transformShipment)
  }

  async getShipment(credentials: Credentials, id: string): Promise<Shipment> {
    const client = new FlexportClient(credentials)
    const res = await client.get<FlexportShipmentResponse>(`/shipments/${id}`)
    return transformShipment(res)
  }

  async createShipment(credentials: Credentials, data: Partial<Shipment>): Promise<Shipment> {
    const client = new FlexportClient(credentials)

    const body = {
      name: data.reference,
      freight_type: data.serviceCode,
      origin: {
        address: {
          street_address: data.originAddress?.street1,
          city: data.originAddress?.city,
          state: data.originAddress?.state,
          zip: data.originAddress?.postalCode,
          country_code: data.originAddress?.country,
        },
      },
      destination: {
        address: {
          street_address: data.destinationAddress?.street1,
          city: data.destinationAddress?.city,
          state: data.destinationAddress?.state,
          zip: data.destinationAddress?.postalCode,
          country_code: data.destinationAddress?.country,
        },
      },
    }

    const res = await client.post<FlexportShipmentResponse>('/bookings', body)
    return transformShipment(res)
  }

  // ── Orders ─────────────────────────────────────────────────────────────────

  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const client = new FlexportClient(credentials)
    const res = await client.get<{ data: FlexportOrderResponse[] }>('/orders', {
      page: params.page,
      per: params.limit,
    })
    return (res.data ?? []).map(transformOrder)
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const client = new FlexportClient(credentials)
    const res = await client.get<FlexportOrderResponse>(`/orders/${id}`)
    return transformOrder(res)
  }

  async createOrder(credentials: Credentials, data: Partial<Order>): Promise<Order> {
    const client = new FlexportClient(credentials)
    const body = {
      order_number: data.orderNumber,
      customer_id: data.customerId,
      service_type: data.requestedServiceCode,
      origin: data.originAddress
        ? {
            street_address: data.originAddress.street1,
            city: data.originAddress.city,
            state: data.originAddress.state,
            zip: data.originAddress.postalCode,
            country_code: data.originAddress.country,
          }
        : undefined,
      destination: data.destinationAddress
        ? {
            street_address: data.destinationAddress.street1,
            city: data.destinationAddress.city,
            state: data.destinationAddress.state,
            zip: data.destinationAddress.postalCode,
            country_code: data.destinationAddress.country,
          }
        : undefined,
      notes: data.notes,
    }
    const res = await client.post<FlexportOrderResponse>('/orders', body)
    return transformOrder(res)
  }

  // ── Carriers ───────────────────────────────────────────────────────────────

  async listCarriers(credentials: Credentials, params: QueryParams): Promise<Carrier[]> {
    const client = new FlexportClient(credentials)
    const res = await client.get<{ data: FlexportCarrierResponse[] }>('/carriers', {
      page: params.page,
      per: params.limit,
    })
    return (res.data ?? []).map(transformCarrier)
  }

  async getCarrier(credentials: Credentials, id: string): Promise<Carrier> {
    const client = new FlexportClient(credentials)
    const res = await client.get<FlexportCarrierResponse>(`/carriers/${id}`)
    return transformCarrier(res)
  }

  // ── Labels (Parcels) ───────────────────────────────────────────────────────
  // Flexport Logistics API: https://logistics-api.flexport.com/logistics/api/2025-03
  // GET  /parcels/{parcelId}  — retrieve a parcel/label by ID
  // POST /parcels             — create a parcel label

  async getLabel(credentials: Credentials, id: string): Promise<Label> {
    const client = new FlexportClient(credentials, FLEXPORT_LOGISTICS_API_BASE)
    const res = await client.get<FlexportParcelResponse>(`/parcels/${id}`)
    return transformLabel(res)
  }

  async createLabel(credentials: Credentials, data: Partial<Label>): Promise<Label> {
    const client = new FlexportClient(credentials, FLEXPORT_LOGISTICS_API_BASE)
    const body: Record<string, unknown> = {
      customerReferenceId: data.id ?? undefined,
      serviceLevel: data.serviceCode ?? undefined,
    }
    const res = await client.post<FlexportParcelResponse>('/parcels', body)
    return transformLabel(res)
  }

  // ── Warehouses ─────────────────────────────────────────────────────────────
  // Flexport Logistics API: GET /warehouses/active
  // Returns string[] of warehouse codes; no rich object (name/address) is available.

  async listWarehouses(credentials: Credentials, _params: QueryParams): Promise<Warehouse[]> {
    const client = new FlexportClient(credentials, FLEXPORT_LOGISTICS_API_BASE)
    const codes = await client.get<string[]>('/warehouses/active')
    return (codes ?? []).map(transformWarehouse)
  }
}
