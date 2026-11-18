import type { Plan } from '../../../schema/plan'
import { toIsoDatetime } from '@opensteward/shared'
import { pickCurrency, pickStr, pickNum, strMap } from './shared'

/**
 * A Paysafe **Plan** (subscriptionsplans/v1/plans) maps onto the canonical
 * **Plan**. Plans define the billing cycle, amount, and currency for recurring
 * subscriptions.
 *
 * Docs: https://developer.paysafe.com/en/api-docs/payment-scheduler/using-the-api/api-endpoints/
 */
export interface RawPaysafeBillingCycle {
  frequency?: string
  interval?: number
  numberOfCycles?: number
  [k: string]: unknown
}

export interface RawPaysafePlan {
  id?: string
  name?: string
  description?: string
  amount?: number
  currencyCode?: string
  status?: string
  billingCycle?: RawPaysafeBillingCycle
  startDate?: string
  endDate?: string
  setupFee?: number
  version?: number
  creationTime?: string
  lastUpdatedTime?: string
  [k: string]: unknown
}

/**
 * Map Paysafe billing cycle frequency → canonical BillingInterval.
 * Paysafe frequencies: DAILY, WEEKLY, MONTHLY, YEARLY.
 */
function mapInterval(raw: RawPaysafePlan): 'day' | 'week' | 'month' | 'year' {
  switch ((raw.billingCycle?.frequency ?? '').toUpperCase()) {
    case 'DAILY':
      return 'day'
    case 'WEEKLY':
      return 'week'
    case 'YEARLY':
      return 'year'
    default:
      return 'month'
  }
}

export function transformPlan(raw: RawPaysafePlan): Plan {
  return {
    id: String(raw.id ?? ''),
    externalId: String(raw.id ?? ''),
    nickname: pickStr(raw.name),
    active: raw.status?.toUpperCase() === 'ACTIVE' ? true : raw.status?.toUpperCase() === 'INACTIVE' ? false : undefined,
    amount: raw.amount ?? 0,
    currency: pickCurrency(raw.currencyCode) ?? 'USD',
    interval: mapInterval(raw),
    intervalCount: pickNum(raw.billingCycle?.interval),
    trialPeriodDays: undefined,
    gateway: 'paysafe',
    metadata: strMap({
      name: raw.name,
      description: raw.description,
      status: raw.status,
      numberOfCycles: raw.billingCycle?.numberOfCycles,
      setupFee: raw.setupFee,
      startDate: raw.startDate,
      endDate: raw.endDate,
      version: raw.version,
    }),
    createdAt: toIsoDatetime(raw.creationTime),
    updatedAt: toIsoDatetime(raw.lastUpdatedTime ?? raw.creationTime),
    raw,
  }
}
