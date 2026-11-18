import type { BillingInterval, Plan } from '../../../schema/plan'
import { toIso, strMap } from './shared'

export interface RawStripePlan {
  id: string
  object: 'plan'
  product?: string | null
  nickname?: string | null
  active?: boolean
  amount?: number
  currency: string
  interval: BillingInterval
  interval_count?: number
  trial_period_days?: number | null
  metadata?: Record<string, string> | null
  created?: number
  [key: string]: unknown
}

export function transformPlan(raw: RawStripePlan): Plan {
  return {
    id: raw.id,
    externalId: raw.id,
    productId: raw.product ?? undefined,
    nickname: raw.nickname ?? undefined,
    active: raw.active,
    amount: raw.amount ?? 0,
    currency: raw.currency.toUpperCase(),
    interval: raw.interval,
    intervalCount: raw.interval_count,
    trialPeriodDays: raw.trial_period_days ?? undefined,
    gateway: 'stripe',
    metadata: strMap(raw.metadata),
    createdAt: toIso(raw.created),
    raw,
  }
}
