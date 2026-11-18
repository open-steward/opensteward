import type {
  LogisticsAdapter,
  Credentials,
  QueryParams,
  RateRequestParams,
} from '../../adapter/interface'
import type { Shipment } from '../../schema/shipment'
import type { Order } from '../../schema/order'
import type { Carrier } from '../../schema/carrier'
import type { Warehouse } from '../../schema/warehouse'
import type { TrackingEvent } from '../../schema/trackingevent'
import type { Rate } from '../../schema/rate'
import type { Label } from '../../schema/label'
import type { Manifest } from '../../schema/manifest'

import { buildAuthUrl, exchangeCredentials, refreshCredentials as doRefresh } from './auth'
import { TrimbleTruckmateClient } from './client'

import {
  transformShipment,
  type TrimbleTruckmateShipmentResponse,
} from './transform/shipment'
import {
  transformTrackingEvents,
  type TrimbleTruckmateTrackingResponse,
} from './transform/tracking'
import {
  transformOrder,
  type TrimbleTruckmateOrderResponse,
} from './transform/order'
import {
  transformRate,
  extractRates,
  type TrimbleTruckmateRatesResponse,
} from './transform/rate'
import {
  transformCarrier,
  type TrimbleTruckmateCarrierResponse,
} from './transform/carrier'
import {
  transformWarehouse,
  type TrimbleTruckmateWarehouseResponse,
} from './transform/warehouse'
import {
  transformLabel,
  type TrimbleTruckmateLabelResponse,
} from './transform/label'
import {
  transformManifest,
  type TrimbleTruckmateManifestResponse,
} from './transform/manifest'

export interface TrimbleTruckmateAdapterConfig {
  clientId?: string
  clientSecret?: string
}

export class TrimbleTruckmateAdapter implements LogisticsAdapter {
  readonly platform = 'trimble-truckmate'
  readonly version = '1'

  private config: TrimbleTruckmateAdapterConfig

  constructor(config: TrimbleTruckmateAdapterConfig = {}) {
    this.config = config
  }

  // ── Auth ───────────────────────────────────────────────────────────────────

  getAuthUrl(state: string): string {
    return buildAuthUrl(state)
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    if (!this.config.clientId || !this.config.clientSecret) {
      throw new Error('trimble-truckmate: clientId and clientSecret are required')
    }
    return exchangeCredentials({
      clientId: this.config.clientId,
      clientSecret: this.config.clientSecret,
    })
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return doRefresh(credentials)
  }

  // ── Shipments ──────────────────────────────────────────────────────────────

  async listShipments(credentials: Credentials, params: QueryParams): Promise<Shipment[]> {
    const client = new TrimbleTruckmateClient(credentials)
    const res = await client.get<{ shipments?: TrimbleTruckmateShipmentResponse[]; trips?: TrimbleTruckmateShipmentResponse[] }>(
      '/shipments',
      { page: params.page, limit: params.limit },
    )
    return (res.shipments ?? res.trips ?? []).map(transformShipment)
  }

  async getShipment(credentials: Credentials, id: string): Promise<Shipment> {
    const client = new TrimbleTruckmateClient(credentials)
    const res = await client.get<TrimbleTruckmateShipmentResponse>(`/shipments/${id}`)
    return transformShipment(res)
  }

  async createShipment(credentials: Credentials, data: Partial<Shipment>): Promise<Shipment> {
    const client = new TrimbleTruckmateClient(credentials)

    const body = {
      serviceType: data.serviceCode,
      origin: data.originAddress
        ? {
            name: data.originAddress.name,
            company: data.originAddress.company,
            address: data.originAddress.street1,
            address2: data.originAddress.street2,
            city: data.originAddress.city,
            state: data.originAddress.state,
            zipCode: data.originAddress.postalCode,
            country: data.originAddress.country,
            phone: data.originAddress.phone,
            email: data.originAddress.email,
          }
        : undefined,
      destination: data.destinationAddress
        ? {
            name: data.destinationAddress.name,
            company: data.destinationAddress.company,
            address: data.destinationAddress.street1,
            address2: data.destinationAddress.street2,
            city: data.destinationAddress.city,
            state: data.destinationAddress.state,
            zipCode: data.destinationAddress.postalCode,
            country: data.destinationAddress.country,
            phone: data.destinationAddress.phone,
            email: data.destinationAddress.email,
          }
        : undefined,
      totalWeight: data.totalWeight
        ? {
            value: data.totalWeight.value,
            unit: data.totalWeight.unit === 'kg' ? 'KG' : 'LBS',
          }
        : undefined,
      reference: data.reference,
      notes: data.notes,
    }

    const res = await client.post<TrimbleTruckmateShipmentResponse>('/shipments', body)
    return transformShipment(res)
  }

  async cancelShipment(credentials: Credentials, id: string): Promise<void> {
    const client = new TrimbleTruckmateClient(credentials)
    await client.delete(`/shipments/${id}`)
  }

  // ── Orders ─────────────────────────────────────────────────────────────────

  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const client = new TrimbleTruckmateClient(credentials)
    const res = await client.get<{ orders?: TrimbleTruckmateOrderResponse[] }>(
      '/orders',
      { page: params.page, limit: params.limit },
    )
    return (res.orders ?? []).map(transformOrder)
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const client = new TrimbleTruckmateClient(credentials)
    const res = await client.get<TrimbleTruckmateOrderResponse>(`/orders/${id}`)
    return transformOrder(res)
  }

  async createOrder(credentials: Credentials, data: Partial<Order>): Promise<Order> {
    const client = new TrimbleTruckmateClient(credentials)

    const body = {
      orderNumber: data.orderNumber,
      customerId: data.customerId,
      warehouseId: data.warehouseId,
      origin: data.originAddress
        ? {
            name: data.originAddress.name,
            company: data.originAddress.company,
            address: data.originAddress.street1,
            address2: data.originAddress.street2,
            city: data.originAddress.city,
            state: data.originAddress.state,
            zipCode: data.originAddress.postalCode,
            country: data.originAddress.country,
            phone: data.originAddress.phone,
            email: data.originAddress.email,
          }
        : undefined,
      destination: data.destinationAddress
        ? {
            name: data.destinationAddress.name,
            company: data.destinationAddress.company,
            address: data.destinationAddress.street1,
            address2: data.destinationAddress.street2,
            city: data.destinationAddress.city,
            state: data.destinationAddress.state,
            zipCode: data.destinationAddress.postalCode,
            country: data.destinationAddress.country,
            phone: data.destinationAddress.phone,
            email: data.destinationAddress.email,
          }
        : undefined,
      serviceCode: data.requestedServiceCode,
      notes: data.notes,
    }

    const res = await client.post<TrimbleTruckmateOrderResponse>('/orders', body)
    return transformOrder(res)
  }

  async updateOrder(credentials: Credentials, id: string, data: Partial<Order>): Promise<Order> {
    const client = new TrimbleTruckmateClient(credentials)

    const body = {
      status: data.status,
      notes: data.notes,
      serviceCode: data.requestedServiceCode,
    }

    const res = await client.patch<TrimbleTruckmateOrderResponse>(`/orders/${id}`, body)
    return transformOrder(res)
  }

  async cancelOrder(credentials: Credentials, id: string): Promise<void> {
    const client = new TrimbleTruckmateClient(credentials)
    await client.delete(`/orders/${id}`)
  }

  // ── Carriers ───────────────────────────────────────────────────────────────

  async listCarriers(credentials: Credentials, params: QueryParams): Promise<Carrier[]> {
    const client = new TrimbleTruckmateClient(credentials)
    const res = await client.get<{ carriers?: TrimbleTruckmateCarrierResponse[] }>(
      '/carriers',
      { page: params.page, limit: params.limit },
    )
    return (res.carriers ?? []).map(transformCarrier)
  }

  async getCarrier(credentials: Credentials, id: string): Promise<Carrier> {
    const client = new TrimbleTruckmateClient(credentials)
    const res = await client.get<TrimbleTruckmateCarrierResponse>(`/carriers/${id}`)
    return transformCarrier(res)
  }

  // ── Warehouses / Sites ─────────────────────────────────────────────────────

  async listWarehouses(credentials: Credentials, params: QueryParams): Promise<Warehouse[]> {
    const client = new TrimbleTruckmateClient(credentials)
    const res = await client.get<{ sites?: TrimbleTruckmateWarehouseResponse[]; warehouses?: TrimbleTruckmateWarehouseResponse[] }>(
      '/sites',
      { page: params.page, limit: params.limit },
    )
    return (res.sites ?? res.warehouses ?? []).map(transformWarehouse)
  }

  async getWarehouse(credentials: Credentials, id: string): Promise<Warehouse> {
    const client = new TrimbleTruckmateClient(credentials)
    const res = await client.get<TrimbleTruckmateWarehouseResponse>(`/sites/${id}`)
    return transformWarehouse(res)
  }

  // ── Tracking Events ────────────────────────────────────────────────────────

  async getTrackingEvents(credentials: Credentials, trackingNumber: string): Promise<TrackingEvent[]> {
    const client = new TrimbleTruckmateClient(credentials)
    const res = await client.get<TrimbleTruckmateTrackingResponse>(
      `/shipments/${trackingNumber}/tracking`,
    )
    return transformTrackingEvents(res)
  }

  async listTrackingEvents(credentials: Credentials, params: QueryParams): Promise<TrackingEvent[]> {
    const client = new TrimbleTruckmateClient(credentials)
    const res = await client.get<{ events?: TrimbleTruckmateTrackingResponse[] }>(
      '/tracking/events',
      { page: params.page, limit: params.limit },
    )
    return (res.events ?? []).flatMap(transformTrackingEvents)
  }

  // ── Rates ──────────────────────────────────────────────────────────────────

  async getRates(credentials: Credentials, params: RateRequestParams): Promise<Rate[]> {
    const client = new TrimbleTruckmateClient(credentials)

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
        ? {
            value: params.packages[0].weight.value,
            unit: params.packages[0].weight.unit === 'kg' ? 'KG' : 'LBS',
          }
        : undefined,
      serviceCodes: params.serviceCodes,
    }

    const res = await client.post<TrimbleTruckmateRatesResponse>('/quotes', body)
    return extractRates(res).map(transformRate)
  }

  // ── Labels ─────────────────────────────────────────────────────────────────

  async listLabels(credentials: Credentials, params: QueryParams): Promise<Label[]> {
    const client = new TrimbleTruckmateClient(credentials)
    const res = await client.get<{ labels?: TrimbleTruckmateLabelResponse[] }>(
      '/labels',
      { page: params.page, limit: params.limit },
    )
    return (res.labels ?? []).map(transformLabel)
  }

  async getLabel(credentials: Credentials, id: string): Promise<Label> {
    const client = new TrimbleTruckmateClient(credentials)
    const res = await client.get<TrimbleTruckmateLabelResponse>(`/labels/${id}`)
    return transformLabel(res)
  }

  async createLabel(credentials: Credentials, data: Partial<Label>): Promise<Label> {
    const client = new TrimbleTruckmateClient(credentials)

    const body = {
      shipmentId: data.shipmentId,
      serviceCode: data.serviceCode,
      format: data.format,
    }

    const res = await client.post<TrimbleTruckmateLabelResponse>('/labels', body)
    return transformLabel(res)
  }

  async voidLabel(credentials: Credentials, id: string): Promise<void> {
    const client = new TrimbleTruckmateClient(credentials)
    await client.delete(`/labels/${id}`)
  }

  // ── Manifests ──────────────────────────────────────────────────────────────

  async listManifests(credentials: Credentials, params: QueryParams): Promise<Manifest[]> {
    const client = new TrimbleTruckmateClient(credentials)
    const res = await client.get<{ manifests?: TrimbleTruckmateManifestResponse[] }>(
      '/manifests',
      { page: params.page, limit: params.limit },
    )
    return (res.manifests ?? []).map(transformManifest)
  }

  async getManifest(credentials: Credentials, id: string): Promise<Manifest> {
    const client = new TrimbleTruckmateClient(credentials)
    const res = await client.get<TrimbleTruckmateManifestResponse>(`/manifests/${id}`)
    return transformManifest(res)
  }

  async createManifest(credentials: Credentials, data: Partial<Manifest>): Promise<Manifest> {
    const client = new TrimbleTruckmateClient(credentials)

    const body = {
      carrierId: data.carrierId,
      warehouseId: data.warehouseId,
      shipmentIds: data.shipmentIds,
    }

    const res = await client.post<TrimbleTruckmateManifestResponse>('/manifests', body)
    return transformManifest(res)
  }
}
