import type { BillingInterval, Plan } from '../../../schema/plan'
import { decimalToMinor, pickCurrency, strMap } from './shared'

export interface RawPayPalBillingCycle {
  pricing_scheme?: { fixed_price?: { value?: string; currency_code?: string } }
  frequency?: { interval_unit?: string; interval_count?: number }
}

export interface RawPayPalPlan {
  id?: string
  product_id?: string
  name?: string
  status?: string
  billing_cycles?: RawPayPalBillingCycle[]
  create_time?: string
  update_time?: string
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

export function transformPlan(raw: RawPayPalPlan): Plan {
  const cycle = raw.billing_cycles?.[0]
  const price = cycle?.pricing_scheme?.fixed_price
  return {
    id: String(raw.id ?? ''),
    externalId: String(raw.id ?? ''),
    productId: raw.product_id,
    nickname: raw.name,
    active: raw.status === 'ACTIVE',
    amount: decimalToMinor(price?.value),
    currency: pickCurrency(price?.currency_code),
    interval: unitToInterval(cycle?.frequency?.interval_unit),
    intervalCount: cycle?.frequency?.interval_count,
    gateway: 'paypal',
    metadata: strMap({}),
    createdAt: raw.create_time,
    updatedAt: raw.update_time,
    raw,
  }
}
