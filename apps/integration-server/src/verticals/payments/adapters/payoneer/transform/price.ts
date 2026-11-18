import type { Price } from '../../../schema/plan'
import { toIso, strMap } from './shared'

export interface RawStripePrice {
  id: string
  object: 'price'
  product: string
  nickname?: string | null
  active?: boolean
  unit_amount?: number | null
  currency: string
  type: 'recurring' | 'one_time'
  recurring?: {
    interval: 'day' | 'week' | 'month' | 'year'
    interval_count?: number
    trial_period_days?: number | null
  } | null
  metadata?: Record<string, string> | null
  created?: number
  [key: string]: unknown
}

export function transformPrice(raw: RawStripePrice): Price {
  return {
    id: raw.id,
    externalId: raw.id,
    productId: raw.product,
    nickname: raw.nickname ?? undefined,
    active: raw.active,
    unitAmount: raw.unit_amount ?? 0,
    currency: raw.currency.toUpperCase(),
    type: raw.type,
    interval: raw.recurring?.interval,
    intervalCount: raw.recurring?.interval_count,
    trialPeriodDays: raw.recurring?.trial_period_days ?? undefined,
    gateway: 'stripe',
    metadata: strMap(raw.metadata),
    createdAt: toIso(raw.created),
    raw,
  }
}
