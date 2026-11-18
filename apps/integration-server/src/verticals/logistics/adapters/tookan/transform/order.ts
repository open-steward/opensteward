import type { Order, OrderStatus } from '../../../schema/order'
import { toAddress } from '../../shared/transform'

/**
 * A Tookan task, the "task data" that `POST /v2/get_all_tasks` returns
 * ("data": {<Array of task data>}) and `POST /v2/get_job_details` returns per
 * job id (https://jsapi.apiary.io/apis/tookanapi.apib). Only fields that
 * appear in the documented task examples (Get Task Details, Get All Related
 * Tasks) are read.
 */
export interface TookanTaskOrder {
  job_id: number | string
  job_status?: number | null
  order_id?: string | null
  customer_id?: number | string | null
  job_description?: string | null
  job_pickup_name?: string | null
  job_pickup_phone?: string | null
  job_pickup_email?: string | null
  job_pickup_address?: string | null
  customer_username?: string | null
  customer_phone?: string | null
  customer_email?: string | null
  job_address?: string | null
  /**
   * e.g. "2018-10-29T09:40:28.000Z" (Get All Related Tasks). Not read: the
   * same example carries "job_time": "2018-10-29T19:00:00.000Z" beside
   * "job_time_utc": "2018-10-29T13:30:00.000Z" and "timezone": "-330", so a
   * `Z` suffix here does not mean UTC, and creation_datetime has no `_utc`
   * twin to settle its zone.
   */
  creation_datetime?: string | null
  /** UTC "YYYY-MM-DD HH:MM:SS", e.g. "2017-12-06 12:29:47" (Get Task Details). */
  started_datetime_utc?: string | null
  /** UTC "YYYY-MM-DD HH:MM:SS", e.g. "2017-12-06 12:37:16" (Get Task Details). */
  completed_datetime_utc?: string | null
  [key: string]: unknown
}

/**
 * The documented "Task Statuses" table: 0 Assigned, 1 Started ("the agent is
 * on the way"), 2 Successful, 3 Failed, 4 InProgress/Arrived, 6 Unassigned,
 * 7 Accepted/Acknowledged, 8 Decline, 9 Cancel, 10 Deleted. Failed and
 * Decline have no canonical order status and map to 'unknown'.
 */
function mapStatus(s: number | null | undefined): OrderStatus {
  switch (s) {
    case 6:
      return 'PENDING'
    case 0:
    case 7:
      return 'PROCESSING'
    case 1:
    case 4:
      return 'SHIPPED'
    case 2:
      return 'DELIVERED'
    case 9:
    case 10:
      return 'CANCELLED'
    default:
      return 'unknown'
  }
}

/** A `*_datetime_utc` value, "YYYY-MM-DD HH:MM:SS" in UTC. */
function utcDate(val: string | null | undefined): Date | undefined {
  if (!val) return undefined
  const m = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/.exec(val)
  if (!m) return undefined
  const [, y, mo, d, h, mi, s] = m
  const ms = Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s))
  const out = new Date(ms)
  // "0000-00-00 00:00:00" and other placeholders do not round-trip.
  return out.getUTCFullYear() === Number(y) && out.getUTCMonth() === Number(mo) - 1
    ? out
    : undefined
}

function text(val: unknown): string | undefined {
  return typeof val === 'string' && val !== '' ? val : undefined
}

export function transformOrder(raw: TookanTaskOrder): Order {
  const status = mapStatus(raw.job_status ?? undefined)
  return {
    id: String(raw.job_id),
    status,
    orderNumber: text(raw.order_id),
    customerId:
      raw.customer_id != null && raw.customer_id !== '' ? String(raw.customer_id) : undefined,
    originAddress: text(raw.job_pickup_address)
      ? toAddress({
          street1: raw.job_pickup_address,
          name: text(raw.job_pickup_name),
          phone: text(raw.job_pickup_phone),
          email: text(raw.job_pickup_email),
        })
      : undefined,
    destinationAddress: text(raw.job_address)
      ? toAddress({
          street1: raw.job_address,
          name: text(raw.customer_username),
          phone: text(raw.customer_phone),
          email: text(raw.customer_email),
        })
      : undefined,
    notes: text(raw.job_description),
    shippedAt: utcDate(raw.started_datetime_utc),
    deliveredAt: status === 'DELIVERED' ? utcDate(raw.completed_datetime_utc) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
