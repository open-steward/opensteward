import { toIsoDatetime } from '@opensteward/shared'
import type { Plan, BillingInterval } from '../../../schema/plan'
import { pickCurrency, strMap, toMinorAmount } from './shared'

/**
 * Xendit Recurring Plan object (Subscriptions API).
 *
 * Xendit represents subscription billing via "Recurring Plans". A plan ties
 * a customer, amount, currency and schedule together. The GET endpoint returns
 * a single plan by ID; there is no confirmed list-all endpoint in the public
 * API — the adapter exposes `getPlan` only.
 *
 * Endpoint: GET /recurring/plans/{id}
 * Docs: https://docs.xendit.co/apidocs/get-recurring-plan
 */
export interface RawXenditRecurringPlan {
  id?: string
  reference_id?: string | null
  customer_id?: string | null
  currency?: string | null
  amount?: number | null
  status?: 'ACTIVE' | 'INACTIVE' | 'PENDING' | 'REQUIRES_ACTION' | string | null
  description?: string | null
  schedule?: {
    interval?: 'DAY' | 'WEEK' | 'MONTH' | 'YEAR' | string | null
    interval_count?: number | null
    total_recurrence?: number | null
    anchor_date?: string | null
    retry_interval?: string | null
    retry_interval_count?: number | null
    total_retry?: number | null
    failed_attempt_notifications?: number[] | null
  } | null
  failure_code?: string | null
  recurring_cycle_count?: number | null
  metadata?: Record<string, unknown> | null
  created?: string | null
  updated?: string | null
  [k: string]: unknown
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function mapInterval(raw: string | null | undefined): BillingInterval {
  switch ((raw ?? '').toUpperCase()) {
    case 'DAY':
      return 'day'
    case 'WEEK':
      return 'week'
    case 'YEAR':
      return 'year'
    case 'MONTH':
    default:
      return 'month'
  }
}

// ── Transform ─────────────────────────────────────────────────────────────────

export function transformPlan(raw: RawXenditRecurringPlan): Plan {
  const schedule = raw.schedule ?? {}
  const active =
    (raw.status ?? '').toUpperCase() === 'ACTIVE'

  return {
    id: String(raw.id ?? ''),
    externalId: String(raw.reference_id ?? raw.id ?? ''),
    nickname: raw.description ?? undefined,
    active,
    amount: toMinorAmount(raw.amount),
    currency: pickCurrency(raw.currency),
    interval: mapInterval(schedule.interval),
    intervalCount: typeof schedule.interval_count === 'number' ? schedule.interval_count : undefined,
    gateway: 'xendit',
    metadata: strMap({
      ...(raw.metadata ?? {}),
      status: raw.status,
      customer_id: raw.customer_id,
      failure_code: raw.failure_code,
      recurring_cycle_count: raw.recurring_cycle_count,
    }),
    createdAt: toIsoDatetime(raw.created),
    updatedAt: toIsoDatetime(raw.updated),
    raw,
  }
}
