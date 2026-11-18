// ── Resource coverage ──────────────────────────────────────────────
// Unavailable: warehouse — Shipmondo API v3 has no warehouse concept or endpoint

import type {
  LogisticsAdapter,
  Credentials,
  RateRequestParams,
  QueryParams,
} from '../../adapter/interface'
import type { Shipment } from '../../schema/shipment'
import type { TrackingEvent } from '../../schema/trackingevent'
import type { Rate } from '../../schema/rate'
import type { Label } from '../../schema/label'
import type { Carrier } from '../../schema/carrier'
import type { Order } from '../../schema/order'
import type { Manifest } from '../../schema/manifest'

import { buildAuthUrl, exchangeApiKey, refreshCredentials as doRefresh } from './auth'
import { ShipmondoClient } from './client'

import { transformTracking, type ShipmondoTrackingResponse } from './transform/tracking'
import { transformShipment, type ShipmondoShipment } from './transform/shipment'
import { transformRate, type ShipmondoRate } from './transform/rate'
import { transformLabel, type ShipmondoLabel } from './transform/label'
import { transformCarrier, type ShipmondoCarrier } from './transform/carrier'
import { transformOrder, type ShipmondoSalesOrder } from './transform/order'
import { transformManifest, type ShipmondoWaybill } from './transform/manifest'

interface ShipmondoAdapterConfig {
  sandbox?: boolean
}

export class ShipmondoAdapter implements LogisticsAdapter {
  readonly platform = 'shipmondo'
  readonly version = '1'

  constructor(_config: ShipmondoAdapterConfig = {}) {}

  // ── Auth ───────────────────────────────────────────────────────────────────

  getAuthUrl(state: string): string {
    return buildAuthUrl(state)
  }

  async exchangeCode(code: string, _redirectUri: string): Promise<Credentials> {
    return exchangeApiKey(code)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return doRefresh(credentials)
  }

  // ── Tracking Events ────────────────────────────────────────────────────────

  async getTrackingEvents(credentials: Credentials, trackingNumber: string): Promise<TrackingEvent[]> {
    const client = new ShipmondoClient(credentials)
    const raw = await client.get<ShipmondoTrackingResponse>(`tracking/${encodeURIComponent(trackingNumber)}`)
    return transformTracking(raw)
  }

  // ── Shipments ──────────────────────────────────────────────────────────────

  async createShipment(credentials: Credentials, data: Partial<Shipment>): Promise<Shipment> {
    const client = new ShipmondoClient(credentials)
    const raw = await client.post<ShipmondoShipment>('shipments', {
      sender: data.originAddress
        ? {
            name: data.originAddress.name,
            company: data.originAddress.company,
            street1: data.originAddress.street1,
            street2: data.originAddress.street2,
            city: data.originAddress.city,
            state: data.originAddress.state,
            postal_code: data.originAddress.postalCode,
            country: data.originAddress.country,
            phone: data.originAddress.phone,
            email: data.originAddress.email,
          }
        : undefined,
      recipient: data.destinationAddress
        ? {
            name: data.destinationAddress.name,
            company: data.destinationAddress.company,
            street1: data.destinationAddress.street1,
            street2: data.destinationAddress.street2,
            city: data.destinationAddress.city,
            state: data.destinationAddress.state,
            postal_code: data.destinationAddress.postalCode,
            country: data.destinationAddress.country,
            phone: data.destinationAddress.phone,
            email: data.destinationAddress.email,
          }
        : undefined,
      weight: data.totalWeight
        ? { value: data.totalWeight.value, unit: data.totalWeight.unit }
        : undefined,
      reference: data.reference,
      service_code: data.serviceCode,
    })
    return transformShipment(raw)
  }

  // ── Rates ──────────────────────────────────────────────────────────────────

  async getRates(credentials: Credentials, params: RateRequestParams): Promise<Rate[]> {
    const client = new ShipmondoClient(credentials)
    const firstPkg = params.packages[0]
    const body = {
      from: {
        postal_code: params.originAddress.postalCode,
        country: params.originAddress.country,
      },
      to: {
        postal_code: params.destinationAddress.postalCode,
        country: params.destinationAddress.country,
      },
      weight: firstPkg?.weight?.value,
      weight_unit: firstPkg?.weight?.unit,
      length: firstPkg?.dimensions?.length,
      width: firstPkg?.dimensions?.width,
      height: firstPkg?.dimensions?.height,
      service_codes: params.serviceCodes,
    }
    const res = await client.post<{ rates: ShipmondoRate[] }>('rates', body)
    return (res.rates ?? []).map(transformRate)
  }

  // ── Labels ─────────────────────────────────────────────────────────────────

  async createLabel(credentials: Credentials, data: Partial<Label>): Promise<Label> {
    const client = new ShipmondoClient(credentials)
    const res = await client.post<ShipmondoLabel>('labels', {
      shipment_id: data.shipmentId ?? data.id,
      format: data.format ?? 'PDF',
    })
    return transformLabel(res)
  }

  // ── Carriers ───────────────────────────────────────────────────────────────

  async listCarriers(credentials: Credentials, _params: QueryParams): Promise<Carrier[]> {
    const client = new ShipmondoClient(credentials)
    const raw = await client.get<ShipmondoCarrier[]>('carriers')
    return (raw ?? []).map(transformCarrier)
  }

  // ── Orders ─────────────────────────────────────────────────────────────────

  async listOrders(credentials: Credentials, _params: QueryParams): Promise<Order[]> {
    const client = new ShipmondoClient(credentials)
    const raw = await client.get<ShipmondoSalesOrder[]>('sales_orders')
    return (raw ?? []).map(transformOrder)
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const client = new ShipmondoClient(credentials)
    const raw = await client.get<ShipmondoSalesOrder>(`sales_orders/${encodeURIComponent(id)}`)
    return transformOrder(raw)
  }

  // ── Manifests (waybills) ───────────────────────────────────────────────────

  async listManifests(credentials: Credentials, _params: QueryParams): Promise<Manifest[]> {
    const client = new ShipmondoClient(credentials)
    const raw = await client.get<ShipmondoWaybill[]>('waybills')
    return (raw ?? []).map(transformManifest)
  }

  async getManifest(credentials: Credentials, id: string): Promise<Manifest> {
    const client = new ShipmondoClient(credentials)
    const raw = await client.get<ShipmondoWaybill>(`waybills/${encodeURIComponent(id)}`)
    return transformManifest(raw)
  }
}
