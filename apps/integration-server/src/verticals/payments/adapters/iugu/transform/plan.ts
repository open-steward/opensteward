/**
 * Iugu Plan -> canonical Plan.
 *
 * Iugu plans define recurring billing parameters. Each plan has an identifier,
 * name, interval (months), and a list of price variants in different currencies.
 * Reference: https://dev.iugu.com
 */
import type { Plan, BillingInterval } from '../../../schema/plan'
import { strMap, safeInt, pickCurrency } from './shared'

export interface RawIuguPlan {
  [k: string]: unknown
}

function mapInterval(intervalType: string | undefined, _interval: number): BillingInterval {
  if (!intervalType) return 'month'
  const t = intervalType.toLowerCase()
  if (t === 'months' || t === 'month') return 'month'
  if (t === 'weeks' || t === 'week') return 'week'
  if (t === 'years' || t === 'year') return 'year'
  if (t === 'days' || t === 'day') return 'day'
  // Iugu uses `interval` (number) + `interval_type` ('months')
  // intervalCount defaults to 1; Iugu uses interval as the count per type
  return 'month'
}

export function transformPlan(raw: RawIuguPlan): Plan {
  const prices = Array.isArray(raw['prices']) ? (raw['prices'] as Array<Record<string, unknown>>) : []
  // Pick the first price for amount/currency; prefer BRL
  const primaryPrice =
    prices.find((p) => String(p['currency'] ?? '').toUpperCase() === 'BRL') ?? prices[0]
  const amountCents = primaryPrice != null ? safeInt(primaryPrice['value_cents']) : 0
  const currency = pickCurrency(primaryPrice?.['currency'] as string | undefined, 'BRL')

  const intervalType = raw['interval_type'] != null ? String(raw['interval_type']) : undefined
  const interval = safeInt(raw['interval'])

  return {
    id: String(raw['identifier'] ?? raw['id'] ?? ''),
    externalId: String(raw['identifier'] ?? raw['id'] ?? ''),
    nickname: raw['name'] != null ? String(raw['name']) : undefined,
    active: true,
    amount: amountCents,
    currency,
    interval: mapInterval(intervalType, interval),
    intervalCount: interval || 1,
    trialPeriodDays: raw['trial_period_days'] != null ? safeInt(raw['trial_period_days']) : undefined,
    gateway: 'iugu',
    metadata: strMap(raw['metadata'] ?? {}),
    createdAt: raw['created_at'] != null ? String(raw['created_at']) : undefined,
    raw,
  }
}
