// ── Resource coverage ──────────────────────────────────────────────
// Available:   shipment, trackingevent, order
// Unavailable: carrier   — Tookan is a last-mile dispatch platform; carriers (UPS, FedEx, etc.) are not a Tookan concept
// Unavailable: label     — Tookan does not generate shipping labels; no label endpoint exists
// Unavailable: manifest  — Tookan has no manifest concept or endpoint
// Unavailable: rate      — Tookan has no rate-quoting concept or endpoint
// Unavailable: warehouse — Tookan has no warehouse endpoint; geofences are a UI-only concept not exposed via public API

import { simpleApiKey, connectionScope, pageByRows, reportUpstreamPage } from '@opensteward/shared'
import type { LogisticsAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { Shipment } from '../../schema/shipment'
import type { TrackingEvent } from '../../schema/trackingevent'
import type { Order } from '../../schema/order'

import { buildAuthUrl, exchangeApiKey, refreshCredentials as doRefresh } from './auth'
import { TookanClient } from './client'
import { TOOKAN_JOB_TYPES, TOOKAN_WINDOW_DAYS } from './constants'
import { transformTracking, type TookanTask } from './transform/tracking'
import { transformShipment, type TookanShipment } from './transform/shipment'
import { transformOrder, type TookanTaskOrder } from './transform/order'
const SIMPLE_API_KEY_FORM = simpleApiKey()

const DAY_MS = 86_400_000

/** A get_all_tasks position: window `w` (0 = newest), job_type index `t`, requested_page `p`. */
type TaskCursor = { w: number; t: number; p: number }

/** "The response format will be JSON having status, message and data key." */
type TookanEnvelope<T> = { status?: number; message?: string; data?: T }

/** `YYYY-MM-DD` of a UTC midnight, the documented start_date/end_date format. */
function ymd(dayStartMs: number): string {
  return new Date(dayStartMs).toISOString().slice(0, 10)
}

/**
 * `data` of a successful response. The docs list body status codes ("`100`
 * -- PARAMETER_MISSING", "`101` -- INVALID_KEY", "`200` -- ACTION_COMPLETE",
 * "`201` -- SHOW_ERROR_MESSAGE", "`404` -- ERROR_IN_EXECUTION"); anything but
 * 200 is an error, never an empty page.
 */
function dataOf<T>(res: TookanEnvelope<T>, path: string): T | undefined {
  if (res.status !== 200) {
    throw Object.assign(
      new Error(`Tookan ${path} failed with status ${String(res.status)}: ${String(res.message)}`),
      { statusCode: 502, code: 'UPSTREAM_ERROR' },
    )
  }
  return res.data
}

function notFound(id: string): Error {
  return Object.assign(new Error(`Tookan task not found: ${id}`), {
    statusCode: 404,
    code: 'NOT_FOUND',
  })
}

export class TookanAdapter implements LogisticsAdapter {
  // Connect Link support — single API-key form.

  credentialFields = SIMPLE_API_KEY_FORM.credentialFields

  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'tookan'
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
    const client = new TookanClient(credentials)
    const raw = await client.post<{ data?: TookanTask | TookanTask[] }>('get_job_details', {
      job_id: trackingNumber,
    })
    const job = Array.isArray(raw.data) ? raw.data[0] : raw.data
    return job ? transformTracking(job) : []
  }

  async createShipment(credentials: Credentials, data: Partial<Shipment>): Promise<Shipment> {
    const client = new TookanClient(credentials)
    const raw = await client.post<{ data?: TookanShipment }>('create_task', {
      order_id: data.reference,
      job_pickup_address: data.originAddress?.street1,
      job_address: data.destinationAddress?.street1,
      customer_username: data.destinationAddress?.name,
      customer_phone: data.destinationAddress?.phone,
      job_description: data.notes,
    })
    return transformShipment(raw.data ?? ({ job_id: '' } as TookanShipment))
  }

  // ── Orders (Tookan tasks) ──────────────────────────────────────────

  /**
   * `POST https://api.tookanapp.com/v2/get_all_tasks`
   * (https://jsapi.apiary.io/apis/tookanapi.apib, "View All Tasks"). It takes
   * the mandatory "job_type* | number(mandatory) | Filter via Job Type - 0
   * for Pick Up, 1 for Delivery, 2 for Appointment and 3 for FOS" and
   * "start_date* ... (YYYY-MM-DD)" / "end_date* ... (YYYY-MM-DD)", and "The
   * start and End Date shall have to be inside the 31 days span." Paging is
   * "is_pagination ... set this as 1 to enable pagination" with
   * "requested_page ... Current(Which) page"; no page size and no total or
   * next marker is documented, so an empty page is the only end.
   *
   * The date range refers to "Task Date", and no lookback bound is given
   * beyond the window span, so a call without `updatedAfter` is refused
   * before any request. With it, the walk runs through `pageByRows` over
   * 31-day windows anchored to UTC calendar days, newest first, from today
   * back to the day of `updatedAfter`; in each window every documented
   * job_type, and in each job_type `requested_page` 1, 2, ... until a page
   * comes back empty.
   */
  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const after = params.updatedAfter
    if (!after) {
      throw Object.assign(
        new Error(
          'Tookan cannot list orders without updated_after: its only task list, POST ' +
            '/v2/get_all_tasks, needs a start_date/end_date range ("The start and End Date ' +
            'shall have to be inside the 31 days span") and documents no lookback bound. ' +
            'Pass updated_after to walk the task dates since then.',
        ),
        { statusCode: 501, code: 'NOT_SUPPORTED' },
      )
    }
    const top = Math.floor(Date.now() / DAY_MS) * DAY_MS
    const bottom = Math.floor(new Date(after).getTime() / DAY_MS) * DAY_MS
    if (bottom > top) {
      reportUpstreamPage(params, { hasMore: false })
      return []
    }
    const windows = Math.ceil(((top - bottom) / DAY_MS + 1) / TOOKAN_WINDOW_DAYS)
    const client = new TookanClient(credentials)
    const key =
      `tookan:${connectionScope('tookan', credentials)}` +
      `:get_all_tasks:${ymd(bottom)}:${ymd(top)}`
    const { items } = await pageByRows<Order, TaskCursor>(
      key,
      params,
      async (cursor) => {
        const c = cursor ?? { w: 0, t: 0, p: 1 }
        const end = top - c.w * TOOKAN_WINDOW_DAYS * DAY_MS
        const start = Math.max(end - (TOOKAN_WINDOW_DAYS - 1) * DAY_MS, bottom)
        const res = await client.post<TookanEnvelope<TookanTaskOrder[]>>('get_all_tasks', {
          job_type: TOOKAN_JOB_TYPES[c.t],
          start_date: ymd(start),
          end_date: ymd(end),
          is_pagination: 1,
          requested_page: c.p,
        })
        const rows = dataOf(res, 'get_all_tasks')
        if (!Array.isArray(rows)) {
          throw Object.assign(new Error('Tookan get_all_tasks returned no task array in data'), {
            statusCode: 502,
            code: 'UPSTREAM_ERROR',
          })
        }
        let next: TaskCursor | null
        if (rows.length > 0) next = { ...c, p: c.p + 1 }
        else if (c.t + 1 < TOOKAN_JOB_TYPES.length) next = { w: c.w, t: c.t + 1, p: 1 }
        else if (c.w + 1 < windows) next = { w: c.w + 1, t: 0, p: 1 }
        else next = null
        return { items: rows.map(transformOrder), next }
      },
      { maxUpstreamPages: windows * TOOKAN_JOB_TYPES.length + 1000 },
    )
    return items
  }

  /**
   * `POST https://api.tookanapp.com/v2/get_job_details`
   * (https://jsapi.apiary.io/apis/tookanapi.apib, "Get Task Details"):
   * "job_ids* | array | ... You can send 100 job id's in single request.",
   * with numeric ids in the example ("job_ids":[5145, 1234]).
   */
  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    if (!/^\d+$/.test(id)) throw notFound(id)
    const client = new TookanClient(credentials)
    const res = await client.post<TookanEnvelope<TookanTaskOrder[]>>('get_job_details', {
      job_ids: [Number(id)],
    })
    const rows = dataOf(res, 'get_job_details')
    const task = Array.isArray(rows) ? rows.find((r) => String(r.job_id) === id) : undefined
    if (!task) throw notFound(id)
    return transformOrder(task)
  }
}
