import { simpleApiKey, reportUpstreamPage } from '@opensteward/shared'
import type { LogisticsAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { Shipment } from '../../schema/shipment'
import type { TrackingEvent } from '../../schema/trackingevent'
import type { Order } from '../../schema/order'

import { buildAuthUrl, exchangeApiKey, refreshCredentials as doRefresh } from './auth'
import { LoginextClient } from './client'
import {
  LOGINEXT_DEFAULT_PAGE_SIZE,
  LOGINEXT_MAX_PAGE_SIZE,
  LOGINEXT_ORDER_GET_PATH,
} from './constants'
import { transformOrder, type LoginextOrder } from './transform/order'
import { transformShipment } from './transform/shipment'

// ── Resource coverage ──────────────────────────────────────────────
// Docs: https://raw.githubusercontent.com/loginextsolutions/docs/master/source/index.html.md
// (the vendor's own Slate source; developers.loginextsolutions.com no longer resolves).
// Available:   order, shipment — the Order "Get" API,
//              GET /ShipmentApp/mile/v1/shipment (one row per delivery order)
// Refused:     trackingevent  — no documented event history (see listTrackingEvents)
// Unverified:  carrier, warehouse, label, manifest, rate — not implemented

const SIMPLE_API_KEY_FORM = simpleApiKey()

const DAY_MS = 86_400_000

/**
 * The Order Get response envelope, as its example shows it:
 * `{ "status": 200, "message": "SUCCESS", "moreResultsExists": false,
 *    "data": [ ... ], "hasError": false }`.
 */
interface LoginextOrderGetResponse {
  status?: number | null
  message?: string | null
  moreResultsExists?: boolean | null
  data?: LoginextOrder[] | null
  hasError?: boolean | null
}

function notSupported(message: string): Error {
  return Object.assign(new Error(message), { statusCode: 501, code: 'NOT_SUPPORTED' })
}

function upstreamError(message: string): Error {
  return Object.assign(new Error(message), { statusCode: 502, code: 'UPSTREAM_ERROR' })
}

/** `yyyy-MM-dd HH:mm:ss` in UTC: the documented start_date/end_date format. */
function loginextDateParam(ms: number): string {
  return new Date(ms).toISOString().slice(0, 19).replace('T', ' ')
}

/**
 * The `data` rows of a successful Order Get response. The docs' success
 * envelope is `"status": 200 ... "hasError": false`; anything else is an
 * error, never an empty page.
 */
function rowsOf(res: LoginextOrderGetResponse): LoginextOrder[] {
  if (res.hasError === true || (typeof res.status === 'number' && res.status !== 200)) {
    throw upstreamError(
      `LogiNext order get failed with status ${String(res.status)}: ${String(res.message)}`,
    )
  }
  if (!Array.isArray(res.data)) throw upstreamError('LogiNext order get returned no data array')
  return res.data
}

function notFound(id: string): Error {
  return Object.assign(new Error(`LogiNext order not found: ${id}`), {
    statusCode: 404,
    code: 'NOT_FOUND',
  })
}

// ─── adapter ─────────────────────────────────────────────────────────────────

export class LoginextAdapter implements LogisticsAdapter {
  readonly platform = 'loginext'
  readonly version = '1'

  // Connect Link support — single API-key form
  credentialFields = SIMPLE_API_KEY_FORM.credentialFields
  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  getAuthUrl(state: string): string {
    return buildAuthUrl(state)
  }

  async exchangeCode(code: string, _redirectUri: string): Promise<Credentials> {
    return exchangeApiKey(code)
  }

  async refreshCredentials(c: Credentials): Promise<Credentials> {
    return doRefresh(c)
  }

  /**
   * One page of the Order "Get" API,
   * `GET https://api.loginextsolutions.com/ShipmentApp/mile/v1/shipment`:
   *
   * - "start_date ... Conditional Mandatory | If order_no is not passed in the
   *   request, then this field is mandatory. ... Format 'yyyy-MM-dd HH:mm:ss'",
   *   and end_date likewise. The docs give no lookback bound, so a call without
   *   `updatedAfter` is refused before any request. With it, the range runs
   *   from `updatedAfter` to the end of the current UTC day, so page N asks the
   *   same question on every call that day. Input dates "are accepted in
   *   Coordinated Universal Time (UTC) format."
   * - status=ALL: "Superset of all the filters mentioned for the above statuses
   *   will be considered."
   * - "page_no ... default value (if it isn't specified) will be 1" and
   *   "page_size ... The maximum accepted value is 100": the caller's page and
   *   limit, the limit clamped to 100 and the size sent reported when smaller.
   * - `moreResultsExists` in the response is the end signal.
   */
  private async orderPage(
    credentials: Credentials,
    params: QueryParams,
    resource: 'orders' | 'shipments',
  ): Promise<LoginextOrder[]> {
    const after = params.updatedAfter
    if (!after) {
      throw notSupported(
        `LogiNext cannot list ${resource} without updated_after: its only order list, ` +
          'GET /ShipmentApp/mile/v1/shipment, needs start_date and end_date ("If order_no is ' +
          'not passed in the request, then this field is mandatory") and documents no ' +
          'lookback bound. Pass updated_after to list the orders since then.',
      )
    }
    const from = new Date(after).getTime()
    if (Number.isNaN(from)) {
      throw Object.assign(new Error('updated_after is not a valid date'), {
        statusCode: 400,
        code: 'BAD_REQUEST',
      })
    }
    const to = Math.floor(Date.now() / DAY_MS) * DAY_MS + DAY_MS - 1000
    if (from > to) {
      reportUpstreamPage(params, { hasMore: false })
      return []
    }

    const page =
      typeof params.page === 'number' && Number.isFinite(params.page) && params.page >= 1
        ? Math.floor(params.page)
        : 1
    const asked =
      typeof params.limit === 'number' && Number.isFinite(params.limit) && params.limit >= 1
        ? Math.floor(params.limit)
        : LOGINEXT_DEFAULT_PAGE_SIZE
    const size = Math.min(asked, LOGINEXT_MAX_PAGE_SIZE)

    const client = new LoginextClient(credentials)
    const res = await client.get<LoginextOrderGetResponse>(LOGINEXT_ORDER_GET_PATH, {
      start_date: loginextDateParam(Math.floor(from / 1000) * 1000),
      end_date: loginextDateParam(to),
      status: 'ALL',
      page_no: page,
      page_size: size,
    })
    const rows = rowsOf(res)
    reportUpstreamPage(params, {
      ...(typeof res.moreResultsExists === 'boolean' ? { hasMore: res.moreResultsExists } : {}),
      ...(size < asked ? { pageSize: size } : {}),
    })
    return rows
  }

  /**
   * One order by its number: the Order Get API with `order_no` ("Only one
   * order number can be passed at a time"), which needs no date range.
   */
  private async orderByNumber(credentials: Credentials, id: string): Promise<LoginextOrder> {
    const client = new LoginextClient(credentials)
    const res = await client.get<LoginextOrderGetResponse>(LOGINEXT_ORDER_GET_PATH, {
      order_no: id,
    })
    const row = rowsOf(res).find((r) => r.orderNo === id)
    if (!row) throw notFound(id)
    return row
  }

  async listShipments(credentials: Credentials, params: QueryParams): Promise<Shipment[]> {
    return (await this.orderPage(credentials, params, 'shipments')).map(transformShipment)
  }

  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    return (await this.orderPage(credentials, params, 'orders')).map(transformOrder)
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    return transformOrder(await this.orderByNumber(credentials, id))
  }

  async getShipment(credentials: Credentials, id: string): Promise<Shipment> {
    return transformShipment(await this.orderByNumber(credentials, id))
  }

  /**
   * LogiNext documents no tracking-event history. Its Mile tracking APIs are
   * "Track Last Location" ("returns the last received geocoordinates of the
   * Order") and an iFrame; "Get Status" returns one current state per order.
   * A current status is not an event, so this refuses before any request.
   */
  async getTrackingEvents(
    _credentials: Credentials,
    _trackingNumber: string,
  ): Promise<TrackingEvent[]> {
    throw notSupported(
      'LogiNext cannot return tracking events: it documents no event history, only "Track Last ' +
        'Location" ("returns the last received geocoordinates of the Order") and the current ' +
        'order status, and recommends "using webhooks instead of polling GET APIs to get real ' +
        'time event updates".',
    )
  }

  async listTrackingEvents(
    _credentials: Credentials,
    _params: QueryParams,
  ): Promise<TrackingEvent[]> {
    throw notSupported(
      'LogiNext cannot list tracking events: it documents no event history, and recommends ' +
        '"using webhooks instead of polling GET APIs to get real time event updates".',
    )
  }

  /**
   * Webhook signature verification — LogiNext does not document a signing secret
   * scheme, so this always returns false until a real HMAC check can be implemented.
   */
  verifyWebhook(_payload: Buffer, _headers: Record<string, string>, _secret: string): boolean {
    return false
  }
}
