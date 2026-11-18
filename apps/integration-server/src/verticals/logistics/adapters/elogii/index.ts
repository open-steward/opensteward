// ── Resource coverage ──────────────────────────────────────────────
// Unavailable: carrier  — eLogii is a last-mile route optimization platform managing its own delivery fleet; it has no multi-carrier concept or /carriers endpoint.
// Unavailable: label    — eLogii does not generate carrier shipping labels; label generation is not part of its delivery management API.
// Unavailable: manifest — eLogii has no manifest concept or endpoint; it manages route plans and tasks rather than carrier manifests.
// Unavailable: rate     — eLogii does not perform carrier rate shopping; it is a route optimizer for own-fleet delivery, not a multi-carrier shipping platform.

import { simpleApiKey } from '@opensteward/shared'
import type { LogisticsAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { Shipment } from '../../schema/shipment'
import type { Order } from '../../schema/order'
import type { Warehouse } from '../../schema/warehouse'
import type { TrackingEvent } from '../../schema/trackingevent'

import { buildAuthUrl, exchangeApiKey, refreshCredentials as doRefresh } from './auth'
import { ElogiiClient } from './client'
import { ELOGII_PLATFORM, ELOGII_VERSION } from './constants'
import { transformShipment, type ElogiiTask } from './transform/shipment'
import { transformTracking } from './transform/tracking'
import { transformOrder } from './transform/order'
import { transformWarehouse, type ElogiiDepot } from './transform/warehouse'

const SIMPLE_API_KEY_FORM = simpleApiKey()

// eLogii paginates with page/per_page query params
interface ElogiiListResponse<T> {
  data?: T[]
  total?: number
  page?: number
  per_page?: number
}

export class ElogiiAdapter implements LogisticsAdapter {
  // Connect Link support — single API-key form
  credentialFields = SIMPLE_API_KEY_FORM.credentialFields
  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = ELOGII_PLATFORM
  readonly version = ELOGII_VERSION

  getAuthUrl(state: string): string { return buildAuthUrl(state) }
  async exchangeCode(code: string, _ru: string): Promise<Credentials> { return exchangeApiKey(code) }
  async refreshCredentials(c: Credentials): Promise<Credentials> { return doRefresh(c) }

  // ── Shipments (eLogii tasks) ─────────────────────────────────────────────

  async listShipments(credentials: Credentials, params: QueryParams): Promise<Shipment[]> {
    const client = new ElogiiClient(credentials)
    const resp = await client.get<ElogiiListResponse<ElogiiTask> | ElogiiTask[]>('/tasks', {
      page: params.page ?? 1,
      per_page: params.limit ?? 50,
      ...(params.since ? { date_from: params.since } : {}),
      ...(params.until ? { date_to: params.until } : {}),
    })
    const tasks = Array.isArray(resp) ? resp : (resp.data ?? [])
    return tasks.map(transformShipment)
  }

  async getShipment(credentials: Credentials, id: string): Promise<Shipment> {
    const client = new ElogiiClient(credentials)
    const raw = await client.get<ElogiiTask>(`/tasks/${id}`)
    return transformShipment(raw)
  }

  async createShipment(credentials: Credentials, data: Partial<Shipment>): Promise<Shipment> {
    const client = new ElogiiClient(credentials)
    const body: Record<string, unknown> = {}
    if (data.destinationAddress) {
      body.location = {
        address: {
          street: data.destinationAddress.street1 ?? '',
          street2: data.destinationAddress.street2 ?? '',
          city: data.destinationAddress.city ?? '',
          state: data.destinationAddress.state ?? '',
          country: data.destinationAddress.country ?? '',
          postcode: data.destinationAddress.postalCode ?? '',
        },
      }
      body.contact = {
        name: data.destinationAddress.name ?? '',
        phone: data.destinationAddress.phone ?? '',
        email: data.destinationAddress.email ?? '',
      }
    }
    if (data.originAddress) {
      body.pickupLocation = {
        address: {
          street: data.originAddress.street1 ?? '',
          city: data.originAddress.city ?? '',
          state: data.originAddress.state ?? '',
          country: data.originAddress.country ?? '',
          postcode: data.originAddress.postalCode ?? '',
        },
      }
      body.pickupContact = {
        name: data.originAddress.name ?? '',
        phone: data.originAddress.phone ?? '',
        email: data.originAddress.email ?? '',
      }
    }
    if (data.notes) body.note = data.notes
    if (data.reference) body.orderNumber = data.reference
    const raw = await client.post<ElogiiTask>('/tasks', body)
    return transformShipment(raw)
  }

  async cancelShipment(credentials: Credentials, id: string): Promise<void> {
    const client = new ElogiiClient(credentials)
    await client.delete(`/tasks/${id}`)
  }

  // ── Orders (same underlying resource as tasks) ───────────────────────────

  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const client = new ElogiiClient(credentials)
    const resp = await client.get<ElogiiListResponse<ElogiiTask> | ElogiiTask[]>('/tasks', {
      page: params.page ?? 1,
      per_page: params.limit ?? 50,
      ...(params.since ? { date_from: params.since } : {}),
      ...(params.until ? { date_to: params.until } : {}),
    })
    const tasks = Array.isArray(resp) ? resp : (resp.data ?? [])
    return tasks.map(transformOrder)
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const client = new ElogiiClient(credentials)
    const raw = await client.get<ElogiiTask>(`/tasks/${id}`)
    return transformOrder(raw)
  }

  async createOrder(credentials: Credentials, data: Partial<Order>): Promise<Order> {
    const client = new ElogiiClient(credentials)
    const body: Record<string, unknown> = {}
    if (data.destinationAddress) {
      body.location = {
        address: {
          street: data.destinationAddress.street1 ?? '',
          street2: data.destinationAddress.street2 ?? '',
          city: data.destinationAddress.city ?? '',
          state: data.destinationAddress.state ?? '',
          country: data.destinationAddress.country ?? '',
          postcode: data.destinationAddress.postalCode ?? '',
        },
      }
      body.contact = {
        name: data.destinationAddress.name ?? '',
        phone: data.destinationAddress.phone ?? '',
        email: data.destinationAddress.email ?? '',
      }
    }
    if (data.originAddress) {
      body.pickupLocation = {
        address: {
          street: data.originAddress.street1 ?? '',
          city: data.originAddress.city ?? '',
          state: data.originAddress.state ?? '',
          country: data.originAddress.country ?? '',
          postcode: data.originAddress.postalCode ?? '',
        },
      }
    }
    if (data.notes) body.note = data.notes
    if (data.orderNumber) body.orderNumber = data.orderNumber
    const raw = await client.post<ElogiiTask>('/tasks', body)
    return transformOrder(raw)
  }

  async updateOrder(credentials: Credentials, id: string, data: Partial<Order>): Promise<Order> {
    const client = new ElogiiClient(credentials)
    const body: Record<string, unknown> = {}
    if (data.destinationAddress) {
      body.location = {
        address: {
          street: data.destinationAddress.street1 ?? '',
          street2: data.destinationAddress.street2 ?? '',
          city: data.destinationAddress.city ?? '',
          state: data.destinationAddress.state ?? '',
          country: data.destinationAddress.country ?? '',
          postcode: data.destinationAddress.postalCode ?? '',
        },
      }
      body.contact = {
        name: data.destinationAddress.name ?? '',
        phone: data.destinationAddress.phone ?? '',
        email: data.destinationAddress.email ?? '',
      }
    }
    if (data.notes) body.note = data.notes
    const raw = await client.put<ElogiiTask>(`/tasks/${id}`, body)
    return transformOrder(raw)
  }

  async cancelOrder(credentials: Credentials, id: string): Promise<void> {
    const client = new ElogiiClient(credentials)
    await client.delete(`/tasks/${id}`)
  }

  // ── Tracking Events ──────────────────────────────────────────────────────

  async getTrackingEvents(credentials: Credentials, trackingNumber: string): Promise<TrackingEvent[]> {
    const client = new ElogiiClient(credentials)
    const raw = await client.get<ElogiiTask>(`/tasks/${trackingNumber}`)
    return transformTracking(raw)
  }

  // ── Warehouses (eLogii depots) ───────────────────────────────────────────

  async listWarehouses(credentials: Credentials, params: QueryParams): Promise<Warehouse[]> {
    const client = new ElogiiClient(credentials)
    const resp = await client.get<ElogiiListResponse<ElogiiDepot> | ElogiiDepot[]>('/depots', {
      page: params.page ?? 1,
      per_page: params.limit ?? 50,
    })
    const depots = Array.isArray(resp) ? resp : (resp.data ?? [])
    return depots.map(transformWarehouse)
  }

  async getWarehouse(credentials: Credentials, id: string): Promise<Warehouse> {
    const client = new ElogiiClient(credentials)
    const raw = await client.get<ElogiiDepot>(`/depots/${id}`)
    return transformWarehouse(raw)
  }
}
