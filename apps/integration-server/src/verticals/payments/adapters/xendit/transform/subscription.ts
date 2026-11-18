import { toIsoDatetime } from '@opensteward/shared'
import type { Subscription, SubscriptionStatus } from '../../../schema/subscription'
import { pickCurrency, strMap } from './shared'
import type { RawXenditRecurringPlan } from './plan'

/**
 * Xendit Subscription — derived from the Recurring Plan object.
 *
 * In Xendit's billing model a "Plan" is both the pricing template and the
 * active subscription: it carries the customer ID, lifecycle status, schedule
 * and payment tokens. There is no separate subscription record; the plan
 * object IS the subscription.
 *
 * This transform re-uses the same raw type as the plan transform and maps
 * plan fields to the canonical Subscription schema.
 *
 * Endpoint (derived): GET /recurring/plans/{id}
 * Docs: https://docs.xendit.co/apidocs/get-recurring-plan
 */

// ── Helpers ───────────────────────────────────────────────────────────────────

function mapStatus(raw: string | null | undefined): SubscriptionStatus {
  switch ((raw ?? '').toUpperCase()) {
    case 'ACTIVE':
      return 'active'
    case 'INACTIVE':
      return 'cancelled'
    case 'PENDING':
    case 'REQUIRES_ACTION':
      return 'incomplete'
    default:
      return 'incomplete'
  }
}

// ── Transform ─────────────────────────────────────────────────────────────────

export function transformSubscription(raw: RawXenditRecurringPlan): Subscription {
  const schedule = raw.schedule ?? {}

  return {
    id: String(raw.id ?? ''),
    externalId: String(raw.reference_id ?? raw.id ?? ''),
    customerId: String(raw.customer_id ?? ''),
    status: mapStatus(raw.status),
    currency: pickCurrency(raw.currency),
    items: [],
    billingAnchor: toIsoDatetime(schedule.anchor_date),
    cancelledAt:
      (raw.status ?? '').toUpperCase() === 'INACTIVE'
        ? toIsoDatetime(raw.updated)
        : undefined,
    gateway: 'xendit',
    metadata: strMap({
      ...(raw.metadata ?? {}),
      status: raw.status,
      failure_code: raw.failure_code,
      interval: schedule.interval,
      interval_count: schedule.interval_count,
      recurring_cycle_count: raw.recurring_cycle_count,
    }),
    createdAt: toIsoDatetime(raw.created),
    updatedAt: toIsoDatetime(raw.updated),
    raw,
  }
}
