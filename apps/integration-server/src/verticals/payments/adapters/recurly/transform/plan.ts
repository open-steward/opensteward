/**
 * Recurly Plan transform.
 *
 * Recurly exposes billing plans via GET /plans. A Recurly Plan is a
 * recurring billing configuration specifying amount, currency, and
 * interval. It maps to the canonical Plan schema.
 *
 * Docs: https://developers.recurly.com/api/v2021-02-25#tag/Plans
 */

import type { BillingInterval, Plan } from '../../../schema/plan'
import { decimalToMinor, pickCurrency, strMap } from './shared'

export interface RawRecurlyPlan {
  id?: string
  code?: string
  name?: string
  description?: string
  state?: string
  currencies?: Array<{
    currency?: string
    unit_amount?: number
    setup_fee?: number
    trial_unit?: string
    trial_length?: number
  }>
  interval_unit?: string
  interval_length?: number
  trial_unit?: string
  trial_length?: number
  created_at?: string
  updated_at?: string
  deleted_at?: string
  [k: string]: unknown
}

function mapInterval(unit: string | undefined): BillingInterval {
  switch ((unit ?? '').toLowerCase()) {
    case 'days': return 'day'
    case 'months': return 'month'
    case 'weeks': return 'week'
    case 'years': return 'year'
    default: return 'month'
  }
}

export function transformPlan(raw: RawRecurlyPlan): Plan {
  const currency = pickCurrency(raw.currencies?.[0]?.currency)
  const unitAmount = raw.currencies?.[0]?.unit_amount
  const trialUnit = raw.trial_unit
  const trialLength = raw.trial_length ?? 0

  // Convert trial length to days
  let trialPeriodDays: number | undefined
  if (trialLength && trialUnit) {
    const unit = trialUnit.toLowerCase()
    if (unit === 'days') trialPeriodDays = trialLength
    else if (unit === 'weeks') trialPeriodDays = trialLength * 7
    else if (unit === 'months') trialPeriodDays = trialLength * 30
  }

  return {
    id: raw.id ?? raw.code ?? '',
    externalId: raw.id ?? raw.code ?? '',
    nickname: raw.name ?? undefined,
    active: (raw.state ?? 'active') === 'active' && !raw.deleted_at,
    amount: decimalToMinor(unitAmount),
    currency,
    interval: mapInterval(raw.interval_unit),
    intervalCount: raw.interval_length ?? undefined,
    trialPeriodDays,
    gateway: 'recurly',
    metadata: strMap({ code: raw.code, description: raw.description }),
    createdAt: raw.created_at ?? undefined,
    updatedAt: raw.updated_at ?? undefined,
    raw,
  }
}
