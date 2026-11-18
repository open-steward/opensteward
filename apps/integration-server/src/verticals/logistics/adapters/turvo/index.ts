// ── Resource coverage ──────────────────────────────────────────────
// Available:   shipment, order, trackingevent
// Unverified:  carrier   — Turvo manages carrier relationships but carrier-management API endpoints are not publicly documented; docs require login at app.turvo.com/lobby/documentation
// Unverified:  warehouse — Turvo can connect to WMS systems but a dedicated warehouse REST endpoint is not publicly documented; docs require login
// Unverified:  rate      — Turvo integrates with external rating engines (e.g. SMC3) but a native rate-quote REST endpoint is not publicly documented; docs require login
// Unavailable: label     — Turvo is a freight TMS/broker platform, not a parcel carrier; it does not generate or host PDF/ZPL shipping labels
// Unavailable: manifest  — Turvo is a freight TMS/broker platform; end-of-day manifests are a parcel-carrier concept not present in the Turvo TMS domain

import type {
  LogisticsAdapter,
  Credentials,
  QueryParams,
} from '../../adapter/interface'
import type { Shipment, ShipmentStatus } from '../../schema/shipment'
import type { Order, OrderStatus } from '../../schema/order'
import type { TrackingEvent } from '../../schema/trackingevent'

import { buildAuthUrl, exchangeCode as doExchangeCode, refreshCredentials as doRefresh } from './auth'
import { TurvoClient } from './client'
import { transformTrackingEvent, type TurvoTrackingEvent } from './transform/tracking'
import { toISODate } from '../shared/transform'

export interface TurvoAdapterConfig {
  clientId?: string
  clientSecret?: string
  redirectUri?: string
  scopes?: string[]
}

interface TurvoShipment {
  id?: string
  status?: string
  trackingNumber?: string
  referenceNumber?: string
  carrierName?: string
  origin?: { city?: string; state?: string; postalCode?: string; country?: string; [key: string]: unknown }
  destination?: { city?: string; state?: string; postalCode?: string; country?: string; [key: string]: unknown }
  estimatedDelivery?: string
  createdAt?: string
  updatedAt?: string
  notes?: string
  [key: string]: unknown
}

interface TurvoOrder {
  id?: string
  status?: string
  orderNumber?: string
  shipper?: { name?: string; [key: string]: unknown }
  origin?: { city?: string; state?: string; postalCode?: string; country?: string; [key: string]: unknown }
  destination?: { city?: string; state?: string; postalCode?: string; country?: string; [key: string]: unknown }
  totalAmount?: number
  currency?: string
  createdAt?: string
  updatedAt?: string
  notes?: string
  [key: string]: unknown
}

interface TurvoShipmentsListResponse { data?: TurvoShipment[]; [key: string]: unknown }
interface TurvoShipmentResponse { data?: TurvoShipment; [key: string]: unknown }
interface TurvoOrdersListResponse { data?: TurvoOrder[]; [key: string]: unknown }
interface TurvoOrderResponse { data?: TurvoOrder; [key: string]: unknown }
interface TurvoTrackingEventsResponse { data?: TurvoTrackingEvent[]; [key: string]: unknown }

const SHIPMENT_STATUS_MAP: Record<string, ShipmentStatus> = {
  pending: 'PENDING',
  in_transit: 'IN_TRANSIT',
  out_for_delivery: 'OUT_FOR_DELIVERY',
  delivered: 'DELIVERED',
  exception: 'EXCEPTION',
  cancelled: 'CANCELLED',
}

const ORDER_STATUS_MAP: Record<string, OrderStatus> = {
  pending: 'PENDING',
  processing: 'PROCESSING',
  shipped: 'SHIPPED',
  delivered: 'DELIVERED',
  cancelled: 'CANCELLED',
}

function transformShipment(raw: TurvoShipment): Shipment {
  return {
    id: raw.id,
    status: raw.status ? (SHIPMENT_STATUS_MAP[raw.status] ?? 'UNKNOWN') : undefined,
    trackingNumber: raw.trackingNumber,
    reference: raw.referenceNumber,
    carrierId: raw.carrierName,
    originAddress: raw.origin
      ? {
          city: raw.origin.city,
          state: raw.origin.state,
          postalCode: raw.origin.postalCode,
          country: raw.origin.country as Shipment['originAddress'] extends { country?: infer C } ? C : never,
        }
      : undefined,
    destinationAddress: raw.destination
      ? {
          city: raw.destination.city,
          state: raw.destination.state,
          postalCode: raw.destination.postalCode,
          country: raw.destination.country as Shipment['destinationAddress'] extends { country?: infer C } ? C : never,
        }
      : undefined,
    estimatedDeliveryAt: toISODate(raw.estimatedDelivery),
    notes: raw.notes,
    createdAt: toISODate(raw.createdAt),
    updatedAt: toISODate(raw.updatedAt),
    metadata: raw,
  }
}

function transformOrder(raw: TurvoOrder): Order {
  return {
    id: raw.id,
    status: raw.status ? (ORDER_STATUS_MAP[raw.status] ?? 'PENDING') : undefined,
    orderNumber: raw.orderNumber,
    originAddress: raw.origin
      ? {
          city: raw.origin.city,
          state: raw.origin.state,
          postalCode: raw.origin.postalCode,
          country: raw.origin.country as Order['originAddress'] extends { country?: infer C } ? C : never,
        }
      : undefined,
    destinationAddress: raw.destination
      ? {
          city: raw.destination.city,
          state: raw.destination.state,
          postalCode: raw.destination.postalCode,
          country: raw.destination.country as Order['destinationAddress'] extends { country?: infer C } ? C : never,
        }
      : undefined,
    totalAmount: raw.totalAmount,
    currency: raw.currency as Order['currency'],
    notes: raw.notes,
    createdAt: toISODate(raw.createdAt),
    updatedAt: toISODate(raw.updatedAt),
    metadata: raw,
  }
}

export class TurvoAdapter implements LogisticsAdapter {
  readonly platform = 'turvo'
  readonly version = '1'

  constructor(private config: TurvoAdapterConfig = {}) {}

  getAuthUrl(state: string, overrideScopes?: string[]): string {
    const { clientId, clientSecret = '', redirectUri, scopes } = this.config
    if (!clientId || !redirectUri) {
      throw new Error('Turvo adapter requires clientId and redirectUri to generate an auth URL')
    }
    return buildAuthUrl({ clientId, clientSecret, redirectUri, scopes: overrideScopes ?? scopes }, state)
  }

  async exchangeCode(code: string, redirectUri: string): Promise<Credentials> {
    const { clientId = '', clientSecret = '', scopes } = this.config
    return doExchangeCode(code, {
      clientId,
      clientSecret,
      redirectUri: redirectUri || this.config.redirectUri || '',
      scopes,
    })
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return doRefresh(credentials)
  }

  async listShipments(credentials: Credentials, params: QueryParams): Promise<Shipment[]> {
    const client = new TurvoClient(credentials)
    const res = await client.get<TurvoShipmentsListResponse>('/shipments', params as Record<string, unknown>)
    return (res.data ?? []).map(transformShipment)
  }

  async getShipment(credentials: Credentials, id: string): Promise<Shipment> {
    const client = new TurvoClient(credentials)
    const res = await client.get<TurvoShipmentResponse>(`/shipments/${id}`)
    return transformShipment(res.data ?? {})
  }

  async createShipment(credentials: Credentials, data: Partial<Shipment>): Promise<Shipment> {
    const client = new TurvoClient(credentials)
    const res = await client.post<TurvoShipmentResponse>('/shipments', data)
    return transformShipment(res.data ?? {})
  }

  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const client = new TurvoClient(credentials)
    const res = await client.get<TurvoOrdersListResponse>('/orders', params as Record<string, unknown>)
    return (res.data ?? []).map(transformOrder)
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const client = new TurvoClient(credentials)
    const res = await client.get<TurvoOrderResponse>(`/orders/${id}`)
    return transformOrder(res.data ?? {})
  }

  async getTrackingEvents(credentials: Credentials, shipmentId: string): Promise<TrackingEvent[]> {
    const client = new TurvoClient(credentials)
    const res = await client.get<TurvoTrackingEventsResponse>(`/shipments/${shipmentId}/tracking`)
    return (res.data ?? []).map(transformTrackingEvent)
  }
}
