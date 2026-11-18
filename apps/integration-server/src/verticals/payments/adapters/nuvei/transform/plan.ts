/**
 * Nuvei getPlansList.do plan → canonical Plan.
 *
 * Source: https://docs.nuvei.com/api/advanced/indexAdvanced.html#getplanslist
 * The documented example response is
 *   { "total": 1, "plans": [ { "recurringAmount": "4.24",
 *     "startAfter": { "month": "2", "year": "1", "day": "3" },
 *     "recurringPeriod": { "month": "0", "year": "0", "day": "1" },
 *     "merchantId": "…", "initialAmount": "15.67", "name": "8SQ1TOWCQ285KON",
 *     "description": "Plan 1", "planStatus": "ACTIVE", "planId": 101,
 *     "currency": "EUR", "endAfter": { … } } ], "status": "SUCCESS" }
 *
 * Only those documented fields are read. `recurringPeriod` is a day/month/year
 * triple: "Day (String) = 1 (daily), 7 (weekly) Month (String) = 1 (monthly)
 * Year (String) = 1 (yearly)". The canonical Plan carries one interval, so a
 * period set on exactly one unit maps to that unit; a mixed period (the docs'
 * "Day = 15 Month = 9") or an all-zero one has no canonical interval and
 * throws, as does a plan missing its required id, amount or currency.
 */
import { majorToMinor } from '@opensteward/shared'
import type { BillingInterval, Plan } from '../../../schema/plan'
import { pickStr, strMap } from './shared'

export interface RawNuveiPeriod {
  day?: string | number
  month?: string | number
  year?: string | number
}

export interface RawNuveiPlan {
  planId?: string | number
  name?: string
  description?: string
  currency?: string
  recurringAmount?: string | number
  initialAmount?: string | number
  recurringPeriod?: RawNuveiPeriod
  startAfter?: RawNuveiPeriod
  endAfter?: RawNuveiPeriod
  planStatus?: string
  merchantId?: string
  [k: string]: unknown
}

export interface RawNuveiGetPlansListResponse {
  total?: number | string
  plans?: RawNuveiPlan[]
  status?: string
  errCode?: number
  reason?: string
  [k: string]: unknown
}

function periodCount(v: string | number | undefined): number {
  if (v === undefined || v === null || v === '') return 0
  const n = Number(v)
  return Number.isInteger(n) && n > 0 ? n : 0
}

function mapInterval(
  planId: string,
  period: RawNuveiPeriod | undefined,
): { interval: BillingInterval; intervalCount: number } {
  const day = periodCount(period?.day)
  const month = periodCount(period?.month)
  const year = periodCount(period?.year)
  const set = [day, month, year].filter((n) => n > 0).length
  if (set !== 1) {
    throw new Error(
      `Nuvei plan ${planId}: recurringPeriod ${JSON.stringify(period ?? null)} is not a single day, month or year count, so it has no canonical interval.`,
    )
  }
  if (year) return { interval: 'year', intervalCount: year }
  if (month) return { interval: 'month', intervalCount: month }
  // "Day (String) = 1 (daily), 7 (weekly)".
  if (day === 7) return { interval: 'week', intervalCount: 1 }
  return { interval: 'day', intervalCount: day }
}

export function transformPlan(raw: RawNuveiPlan): Plan {
  const id = pickStr(raw.planId)
  if (!id) throw new Error('Nuvei plan has no planId.')
  const currency = pickStr(raw.currency)
  if (!currency) throw new Error(`Nuvei plan ${id} has no currency.`)
  // recurringAmount is a major-unit decimal string ("4.24"): scale it by the
  // currency's own minor-unit exponent, not a fixed x100.
  const major =
    raw.recurringAmount === undefined || raw.recurringAmount === ''
      ? undefined
      : Number(raw.recurringAmount)
  const amount = majorToMinor(major, currency)
  if (amount === undefined) throw new Error(`Nuvei plan ${id} has no recurringAmount.`)
  const { interval, intervalCount } = mapInterval(id, raw.recurringPeriod)
  const status = pickStr(raw.planStatus)?.toUpperCase()

  return {
    id,
    externalId: id,
    nickname: pickStr(raw.name),
    active: status === 'ACTIVE' ? true : status === 'INACTIVE' ? false : undefined,
    amount,
    currency: currency.toUpperCase(),
    interval,
    intervalCount,
    gateway: 'nuvei',
    metadata: strMap({
      description: raw.description,
      initialAmount: raw.initialAmount,
    }),
    raw,
  }
}
