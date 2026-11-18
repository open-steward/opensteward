import { connectionScope, cursorPagerKey, pageByRows, simpleApiKey } from '@opensteward/shared'
import type { LogisticsAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { Shipment } from '../../schema/shipment'
import type { TrackingEvent } from '../../schema/trackingevent'
import type { Warehouse } from '../../schema/warehouse'

import { buildAuthUrl, exchangeApiKey, refreshCredentials as doRefresh } from './auth'
import { CircuitClient } from './client'
import { transformTracking, type CircuitStop } from './transform/tracking'
import { transformShipment, type CircuitStopShipment } from './transform/shipment'
import { transformWarehouse, type CircuitDepot, type CircuitDepotListResponse } from './transform/warehouse'

const SIMPLE_API_KEY_FORM = simpleApiKey()

/**
 * GET /depots is token-paged: `pageToken` continues from a response's
 * `nextPageToken` (null on the last page), and `maxPageSize` is at most 20.
 * https://developer.dispatch.spoke.com/openapi-v0.2b.json (operationId listDepots)
 */
const DEPOTS_MAX_PAGE_SIZE = 20

// ── Resource coverage ──────────────────────────────────────────────
// Unavailable: carrier  — Circuit is a route-optimisation platform with no carrier concept
// Unavailable: label    — Circuit has no label printing or management resource
// Unavailable: manifest — Circuit has no manifest resource
// Unavailable: order    — Circuit has no order resource; stops are delivery tasks, not commerce orders
// Unavailable: rate     — Circuit has no rate-shopping capability

export class CircuitAdapter implements LogisticsAdapter {

  // Connect Link support — single API-key form.

  credentialFields = SIMPLE_API_KEY_FORM.credentialFields

  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'circuit'
  readonly version = '1'

  getAuthUrl(state: string): string { return buildAuthUrl(state) }
  async exchangeCode(code: string, _ru: string): Promise<Credentials> { return exchangeApiKey(code) }
  async refreshCredentials(c: Credentials): Promise<Credentials> { return doRefresh(c) }

  async getTrackingEvents(credentials: Credentials, trackingNumber: string): Promise<TrackingEvent[]> {
    const client = new CircuitClient(credentials)
    const raw = await client.get<CircuitStop>(`stops/${trackingNumber}`)
    return transformTracking(raw)
  }

  async createShipment(credentials: Credentials, data: Partial<Shipment>): Promise<Shipment> {
    const client = new CircuitClient(credentials)
    const raw = await client.post<CircuitStopShipment>('stops', {
      address: {
        addressLineOne: data.destinationAddress?.street1,
        addressLineTwo: data.destinationAddress?.street2,
        city: data.destinationAddress?.city,
        state: data.destinationAddress?.state,
        zip: data.destinationAddress?.postalCode,
        country: data.destinationAddress?.country,
      },
      recipient: {
        name: data.destinationAddress?.name,
        phone: data.destinationAddress?.phone,
        email: data.destinationAddress?.email,
      },
      externalId: data.reference,
      notes: data.notes,
    })
    return transformShipment(raw)
  }

  /**
   * One upstream page holds at most 20 depots, so a caller page is cut out of
   * the token chain by rows. Upstream pages are always requested at the
   * documented maximum, which the key therefore carries.
   */
  async listWarehouses(credentials: Credentials, params: QueryParams): Promise<Warehouse[]> {
    const client = new CircuitClient(credentials)
    const key = cursorPagerKey(connectionScope('circuit', credentials), 'depots', {
      maxPageSize: DEPOTS_MAX_PAGE_SIZE,
    })
    const { items } = await pageByRows<Warehouse>(key, params, async (pageToken) => {
      const res = await client.get<CircuitDepotListResponse>('depots', {
        maxPageSize: DEPOTS_MAX_PAGE_SIZE,
        pageToken,
      })
      return { items: (res.depots ?? []).map(transformWarehouse), next: res.nextPageToken ?? null }
    })
    return items
  }

  async getWarehouse(credentials: Credentials, id: string): Promise<Warehouse> {
    const client = new CircuitClient(credentials)
    const raw = await client.get<CircuitDepot>(`depots/${id}`)
    return transformWarehouse(raw)
  }
}
