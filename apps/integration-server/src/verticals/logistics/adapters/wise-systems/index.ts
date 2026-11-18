import { simpleApiKey } from '@opensteward/shared'
import type { LogisticsAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { Shipment } from '../../schema/shipment'
import type { Order } from '../../schema/order'
import type { TrackingEvent } from '../../schema/trackingevent'
import type { Warehouse } from '../../schema/warehouse'

import { buildAuthUrl, exchangeApiKey, refreshCredentials as doRefresh } from './auth'
import { WiseSystemsClient } from './client'
import { transformShipment, type WiseSystemsTask } from './transform/shipment'
import { transformTracking } from './transform/tracking'
import { transformOrder } from './transform/order'
import { transformWarehouse, type WiseSystemsDepot } from './transform/warehouse'

// ── Resource coverage ──────────────────────────────────────────────
// Unavailable: carrier  — Wise Systems has no carrier configuration API; it is an autonomous dispatch platform, not a multi-carrier shipping platform
// Unavailable: label    — No shipping label generation endpoints exist in the Wise Systems API
// Unavailable: manifest — No manifest endpoints exist in the Wise Systems API
// Unavailable: rate     — No rate/quote calculation endpoints exist in the Wise Systems API

const SIMPLE_API_KEY_FORM = simpleApiKey()

interface WiseSystemsListResponse<T> {
  meta?: { page?: number; limit?: number; total?: number }
  data?: T[]
}

interface WiseSystemsSingleResponse<T> {
  data?: T
}

export class WiseSystemsAdapter implements LogisticsAdapter {
  // Connect Link support — single API-key form.
  credentialFields = SIMPLE_API_KEY_FORM.credentialFields
  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'wise-systems'
  readonly version = '1'

  getAuthUrl(state: string): string { return buildAuthUrl(state) }
  async exchangeCode(code: string, _ru: string): Promise<Credentials> { return exchangeApiKey(code) }
  async refreshCredentials(c: Credentials): Promise<Credentials> { return doRefresh(c) }

  // ─── Shipments (backed by Wise Systems tasks) ─────────────────────────────

  async listShipments(credentials: Credentials, params: QueryParams): Promise<Shipment[]> {
    const client = new WiseSystemsClient(credentials)
    const page = typeof params.page === 'number' ? params.page : 0
    const limit = typeof params.limit === 'number' ? params.limit : 50
    const res = await client.get<WiseSystemsListResponse<WiseSystemsTask>>('/tasks', {
      page,
      limit,
    })
    return (res.data ?? []).map(transformShipment)
  }

  async getShipment(credentials: Credentials, id: string): Promise<Shipment> {
    const client = new WiseSystemsClient(credentials)
    const res = await client.get<WiseSystemsSingleResponse<WiseSystemsTask> | WiseSystemsTask>(`/task/${id}`)
    const raw: WiseSystemsTask = (res as WiseSystemsSingleResponse<WiseSystemsTask>).data ?? (res as WiseSystemsTask)
    return transformShipment(raw)
  }

  async createShipment(credentials: Credentials, data: Partial<Shipment>): Promise<Shipment> {
    const client = new WiseSystemsClient(credentials)
    const body: Record<string, unknown> = {
      type: 'delivery',
      props: {
        notes: data.notes ?? undefined,
        reference: data.reference ?? undefined,
      },
    }
    if (data.destinationAddress) {
      body.location = {
        address: data.destinationAddress.street1,
        city: data.destinationAddress.city,
        state: data.destinationAddress.state,
        postal_code: data.destinationAddress.postalCode,
        country: data.destinationAddress.country,
        name: data.destinationAddress.name,
        phone: data.destinationAddress.phone,
      }
    }
    const res = await client.post<WiseSystemsSingleResponse<WiseSystemsTask> | WiseSystemsTask>('/task', body)
    const raw: WiseSystemsTask = (res as WiseSystemsSingleResponse<WiseSystemsTask>).data ?? (res as WiseSystemsTask)
    return transformShipment(raw)
  }

  async cancelShipment(credentials: Credentials, id: string): Promise<void> {
    const client = new WiseSystemsClient(credentials)
    await client.delete<unknown>(`/task/${id}`)
  }

  // ─── Orders (backed by Wise Systems tasks) ────────────────────────────────

  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const client = new WiseSystemsClient(credentials)
    const page = typeof params.page === 'number' ? params.page : 0
    const limit = typeof params.limit === 'number' ? params.limit : 50
    const res = await client.get<WiseSystemsListResponse<WiseSystemsTask>>('/tasks', {
      page,
      limit,
    })
    return (res.data ?? []).map(transformOrder)
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const client = new WiseSystemsClient(credentials)
    const res = await client.get<WiseSystemsSingleResponse<WiseSystemsTask> | WiseSystemsTask>(`/task/${id}`)
    const raw: WiseSystemsTask = (res as WiseSystemsSingleResponse<WiseSystemsTask>).data ?? (res as WiseSystemsTask)
    return transformOrder(raw)
  }

  async createOrder(credentials: Credentials, data: Partial<Order>): Promise<Order> {
    const client = new WiseSystemsClient(credentials)
    const body: Record<string, unknown> = {
      type: 'delivery',
      props: {
        notes: data.notes ?? undefined,
        reference: data.orderNumber ?? undefined,
      },
    }
    if (data.destinationAddress) {
      body.location = {
        address: data.destinationAddress.street1,
        city: data.destinationAddress.city,
        state: data.destinationAddress.state,
        postal_code: data.destinationAddress.postalCode,
        country: data.destinationAddress.country,
        name: data.destinationAddress.name,
        phone: data.destinationAddress.phone,
      }
    }
    const res = await client.post<WiseSystemsSingleResponse<WiseSystemsTask> | WiseSystemsTask>('/task', body)
    const raw: WiseSystemsTask = (res as WiseSystemsSingleResponse<WiseSystemsTask>).data ?? (res as WiseSystemsTask)
    return transformOrder(raw)
  }

  async updateOrder(credentials: Credentials, id: string, data: Partial<Order>): Promise<Order> {
    const client = new WiseSystemsClient(credentials)
    const body: Record<string, unknown> = {
      props: {
        notes: data.notes ?? undefined,
        reference: data.orderNumber ?? undefined,
      },
    }
    const res = await client.patch<WiseSystemsSingleResponse<WiseSystemsTask> | WiseSystemsTask>(`/task/${id}`, body)
    const raw: WiseSystemsTask = (res as WiseSystemsSingleResponse<WiseSystemsTask>).data ?? (res as WiseSystemsTask)
    return transformOrder(raw)
  }

  async cancelOrder(credentials: Credentials, id: string): Promise<void> {
    const client = new WiseSystemsClient(credentials)
    await client.delete<unknown>(`/task/${id}`)
  }

  // ─── Warehouses (backed by Wise Systems depots) ───────────────────────────

  async listWarehouses(credentials: Credentials, params: QueryParams): Promise<Warehouse[]> {
    const client = new WiseSystemsClient(credentials)
    const page = typeof params.page === 'number' ? params.page : 0
    const limit = typeof params.limit === 'number' ? params.limit : 50
    const res = await client.get<WiseSystemsListResponse<WiseSystemsDepot>>('/depots', {
      page,
      limit,
    })
    return (res.data ?? []).map(transformWarehouse)
  }

  async getWarehouse(credentials: Credentials, id: string): Promise<Warehouse> {
    const client = new WiseSystemsClient(credentials)
    const res = await client.get<WiseSystemsSingleResponse<WiseSystemsDepot> | WiseSystemsDepot>(`/depot/${id}`)
    const raw: WiseSystemsDepot = (res as WiseSystemsSingleResponse<WiseSystemsDepot>).data ?? (res as WiseSystemsDepot)
    return transformWarehouse(raw)
  }

  // ─── Tracking Events ──────────────────────────────────────────────────────

  async getTrackingEvents(credentials: Credentials, trackingNumber: string): Promise<TrackingEvent[]> {
    const client = new WiseSystemsClient(credentials)
    const res = await client.get<WiseSystemsSingleResponse<WiseSystemsTask> | WiseSystemsTask>(`/task/${trackingNumber}`)
    const raw: WiseSystemsTask = (res as WiseSystemsSingleResponse<WiseSystemsTask>).data ?? (res as WiseSystemsTask)
    return transformTracking(raw)
  }

  async listTrackingEvents(credentials: Credentials, params: QueryParams): Promise<TrackingEvent[]> {
    const client = new WiseSystemsClient(credentials)
    const page = typeof params.page === 'number' ? params.page : 0
    const limit = typeof params.limit === 'number' ? params.limit : 50
    const res = await client.get<WiseSystemsListResponse<WiseSystemsTask>>('/tasks', {
      page,
      limit,
    })
    return (res.data ?? []).flatMap(transformTracking)
  }
}
