import type { Plan, BillingInterval } from '../../../schema/plan'
import { pickCurrency, strMap, safeInt } from './shared'

/**
 * Pin Payments Plan object.
 * GET /plans → paginated list of plans.
 * GET /plans/{plan-token} → single plan.
 *
 * Confirmed fields from https://pinpayments.com/developers/api-reference/plans
 */
export interface RawPinPlan {
  [k: string]: unknown
}

function mapInterval(unit: string | undefined | null): BillingInterval {
  const v = typeof unit === 'string' ? unit.toLowerCase() : ''
  if (v === 'day') return 'day'
  if (v === 'week') return 'week'
  if (v === 'year') return 'year'
  return 'month'
}

export function transformPlan(raw: RawPinPlan): Plan {
  const trialInterval = safeInt(raw['trial_interval'])
  return {
    id: String(raw['token'] ?? ''),
    externalId: String(raw['token'] ?? ''),
    nickname: raw['name'] != null ? String(raw['name']) : undefined,
    active: true, // Pin Payments plans have no active/inactive field
    amount: safeInt(raw['amount']),
    currency: pickCurrency(raw['currency'] as string | undefined, 'AUD'),
    interval: mapInterval(raw['interval_unit'] as string | undefined),
    intervalCount: safeInt(raw['interval']) || 1,
    trialPeriodDays:
      trialInterval > 0
        ? trialInterval
        : undefined,
    gateway: 'pin-payments',
    metadata: strMap(raw['metadata'] ?? {}),
    createdAt: raw['created_at'] != null ? String(raw['created_at']) : undefined,
    updatedAt: undefined,
    raw,
  }
}
