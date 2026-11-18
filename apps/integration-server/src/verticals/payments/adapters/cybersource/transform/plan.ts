/**
 * Cybersource Plan transform.
 *
 * Cybersource Recurring Billing API exposes plans at:
 *   POST /rbs/v1/plans          — create
 *   GET  /rbs/v1/plans/{id}     — get by ID
 *   GET  /rbs/v1/plans          — list plans
 *
 * Billing period units: "d" (day), "w" (week), "m" (month), "y" (year)
 *
 * Docs: https://developer.cybersource.com/docs/cybs/en-us/recurring-billing/developer/all/rest/recurring-billing-dev/recur-bill-plans-intro/recur-bill-creating-a-plan.html
 */

import type { Plan } from '../../../schema/plan'
import type { BillingInterval } from '../../../schema/plan'
import { decimalToMinor, pickCurrency, strMap } from './shared'

export interface RawCybersourcePlan {
  id?: string
  status?: string
  planInformation?: {
    code?: string
    name?: string
    description?: string
    status?: string
    billingPeriod?: {
      unit?: string
      length?: string | number
    }
    billingCycles?: {
      total?: string | number
    }
  }
  orderInformation?: {
    amountDetails?: {
      billingAmount?: string | number
      currency?: string
      setupFee?: string | number
    }
  }
  submitTimeUtc?: string
  lastModifiedTime?: string
  [k: string]: unknown
}

function mapInterval(unit: string | undefined): BillingInterval {
  switch ((unit ?? '').toLowerCase()) {
    case 'd':
    case 'day':
      return 'day'
    case 'w':
    case 'week':
      return 'week'
    case 'y':
    case 'year':
      return 'year'
    default:
      return 'month'
  }
}

export function transformPlan(raw: RawCybersourcePlan): Plan {
  const planInfo = raw.planInformation
  const amtDetails = raw.orderInformation?.amountDetails
  const planStatus = (planInfo?.status ?? '').toUpperCase()

  return {
    id: String(raw.id ?? ''),
    externalId: String(raw.id ?? ''),
    nickname: planInfo?.name ?? undefined,
    active: planStatus === 'ACTIVE' || planStatus === '',
    amount: decimalToMinor(amtDetails?.billingAmount),
    currency: pickCurrency(amtDetails?.currency),
    interval: mapInterval(planInfo?.billingPeriod?.unit),
    intervalCount: planInfo?.billingPeriod?.length
      ? parseInt(String(planInfo.billingPeriod.length), 10)
      : 1,
    gateway: 'cybersource',
    metadata: strMap({
      planCode: planInfo?.code,
      description: planInfo?.description,
      billingCyclesTotal: planInfo?.billingCycles?.total != null
        ? String(planInfo.billingCycles.total)
        : undefined,
      setupFee: amtDetails?.setupFee != null ? String(amtDetails.setupFee) : undefined,
    }),
    createdAt: raw.submitTimeUtc ?? undefined,
    updatedAt: raw.lastModifiedTime ?? undefined,
    raw,
  }
}
