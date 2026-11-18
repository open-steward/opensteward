/**
 * Rebill plan → canonical Plan.
 *
 * The plan object (https://docs.rebill.com/api/reference/plans):
 * - `id`: "Prefixed with `pln_`."
 * - `name`: "Localized display names. Array of `{ language, text }`"
 * - `status`: "One of `active`, `draft`, or `archived`."
 * - `frequency`: "`{ period, count }`. `period` is `month` or `year`; `count`
 *   multiplies it."
 * - `trialPeriodDays`: "Free trial length in days. ... Omitted when not set."
 * - `prices`: "Each entry: `{ amount, currency, isDefault, setupFee?,
 *   createdAt, updatedAt }`. Exactly one price is flagged `isDefault: true`."
 *   Amounts are "decimals in the currency's major unit".
 * - `metadata`, `createdAt`, `updatedAt`.
 */
import { majorToMinor } from '@opensteward/shared'
import type { Plan, BillingInterval } from '../../../schema/plan'
import { strMap } from './shared'

export interface RawRebillPlanPrice {
  amount: number
  currency: string
  isDefault?: boolean
  [k: string]: unknown
}

export interface RawRebillPlan {
  id: string
  name?: { language: string; text: string }[] | null
  status?: string | null
  frequency?: { period?: string | null; count?: number | null } | null
  trialPeriodDays?: number | null
  prices?: RawRebillPlanPrice[] | null
  metadata?: Record<string, unknown> | null
  createdAt?: string | null
  updatedAt?: string | null
  [k: string]: unknown
}

const PERIOD: Record<string, BillingInterval> = { month: 'month', year: 'year' }

export function transformPlan(raw: RawRebillPlan): Plan {
  if (typeof raw.id !== 'string' || raw.id === '') {
    throw new Error('Rebill plan has no id')
  }
  const price = (raw.prices ?? []).find((p) => p.isDefault === true)
  if (!price || typeof price.currency !== 'string' || typeof price.amount !== 'number') {
    throw new Error(`Rebill plan ${raw.id} has no default price`)
  }
  const period = raw.frequency?.period
  const interval = period ? PERIOD[period] : undefined
  if (!interval) {
    throw new Error(`Rebill plan ${raw.id} has an undocumented frequency period: ${String(period)}`)
  }
  const names = raw.name ?? []
  const nickname = (names.find((n) => n.language === 'en') ?? names[0])?.text
  const count = raw.frequency?.count
  return {
    id: raw.id,
    externalId: raw.id,
    nickname: nickname || undefined,
    active: raw.status ? raw.status === 'active' : undefined,
    amount: majorToMinor(price.amount, price.currency),
    currency: price.currency,
    interval,
    intervalCount: typeof count === 'number' && count >= 1 ? count : undefined,
    trialPeriodDays: raw.trialPeriodDays ?? undefined,
    gateway: 'rebill',
    metadata: strMap(raw.metadata),
    createdAt: raw.createdAt ?? undefined,
    updatedAt: raw.updatedAt ?? undefined,
    raw,
  }
}
