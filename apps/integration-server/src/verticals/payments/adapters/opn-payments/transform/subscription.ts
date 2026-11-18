/**
 * Opn Payments (Omise) Subscription transform.
 *
 * Opn Payments exposes subscriptions via GET /customers/{id}/schedules
 * (charge schedules). Each schedule maps to a canonical Subscription.
 *
 * Docs: https://docs.opn.ooo/charge-schedules-api
 */

import type { Subscription, SubscriptionStatus } from '../../../schema/subscription'
import { pickCurrency, strMap, safeInt } from './shared'

export interface RawOpnSubscription {
  [k: string]: unknown
}

function mapStatus(s: string | undefined): SubscriptionStatus {
  const v = (s ?? '').toLowerCase()
  if (v === 'active' || v === 'running') return 'active'
  if (v === 'expiring' || v === 'paused') return 'paused'
  if (v === 'expired' || v === 'ended') return 'expired'
  if (v === 'cancelled' || v === 'canceled' || v === 'deleted') return 'cancelled'
  if (v === 'suspended' || v === 'overdue') return 'past_due'
  return 'active'
}

export function transformSubscription(raw: RawOpnSubscription): Subscription {
  const id = String(raw['id'] ?? '')
  const customerId = String(raw['customer'] ?? '')
  const charge = raw['charge'] as Record<string, unknown> | undefined
  const amount = safeInt(charge?.['amount'] ?? raw['amount'])
  const currency = pickCurrency((charge?.['currency'] ?? raw['currency']) as string | undefined, 'THB')
  const planId = raw['plan'] != null ? String(raw['plan']) : undefined
  const createdAt = raw['created'] != null ? String(raw['created']) : undefined

  return {
    id,
    externalId: id,
    customerId,
    status: mapStatus(raw['status'] as string | undefined),
    currency,
    items: planId
      ? [{ id: planId, priceId: planId, amount }]
      : [{ id, amount }],
    currentPeriodStart: raw['next_occurrence_dates'] != null
      ? String((raw['next_occurrence_dates'] as unknown[])[0] ?? '')
      : undefined,
    cancelledAt: raw['ended_at'] != null ? String(raw['ended_at']) : undefined,
    gateway: 'opn-payments',
    metadata: strMap({
      period: raw['period'],
      period_unit: raw['period_unit'],
      in_words: raw['in_words'],
    }),
    createdAt,
    raw,
  }
}
