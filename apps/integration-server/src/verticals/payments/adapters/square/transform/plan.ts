import type { BillingInterval, Plan } from '../../../schema/plan'
import { pickCurrency, strMap } from './shared'

export interface RawSquareCatalogObject {
  id?: string
  type?: string
  subscription_plan_data?: {
    name?: string
    phases?: Array<{
      cadence?: string
      periods?: number
      recurring_price_money?: { amount?: number; currency?: string }
    }>
  }
  subscription_plan_variation_data?: {
    name?: string
    phases?: Array<{
      cadence?: string
      periods?: number
      pricing?: { price?: { amount?: number; currency?: string } }
    }>
  }
  is_deleted?: boolean
  [k: string]: unknown
}

function cadenceToInterval(c: string | undefined): BillingInterval {
  switch ((c ?? '').toUpperCase()) {
    case 'DAILY':
      return 'day'
    case 'WEEKLY':
      return 'week'
    case 'EVERY_TWO_WEEKS':
      return 'week'
    case 'MONTHLY':
    case 'EVERY_TWO_MONTHS':
    case 'QUARTERLY':
    case 'EVERY_FOUR_MONTHS':
    case 'EVERY_SIX_MONTHS':
      return 'month'
    case 'ANNUAL':
      return 'year'
    default:
      return 'month'
  }
}

export function transformPlan(raw: RawSquareCatalogObject): Plan {
  const phase =
    raw.subscription_plan_data?.phases?.[0] ?? raw.subscription_plan_variation_data?.phases?.[0]
  const amount =
    phase && 'recurring_price_money' in phase
      ? phase.recurring_price_money?.amount
      : (phase as { pricing?: { price?: { amount?: number } } } | undefined)?.pricing?.price?.amount
  const currency =
    phase && 'recurring_price_money' in phase
      ? phase.recurring_price_money?.currency
      : (phase as { pricing?: { price?: { currency?: string } } } | undefined)?.pricing?.price?.currency
  return {
    id: String(raw.id ?? ''),
    externalId: String(raw.id ?? ''),
    nickname:
      raw.subscription_plan_data?.name ?? raw.subscription_plan_variation_data?.name,
    active: raw.is_deleted === false,
    amount: amount ?? 0,
    currency: pickCurrency(currency),
    interval: cadenceToInterval(phase?.cadence),
    gateway: 'square',
    metadata: strMap({ type: raw.type }),
    raw,
  }
}
