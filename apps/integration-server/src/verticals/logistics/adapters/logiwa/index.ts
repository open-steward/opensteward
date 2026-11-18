// ── Resource coverage ──────────────────────────────────────────────
// Unavailable: warehouse — No /Warehouse list/detail endpoint exists in the Logiwa v3.1 REST API spec; only warehouse location helper lookups are available.

import type { LogisticsAdapter, Credentials, RateRequestParams, QueryParams } from '../../adapter/interface'
import type { Shipment } from '../../schema/shipment'
import type { Order } from '../../schema/order'
import type { TrackingEvent } from '../../schema/trackingevent'
import type { Carrier } from '../../schema/carrier'
import type { Rate } from '../../schema/rate'
import type { Label } from '../../schema/label'
import type { Manifest } from '../../schema/manifest'

import { buildAuthUrl, exchangeCredentials, refreshCredentials as doRefresh } from './auth'
import { LogiwaClient } from './client'

import { transformTracking, type LogiwaTrackingResponse } from './transform/tracking'
import { transformShipment, type LogiwaShipment } from './transform/shipment'
import { transformOrder, type LogiwaOrder } from './transform/order'
import { transformCarrier, type LogiwaPartnerCarrierDetail } from './transform/carrier'
import { transformRate, type LogiwaRateResponse } from './transform/rate'
import { transformLabel, type LogiwaLabelResponse } from './transform/label'
import { transformManifest, type LogiwaEodResponse } from './transform/manifest'

interface LogiwaAdapterConfig {
  sandbox?: boolean
}

export class LogiwaAdapter implements LogisticsAdapter {
  readonly platform = 'logiwa'
  readonly version = '1'

  constructor(_config: LogiwaAdapterConfig = {}) {}

  getAuthUrl(state: string): string {
    return buildAuthUrl(state)
  }

  async exchangeCode(code: string, _redirectUri: string): Promise<Credentials> {
    const [clientId, clientSecret] = code.split(':')
    return exchangeCredentials({ clientId, clientSecret })
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return doRefresh(credentials)
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const client = new LogiwaClient(credentials)
    const raw = await client.get<LogiwaOrder>(`v1/orders/${encodeURIComponent(id)}`)
    return transformOrder(raw)
  }

  async createOrder(credentials: Credentials, data: Partial<Order>): Promise<Order> {
    const client = new LogiwaClient(credentials)
    const raw = await client.post<LogiwaOrder>('v1/orders', {
      OrderCode: data.orderNumber,
      CustomerID: data.customerId,
      WarehouseID: data.warehouseId,
      ShipToAddress: data.destinationAddress,
      ShipFromAddress: data.originAddress,
      Items: data.lineItems?.map((li) => ({
        SKU: li.sku,
        Quantity: li.quantity,
        Description: li.description,
        UnitPrice: li.unitAmount,
      })),
      Notes: data.notes,
      ServiceCode: data.requestedServiceCode,
    })
    return transformOrder(raw)
  }

  async getShipment(credentials: Credentials, id: string): Promise<Shipment> {
    const client = new LogiwaClient(credentials)
    const raw = await client.get<LogiwaShipment>(`v1/shipments/${encodeURIComponent(id)}`)
    return transformShipment(raw)
  }

  async createShipment(credentials: Credentials, data: Partial<Shipment>): Promise<Shipment> {
    const client = new LogiwaClient(credentials)
    const raw = await client.post<LogiwaShipment>('v1/shipments', {
      ShipFromAddress: data.originAddress,
      ShipToAddress: data.destinationAddress,
      Weight: data.totalWeight?.value,
      WeightUnit: data.totalWeight?.unit,
      ServiceCode: data.serviceCode,
      Reference: data.reference,
    })
    return transformShipment(raw)
  }

  async getTrackingEvents(credentials: Credentials, trackingNumber: string): Promise<TrackingEvent[]> {
    const client = new LogiwaClient(credentials)
    const raw = await client.get<LogiwaTrackingResponse>(
      `v1/tracking/${encodeURIComponent(trackingNumber)}`,
    )
    return transformTracking(raw)
  }

  async listCarriers(credentials: Credentials, _params?: QueryParams): Promise<Carrier[]> {
    const client = new LogiwaClient(credentials)
    const raw = await client.post<LogiwaPartnerCarrierDetail[]>('v3.1/PartnerCarrier/list/detail', null)
    return raw.map(transformCarrier)
  }

  async getCarrier(credentials: Credentials, id: string): Promise<Carrier> {
    const carriers = await this.listCarriers(credentials)
    const found = carriers.find((c) => c.id === id || c.code === id)
    if (!found) throw new Error(`Logiwa carrier not found: ${id}`)
    return found
  }

  async getRates(credentials: Credentials, params: RateRequestParams): Promise<Rate[]> {
    const client = new LogiwaClient(credentials)
    const raw = await client.post<LogiwaRateResponse>('v3.1/CustomCarrier/rate', {
      shipFrom: params.originAddress,
      shipTo: params.destinationAddress,
      requestedPackageLineItems: params.packages.map((pkg) => ({
        weight: pkg.weight?.value,
        weightUnit: pkg.weight?.unit,
        length: pkg.dimensions?.length,
        width: pkg.dimensions?.width,
        height: pkg.dimensions?.height,
        dimensionUnit: pkg.dimensions?.unit,
      })),
    })
    return (raw.rateList ?? []).map(transformRate)
  }

  async createLabel(credentials: Credentials, data: Partial<Label>): Promise<Label> {
    const client = new LogiwaClient(credentials)
    const raw = await client.post<LogiwaLabelResponse>('v3.1/CustomCarrier/create', [{
      shipmentOrderIdentifier: data.shipmentId,
      carrier: data.carrierId,
      requestedShippingOption: data.serviceCode,
    }])
    return transformLabel(Array.isArray(raw) ? raw[0] : raw)
  }

  async voidLabel(credentials: Credentials, id: string): Promise<void> {
    const client = new LogiwaClient(credentials)
    await client.post('v3.1/CustomCarrier/void', [{ shipmentOrderIdentifier: id }])
  }

  async createManifest(credentials: Credentials, data: Partial<Manifest>): Promise<Manifest> {
    const client = new LogiwaClient(credentials)
    const raw = await client.post<LogiwaEodResponse>('v3.1/CustomCarrier/eod', [{
      carrier: data.carrierId,
      warehouseIdentifier: data.warehouseId,
    }])
    return transformManifest(Array.isArray(raw) ? raw[0] : raw)
  }
}
