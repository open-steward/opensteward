import { simpleApiKey } from '@opensteward/shared'
import type { LogisticsAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { Shipment } from '../../schema/shipment'
import type { TrackingEvent } from '../../schema/trackingevent'
import type { Order } from '../../schema/order'
import type { Warehouse } from '../../schema/warehouse'

import { buildAuthUrl, exchangeApiKey, refreshCredentials as doRefresh } from './auth'
import { OnfleetClient } from './client'
import { transformTracking, type OnfleetTask } from './transform/tracking'
import { transformShipment, type OnfleetShipment } from './transform/shipment'
import { transformOrder, type OnfleetOrder } from './transform/order'
import { transformWarehouse, type OnfleetHub } from './transform/warehouse'

// ── Resource coverage ──────────────────────────────────────────────
// Unavailable: carrier  — Onfleet is the courier network itself; no external carrier catalog endpoint exists
// Unavailable: label    — Onfleet dispatches tasks via app, not shipping labels; no label endpoint
// Unavailable: manifest — Worker route manifest (GET workers/{id}/deliveryManifest) is a per-driver
//                         route document, not a carrier-submission manifest; no list/get manifest API
// Unavailable: rate     — Onfleet does not calculate shipping rates; no rate endpoint

const SIMPLE_API_KEY_FORM = simpleApiKey()


export class OnfleetAdapter implements LogisticsAdapter {

  // Connect Link support — single API-key form.

  credentialFields = SIMPLE_API_KEY_FORM.credentialFields

  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'onfleet'
  readonly version = '1'

  getAuthUrl(state: string): string { return buildAuthUrl(state) }
  async exchangeCode(code: string, _ru: string): Promise<Credentials> { return exchangeApiKey(code) }
  async refreshCredentials(c: Credentials): Promise<Credentials> { return doRefresh(c) }

  async getTrackingEvents(credentials: Credentials, trackingNumber: string): Promise<TrackingEvent[]> {
    const client = new OnfleetClient(credentials)
    const raw = await client.get<OnfleetTask>(`tasks/${trackingNumber}`)
    return transformTracking(raw)
  }

  async createShipment(credentials: Credentials, data: Partial<Shipment>): Promise<Shipment> {
    const client = new OnfleetClient(credentials)
    const raw = await client.post<OnfleetShipment>('tasks', {
      destination: { address: data.destinationAddress },
      recipients: data.destinationAddress?.name ? [{ name: data.destinationAddress.name, phone: data.destinationAddress.phone }] : [],
      notes: data.notes,
    })
    return transformShipment(raw)
  }

  // Orders — GET /api/v2/taskOrders/{shortId}
  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const client = new OnfleetClient(credentials)
    const raw = await client.get<OnfleetOrder>(`taskOrders/${id}`)
    return transformOrder(raw)
  }

  // Warehouses — GET /api/v2/hubs (returns an array of hub objects)
  async listWarehouses(credentials: Credentials, _params: QueryParams): Promise<Warehouse[]> {
    const client = new OnfleetClient(credentials)
    const raw = await client.get<OnfleetHub[]>('hubs')
    return raw.map(transformWarehouse)
  }
}
