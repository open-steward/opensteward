import type { Plan } from '../../../schema/plan'
import { pickCurrency, strMap, toMinorUnits } from './shared'
import type { BillingInterval } from '../../../schema/plan'

/**
 * BlueSnap subscription billing plan. Lives under `/services/2/recurring/plans`.
 * List response envelope: `{ plans: RawBluesnapPlan[], totalResults, lastPage }`.
 * Amounts are decimal major units. chargeFrequency maps to canonical interval.
 *
 * Docs: https://developers.bluesnap.com/v8976-JSON/reference/retrieve-specific-plan
 */
export interface RawBluesnapPlan {
  planId?: string | number
  name?: string
  chargeFrequency?: string
  gracePeriodDays?: number
  trialPeriodDays?: number
  initialChargeAmount?: number | string
  currency?: string
  maxNumberOfCharges?: number
  recurringChargeAmount?: number | string
  chargeOnPlanSwitch?: boolean
  status?: string
  [k: string]: unknown
}

export interface RawBluesnapPlanList {
  plans?: RawBluesnapPlan[]
  totalResults?: number
  lastPage?: boolean
}

function mapInterval(freq: string | undefined): BillingInterval {
  switch ((freq ?? '').toUpperCase()) {
    case 'WEEKLY':
      return 'week'
    case 'MONTHLY':
      return 'month'
    case 'ANNUALLY':
    case 'YEARLY':
      return 'year'
    default:
      return 'month'
  }
}

export function transformPlan(raw: RawBluesnapPlan): Plan {
  const id = String(raw.planId ?? '')
  return {
    id,
    externalId: id,
    nickname: raw.name,
    active: (raw.status ?? '').toUpperCase() === 'ACTIVE' || raw.status == null,
    amount: toMinorUnits(raw.recurringChargeAmount),
    currency: pickCurrency(raw.currency),
    interval: mapInterval(raw.chargeFrequency),
    trialPeriodDays: raw.trialPeriodDays ?? 0,
    gateway: 'bluesnap',
    metadata: strMap({
      gracePeriodDays: raw.gracePeriodDays,
      maxNumberOfCharges: raw.maxNumberOfCharges,
      initialChargeAmount: raw.initialChargeAmount,
      chargeOnPlanSwitch: raw.chargeOnPlanSwitch,
    }),
    raw,
  }
}
