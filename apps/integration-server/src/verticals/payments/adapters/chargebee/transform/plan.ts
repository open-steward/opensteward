/**
 * Chargebee Plan → canonical Plan.
 *
 * Chargebee exposes a "plans" resource (legacy API) that describes recurring
 * billing intervals and amounts. Modern Chargebee also uses item prices, but
 * the Plan resource remains the primary unit for subscription-level billing
 * config accessible via the REST API.
 *
 * Field mapping:
 *   id              → id / externalId
 *   name            → nickname
 *   status          → active (ACTIVE → true, ARCHIVED → false)
 *   price           → amount (minor units — Chargebee stores in minor units)
 *   currency_code   → currency
 *   period          → intervalCount
 *   period_unit     → interval (week/month/year/day)
 *   trial_period    → trialPeriodDays (converted from trial_period_unit)
 *   cf_*            → metadata
 *   created_at      → createdAt
 *   updated_at      → updatedAt
 *
 * Docs: https://apidocs.chargebee.com/docs/api/plans
 */

import type { BillingInterval, Plan } from '../../../schema/plan'
import { pickCurrency, strMap, toIso } from './shared'

// ── Raw shapes ────────────────────────────────────────────────────────────────

export interface RawChargebeePlan {
  id?: string
  name?: string | null
  invoice_name?: string | null
  status?: string | null
  price?: number | null
  currency_code?: string | null
  period?: number | null
  period_unit?: string | null
  trial_period?: number | null
  trial_period_unit?: string | null
  meta_data?: Record<string, unknown> | null
  created_at?: number
  updated_at?: number
  [k: string]: unknown
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const INTERVAL_MAP: Record<string, BillingInterval> = {
  day: 'day',
  week: 'week',
  month: 'month',
  year: 'year',
}

function resolveInterval(unit: string | null | undefined): BillingInterval {
  return INTERVAL_MAP[(unit ?? '').toLowerCase()] ?? 'month'
}

function resolveTrialDays(raw: RawChargebeePlan): number | undefined {
  if (!raw.trial_period) return undefined
  const unit = (raw.trial_period_unit ?? 'day').toLowerCase()
  if (unit === 'day') return raw.trial_period
  if (unit === 'week') return raw.trial_period * 7
  if (unit === 'month') return raw.trial_period * 30
  if (unit === 'year') return raw.trial_period * 365
  return raw.trial_period
}

// ── Transform ─────────────────────────────────────────────────────────────────

export function transformPlan(raw: RawChargebeePlan): Plan {
  return {
    id: String(raw.id ?? ''),
    externalId: String(raw.id ?? ''),
    nickname: raw.name ?? raw.invoice_name ?? undefined,
    active: raw.status ? raw.status.toLowerCase() === 'active' : undefined,
    amount: raw.price ?? 0,
    currency: pickCurrency(raw.currency_code),
    interval: resolveInterval(raw.period_unit),
    intervalCount: raw.period ?? undefined,
    trialPeriodDays: resolveTrialDays(raw),
    gateway: 'chargebee',
    metadata: strMap(raw.meta_data),
    createdAt: toIso(raw.created_at),
    updatedAt: toIso(raw.updated_at),
    raw,
  }
}
