/**
 * Rebilly subscription plan → canonical Plan (components/schemas/
 * SubscriptionPlan.yaml): `name`, `productId`, `currency`, `isActive`,
 * `pricing` (PlanPriceFormula: fixed-fee and flat-rate carry one `price`,
 * "type: number, format: double"), `recurringInterval` {`unit`: day | week |
 * month | year, `length`}, `trial` (PlanTrial: `period` {`unit`, `length`}).
 */
import type { BillingInterval, Plan } from '../../../schema/plan'
import { majorToMinor } from '@opensteward/shared'
import { requireId, currencyOf, str, strMap } from './shared'

export interface RawRebillyPlan {
  id?: string
  type?: string
  name?: string
  productId?: string
  currency?: string
  isActive?: boolean
  pricing?: { formula?: string; price?: number; [k: string]: unknown }
  recurringInterval?: { unit?: string; length?: number; [k: string]: unknown }
  trial?: { price?: number; period?: { unit?: string; length?: number } } | null
  customFields?: Record<string, unknown>
  createdTime?: string
  updatedTime?: string
  [k: string]: unknown
}

const INTERVALS = new Set<string>(['day', 'week', 'month', 'year'])
/** Pricing formulas with a single documented `price`. */
export const SINGLE_PRICE_FORMULAS = ['fixed-fee', 'flat-rate'] as const

function trialDays(trial: RawRebillyPlan['trial']): number | undefined {
  const length = trial?.period?.length
  if (typeof length !== 'number' || !Number.isInteger(length)) return undefined
  if (trial?.period?.unit === 'day') return length
  if (trial?.period?.unit === 'week') return length * 7
  return undefined
}

export function transformPlan(raw: RawRebillyPlan): Plan {
  const id = requireId(raw.id, 'plan id')
  const unit = raw.recurringInterval?.unit
  if (unit === undefined || !INTERVALS.has(unit)) {
    throw new Error(`Rebilly plan ${id} has no recurringInterval (not a subscription plan)`)
  }
  const formula = raw.pricing?.formula
  const price = raw.pricing?.price
  const currency = currencyOf(raw.currency)
  if (
    !(SINGLE_PRICE_FORMULAS as readonly string[]).includes(formula ?? '') ||
    typeof price !== 'number' ||
    currency === undefined
  ) {
    throw new Error(`Rebilly plan ${id} has no single price (formula ${formula ?? 'missing'})`)
  }
  const length = raw.recurringInterval?.length
  return {
    id,
    externalId: id,
    productId: str(raw.productId),
    nickname: str(raw.name),
    active: typeof raw.isActive === 'boolean' ? raw.isActive : undefined,
    amount: majorToMinor(price, currency),
    currency,
    interval: unit as BillingInterval,
    intervalCount:
      typeof length === 'number' && Number.isInteger(length) && length >= 1 ? length : undefined,
    trialPeriodDays: trialDays(raw.trial),
    gateway: 'rebilly',
    metadata: strMap(raw.customFields),
    createdAt: str(raw.createdTime),
    updatedAt: str(raw.updatedTime),
    raw,
  }
}
