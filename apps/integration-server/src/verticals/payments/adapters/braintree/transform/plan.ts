import type { BillingInterval, Plan } from '../../../schema/plan'
import { decimalToMinor, pickCurrency, strMap } from './shared'

export interface RawBraintreePlan {
  id?: string
  name?: string
  description?: string
  price?: { value?: string; currencyIsoCode?: string }
  billingFrequency?: number
  billingFrequencyUnit?: string
  trialDuration?: number
  trialDurationUnit?: string
  numberOfBillingCycles?: number
  createdAt?: string
  [k: string]: unknown
}

function unitToInterval(unit: string | undefined): BillingInterval {
  switch ((unit ?? 'MONTH').toUpperCase()) {
    case 'DAY':
      return 'day'
    case 'WEEK':
      return 'week'
    case 'YEAR':
      return 'year'
    default:
      return 'month'
  }
}

export function transformPlan(raw: RawBraintreePlan): Plan {
  return {
    id: String(raw.id ?? ''),
    externalId: String(raw.id ?? ''),
    nickname: raw.name,
    amount: decimalToMinor(raw.price?.value),
    currency: pickCurrency(raw.price?.currencyIsoCode),
    interval: unitToInterval(raw.billingFrequencyUnit),
    intervalCount: raw.billingFrequency,
    trialPeriodDays: raw.trialDurationUnit === 'DAY' ? raw.trialDuration : undefined,
    gateway: 'braintree',
    metadata: strMap({ description: raw.description }),
    createdAt: raw.createdAt,
    raw,
  }
}
