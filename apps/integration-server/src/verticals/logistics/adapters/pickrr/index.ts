// ── Resource coverage ──────────────────────────────────────────────
// Unavailable:  carrier   — no dedicated carrier-listing endpoint; carriers are embedded in rate/pricing responses and require origin+destination pincodes
// Unverified:   manifest  — docs.pickrr.com SPA returns only loading screens; no manifest endpoint found in any public source
// Unverified:   warehouse — docs.pickrr.com SPA returns only loading screens; Pickrr is a courier aggregator with no public warehouse-listing endpoint

import { simpleApiKey } from '@opensteward/shared'
import type {
  LogisticsAdapter,
  Credentials,
  QueryParams,
  RateRequestParams,
} from '../../adapter/interface'
import type { Shipment } from '../../schema/shipment'
import type { Order } from '../../schema/order'
import type { TrackingEvent } from '../../schema/trackingevent'
import type { Rate } from '../../schema/rate'
import type { Label } from '../../schema/label'

import { buildAuthUrl, exchangeApiKey, refreshCredentials as doRefresh } from './auth'
import { PickrrClient } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

import { transformOrder, type PickrrOrder } from './transform/order'
import { transformShipment, type PickrrShipment } from './transform/shipment'
import { transformTracking, type PickrrTrackingResponse } from './transform/tracking'
import { transformRate, type PickrrRateResponse } from './transform/rate'
import { transformLabel } from './transform/label'

interface PickrrAdapterConfig {
  sandbox?: boolean
}

interface PickrrOrderListResponse {
  data: PickrrOrder[]
  results: PickrrOrder[]
  [key: string]: unknown
}

interface PickrrShipmentListResponse {
  data: PickrrShipment[]
  results: PickrrShipment[]
  [key: string]: unknown
}

const SIMPLE_API_KEY_FORM = simpleApiKey()

export class PickrrAdapter implements LogisticsAdapter {
  // Connect Link support — single API-key form.
  credentialFields = SIMPLE_API_KEY_FORM.credentialFields
  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'pickrr'
  readonly version = '1'

  constructor(_config: PickrrAdapterConfig = {}) {}

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

  // ── Orders ─────────────────────────────────────────────────────────────────

  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const client = new PickrrClient(credentials)
    const res = await client.get<PickrrOrderListResponse>('orders/', {
      page: params.page ?? 1,
      page_size: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE),
    })
    const items = res.data ?? res.results ?? []
    return items.map(transformOrder)
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const client = new PickrrClient(credentials)
    const raw = await client.get<PickrrOrder>(`orders/${id}/`)
    return transformOrder(raw)
  }

  async createOrder(credentials: Credentials, data: Partial<Order>): Promise<Order> {
    const client = new PickrrClient(credentials)
    const raw = await client.post<PickrrOrder>('order/place-order/', {
      item_name: data.lineItems?.[0]?.name ?? 'Item',
      from_name: data.originAddress?.name ?? '',
      from_phone_number: data.originAddress?.phone ?? '',
      from_pincode: data.originAddress?.postalCode ?? '',
      from_address: [data.originAddress?.street1, data.originAddress?.street2]
        .filter(Boolean)
        .join(', ') || '',
      from_city: data.originAddress?.city ?? '',
      from_state: data.originAddress?.state ?? '',
      to_name: data.destinationAddress?.name ?? '',
      to_phone_number: data.destinationAddress?.phone ?? '',
      to_pincode: data.destinationAddress?.postalCode ?? '',
      to_address: [data.destinationAddress?.street1, data.destinationAddress?.street2]
        .filter(Boolean)
        .join(', ') || '',
      to_city: data.destinationAddress?.city ?? '',
      to_state: data.destinationAddress?.state ?? '',
      cod_amount: data.totalAmount ?? 0,
      client_order_id: data.orderNumber ?? undefined,
      quantity: data.lineItems?.[0]?.quantity ?? 1,
    })
    return transformOrder(raw)
  }

  async cancelOrder(credentials: Credentials, id: string): Promise<void> {
    const client = new PickrrClient(credentials)
    await client.post<unknown>('order/cancel/', { order_id: id })
  }

  // ── Shipments ──────────────────────────────────────────────────────────────

  async listShipments(credentials: Credentials, params: QueryParams): Promise<Shipment[]> {
    const client = new PickrrClient(credentials)
    const res = await client.get<PickrrShipmentListResponse>('shipments/', {
      page: params.page ?? 1,
      page_size: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE),
    })
    const items = res.data ?? res.results ?? []
    return items.map(transformShipment)
  }

  async getShipment(credentials: Credentials, id: string): Promise<Shipment> {
    const client = new PickrrClient(credentials)
    const raw = await client.get<PickrrShipment>(`shipments/${id}/`)
    return transformShipment(raw)
  }

  async cancelShipment(credentials: Credentials, id: string): Promise<void> {
    const client = new PickrrClient(credentials)
    await client.post<unknown>('order/cancel/', { order_id: id })
  }

  // ── Tracking Events ────────────────────────────────────────────────────────

  async getTrackingEvents(credentials: Credentials, trackingNumber: string): Promise<TrackingEvent[]> {
    const client = new PickrrClient(credentials)
    const raw = await client.get<PickrrTrackingResponse>('track/status/', {
      tracking_id: trackingNumber,
    })
    return transformTracking(raw, trackingNumber)
  }

  // ── Rates ──────────────────────────────────────────────────────────────────

  async getRates(credentials: Credentials, params: RateRequestParams): Promise<Rate[]> {
    const client = new PickrrClient(credentials)
    const pkg = params.packages[0]
    const res = await client.get<PickrrRateResponse>('pricing/', {
      from_pincode: params.originAddress.postalCode,
      to_pincode: params.destinationAddress.postalCode,
      weight: pkg?.weight?.value ?? 0.5,
      cod_amount: 0,
    })
    const couriers = res.courier_list ?? res.available_couriers ?? []
    return couriers.map(transformRate)
  }

  // ── Labels (derived from shipments) ────────────────────────────────────────

  async listLabels(credentials: Credentials, params: QueryParams): Promise<Label[]> {
    const client = new PickrrClient(credentials)
    const res = await client.get<PickrrShipmentListResponse>('shipments/', {
      page: params.page ?? 1,
      page_size: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE),
    })
    const items = res.data ?? res.results ?? []
    return items.map(transformLabel)
  }

  async getLabel(credentials: Credentials, id: string): Promise<Label> {
    const client = new PickrrClient(credentials)
    const raw = await client.get<PickrrShipment>(`shipments/${id}/`)
    return transformLabel(raw)
  }
}
