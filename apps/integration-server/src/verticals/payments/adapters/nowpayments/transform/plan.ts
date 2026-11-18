/**
 * NOWPayments subscription plan → canonical Plan.
 *
 * "Get all plans" (GET /v1/subscriptions/plans) and "Get one plan"
 * (GET /v1/subscriptions/plans/:plan-id) return rows shaped
 * {"id":"76215585","title":"test plan","interval_day":"1","amount":2,
 *  "currency":"USD","ipn_callback_url":null,"success_url":null,
 *  "cancel_url":null,"partially_paid_url":null,"created_at":"...","updated_at":"..."};
 * https://documenter.getpostman.com/view/7907941/2s93JusNJt.
 *
 * `interval_day` is a number of days, so the plan bills every N days:
 * interval 'day', intervalCount N.
 */
import { majorToMinor } from '@opensteward/shared'
import type { Plan } from '../../../schema/plan'
import { requireAmount, requireCurrency, requireId, strMap } from './shared'

export interface RawNowpaymentsplan {
  id?: number | string | null
  title?: string | null
  interval_day?: number | string | null
  amount?: number | string | null
  currency?: string | null
  ipn_callback_url?: string | null
  success_url?: string | null
  cancel_url?: string | null
  partially_paid_url?: string | null
  created_at?: string | null
  updated_at?: string | null
  [k: string]: unknown
}

function intervalDays(v: number | string | null | undefined, id: string): number {
  const d = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN
  if (!Number.isInteger(d) || d < 1) {
    throw new Error(
      `NOWPayments plan ${id}: interval_day ${JSON.stringify(v)} is not a whole number of days`,
    )
  }
  return d
}

export function transformPlan(raw: RawNowpaymentsplan): Plan {
  const id = requireId(raw.id, 'plan')
  const currency = requireCurrency(raw.currency, `plan ${id}`)
  return {
    id,
    externalId: id,
    nickname: raw.title ?? undefined,
    amount: majorToMinor(requireAmount(raw.amount, `plan ${id}`), currency),
    currency,
    interval: 'day',
    intervalCount: intervalDays(raw.interval_day, id),
    gateway: 'nowpayments',
    metadata: strMap({
      title: raw.title,
      interval_day: raw.interval_day,
      ipn_callback_url: raw.ipn_callback_url,
      success_url: raw.success_url,
      cancel_url: raw.cancel_url,
      partially_paid_url: raw.partially_paid_url,
    }),
    createdAt: raw.created_at ?? undefined,
    updatedAt: raw.updated_at ?? undefined,
    raw,
  }
}
