// ── Resource coverage ──────────────────────────────────────────────
// Unavailable: carrier   — OptimoRoute is a route-optimisation platform with no carrier accounts/registry endpoint
// Unavailable: label     — OptimoRoute does not generate shipping labels; no label endpoint exists
// Unavailable: manifest  — No manifest concept or endpoint in the OptimoRoute API
// Unavailable: rate      — OptimoRoute does not calculate shipping rates; no rate endpoint exists
// Unavailable: warehouse — No warehouse/depot management endpoint in the OptimoRoute API

import { connectionScope, pageByRows, reportUpstreamPage, simpleApiKey } from '@opensteward/shared'
import type { LogisticsAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { Shipment } from '../../schema/shipment'
import type { TrackingEvent } from '../../schema/trackingevent'
import type { Order } from '../../schema/order'

import { buildAuthUrl, exchangeApiKey, refreshCredentials as doRefresh } from './auth'
import { OptimorouteClient } from './client'
import { transformTracking, type OptimorouteOrder } from './transform/tracking'
import { transformShipment, type OptimorouteShipment } from './transform/shipment'
import {
  transformOrder,
  type OptimorouteOrderResponseObject,
  type OptimorouteSearchOrdersResponse,
} from './transform/order'
const SIMPLE_API_KEY_FORM = simpleApiKey()

function notSupported(message: string): Error {
  return Object.assign(new Error(message), { statusCode: 501, code: 'NOT_SUPPORTED' })
}

const DAY_MS = 86_400_000
/** search_orders: "The range can span at most 35 days, i.e. 5 weeks." */
const MAX_RANGE_DAYS = 35

/**
 * Order-date windows for search_orders, from the UTC day of `updatedAfter`
 * to the current UTC day, each at most 35 days. Days are counted since the
 * epoch; `top` (today) is fixed within a UTC day, so page N of a walk is the
 * same rows while the windows hold the same orders.
 */
interface DateWindows {
  lowerDay: number
  topDay: number
  count: number
}

function dateWindows(updatedAfter: Date): DateWindows | undefined {
  const lowerDay = Math.floor(updatedAfter.getTime() / DAY_MS)
  const topDay = Math.floor(Date.now() / DAY_MS)
  if (!(lowerDay <= topDay)) return undefined
  return { lowerDay, topDay, count: Math.ceil((topDay - lowerDay + 1) / MAX_RANGE_DAYS) }
}

function isoDay(day: number): string {
  return new Date(day * DAY_MS).toISOString().slice(0, 10)
}

/** The dateRange of window `index`, NEWEST first: window 0 ends today. */
function dateRangeAt(w: DateWindows, index: number): { from: string; to: string } {
  const to = w.topDay - index * MAX_RANGE_DAYS
  const from = Math.max(to - (MAX_RANGE_DAYS - 1), w.lowerDay)
  return { from: isoDay(from), to: isoDay(to) }
}

/** A position in the walk: window `w` (newest first), and the after_tag inside it. */
interface SearchCursor {
  w: number
  tag?: string
}

function orderFromResponse(entry: OptimorouteOrderResponseObject): Order {
  if (!entry.data) {
    throw new Error(
      `OptimoRoute search_orders returned order ${entry.id} without data despite includeOrderData`,
    )
  }
  return transformOrder(entry.data)
}

export class OptimorouteAdapter implements LogisticsAdapter {
  // Connect Link support — single API-key form.

  credentialFields = SIMPLE_API_KEY_FORM.credentialFields

  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'optimoroute'
  readonly version = '1'

  getAuthUrl(state: string): string {
    return buildAuthUrl(state)
  }
  async exchangeCode(code: string, _ru: string): Promise<Credentials> {
    return exchangeApiKey(code)
  }
  async refreshCredentials(c: Credentials): Promise<Credentials> {
    return doRefresh(c)
  }

  async getTrackingEvents(
    credentials: Credentials,
    trackingNumber: string,
  ): Promise<TrackingEvent[]> {
    const client = new OptimorouteClient(credentials)
    const raw = await client.post<{ orders?: OptimorouteOrder[] }>('get_completion_details', {
      orders: [{ orderNo: trackingNumber }],
    })
    const order = raw.orders?.[0]
    return order ? transformTracking(order) : []
  }

  async createShipment(credentials: Credentials, data: Partial<Shipment>): Promise<Shipment> {
    const client = new OptimorouteClient(credentials)
    const raw = await client.post<OptimorouteShipment>('create_order', {
      orderNo: data.reference,
      type: 'D',
      location: {
        address: data.destinationAddress?.street1,
        locationName: data.destinationAddress?.name,
      },
      notes: data.notes,
    })
    return transformShipment(raw)
  }

  /**
   * Orders from Search Orders, `POST https://api.optimoroute.com/v1/search_orders`
   * (https://optimoroute.com/api/, "Search Orders"). "At least one of orders or
   * dateRange properties must be specified in the request", and dateRange
   * "can span at most 35 days, i.e. 5 weeks". The docs name no retention or
   * lookback limit, so a call without `updatedAfter` is refused before any
   * request; a call with one walks 35-day order-date windows from its UTC day
   * to today, newest first, through `pageByRows`.
   *
   * Each window sends `includeOrderData: true` ("Set this to true if you need
   * to fetch the order data for the orders found") and pages with `after_tag`:
   * "Up to 500 orders will be returned in one call. Use after_tag to fetch the
   * remaining pages." There is no page-size parameter. `after_tag` is "Only
   * present if the there are more pages of results to fetch", and the next
   * call repeats "all the parameters ... with same values".
   */
  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    if (!params.updatedAfter) {
      throw notSupported(
        'OptimoRoute cannot list orders without updated_after: its only order search, ' +
          'POST /v1/search_orders, requires "At least one of orders or dateRange properties", ' +
          'a dateRange that "can span at most 35 days", and documents no lookback limit. ' +
          'Pass updated_after to walk the order-date windows from then to today.',
      )
    }
    const w = dateWindows(params.updatedAfter)
    if (!w) {
      reportUpstreamPage(params, { hasMore: false })
      return []
    }
    const client = new OptimorouteClient(credentials)
    const key = `optimoroute:${connectionScope('optimoroute', credentials)}:search_orders:${w.lowerDay}:${w.topDay}`
    const { items } = await pageByRows<Order, SearchCursor>(
      key,
      params,
      async (cursor) => {
        const at = cursor ?? { w: 0 }
        const res = await client.post<OptimorouteSearchOrdersResponse>('search_orders', {
          dateRange: dateRangeAt(w, at.w),
          includeOrderData: true,
          ...(at.tag !== undefined ? { after_tag: at.tag } : {}),
        })
        if (res.success !== true) {
          throw new Error('OptimoRoute search_orders returned success: false')
        }
        const rows = (res.orders ?? []).map(orderFromResponse)
        const next: SearchCursor | null =
          typeof res.after_tag === 'string' && res.after_tag !== ''
            ? { w: at.w, tag: res.after_tag }
            : at.w + 1 < w.count
              ? { w: at.w + 1 }
              : null
        return { items: rows, next }
      },
      // Every window is at least one upstream page, empty or not, on top of
      // the pages that hold rows.
      { maxUpstreamPages: w.count + 1_000 },
    )
    return items
  }

  /**
   * One order by the OptimoRoute `id` that listOrders returns, from Get Orders
   * (bulk), `POST https://api.optimoroute.com/v1/get_orders`: "Each order
   * object can contain either of: orderNo ... id : the unique identifier of
   * the order, assigned by OptimoRoute".
   */
  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const client = new OptimorouteClient(credentials)
    const raw = await client.post<{ success: boolean; orders?: OptimorouteOrderResponseObject[] }>(
      'get_orders',
      {
        orders: [{ id }],
      },
    )
    const entry = raw.orders?.[0]
    if (!entry?.data) throw new Error(`Order not found: ${id}`)
    return transformOrder(entry.data)
  }
}
