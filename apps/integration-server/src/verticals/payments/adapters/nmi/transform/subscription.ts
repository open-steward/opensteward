import type { Subscription, SubscriptionStatus } from '../../../schema/subscription'
import { decimalToMinor, parseNmiDatetime, pickCurrency, strMap, xmlTag } from './shared'

/**
 * A normalised NMI recurring subscription record, decoded from a Query API
 * `report_type=recurring` `<subscription>` block.
 *
 * Field names confirmed from the NMI Query API XML response, cross-referenced
 * with the ZNMI TypeScript wrapper (ZachHandley/ZNMI) which reverse-engineers
 * the actual XML payloads.
 *
 * NMI subscription statuses: active | inactive | stopped.
 * `plan.*` is a nested element carrying the billing schedule.
 */
export interface RawNmiSubscription {
  subscriptionId?: string
  /** Billing status: active | inactive | stopped. */
  status?: string
  planId?: string
  planName?: string
  /** Plan amount in major units ("12.50"). */
  planAmount?: string
  /** Frequency in days (alt to month_frequency). */
  dayFrequency?: string
  /** Frequency in months. */
  monthFrequency?: string
  /** Day of month for monthly plans. */
  dayOfMonth?: string
  /** Total number of payments defined in the plan. */
  planPayments?: string
  completedPayments?: string
  remainingPayments?: string
  /** ISO date string "YYYY-MM-DD" or NMI compact format. */
  nextChargeDate?: string
  /** Customer Vault ID if the subscription is backed by a vault record. */
  customerVaultId?: string
  currency?: string
  orderId?: string
  orderDescription?: string
  firstName?: string
  lastName?: string
  email?: string
  raw?: unknown
}

function mapSubscriptionStatus(raw: RawNmiSubscription): SubscriptionStatus {
  const s = (raw.status ?? '').toLowerCase()
  if (s === 'active') return 'active'
  if (s === 'stopped' || s === 'inactive') return 'cancelled'
  return 'active'
}

/**
 * Derive a canonical BillingInterval from the plan frequency fields.
 * NMI uses `day_frequency` (any day count) or `month_frequency`+`day_of_month`.
 * We map to the closest canonical interval; when ambiguous we use 'month'.
 */
function deriveInterval(raw: RawNmiSubscription): 'day' | 'week' | 'month' | 'year' | undefined {
  if (raw.dayFrequency) {
    const d = parseInt(raw.dayFrequency, 10)
    if (!Number.isFinite(d)) return undefined
    if (d === 1) return 'day'
    if (d === 7) return 'week'
    if (d >= 28 && d <= 31) return 'month'
    if (d >= 364 && d <= 366) return 'year'
    return 'day'
  }
  if (raw.monthFrequency) {
    const m = parseInt(raw.monthFrequency, 10)
    if (!Number.isFinite(m)) return undefined
    if (m === 12) return 'year'
    return 'month'
  }
  return undefined
}

export function transformSubscription(raw: RawNmiSubscription): Subscription {
  const amount = decimalToMinor(raw.planAmount)
  const interval = deriveInterval(raw)

  return {
    id: String(raw.subscriptionId ?? ''),
    externalId: String(raw.subscriptionId ?? ''),
    customerId: raw.customerVaultId ?? '',
    status: mapSubscriptionStatus(raw),
    currency: pickCurrency(raw.currency),
    items: amount > 0
      ? [
          {
            id: String(raw.subscriptionId ?? ''),
            amount,
          },
        ]
      : [],
    currentPeriodEnd: parseNmiDatetime(raw.nextChargeDate)
      ?? (raw.nextChargeDate ? new Date(raw.nextChargeDate).toISOString() : undefined),
    gateway: 'nmi',
    metadata: strMap({
      plan_id: raw.planId,
      plan_name: raw.planName,
      plan_payments: raw.planPayments,
      completed_payments: raw.completedPayments,
      remaining_payments: raw.remainingPayments,
      interval,
      day_frequency: raw.dayFrequency,
      month_frequency: raw.monthFrequency,
      day_of_month: raw.dayOfMonth,
      order_id: raw.orderId,
      order_description: raw.orderDescription,
    }),
    raw: raw.raw ?? raw,
  }
}

/** Decode one Query API `<subscription>` XML block into `RawNmiSubscription`. */
export function subscriptionFromXml(block: string): RawNmiSubscription {
  return {
    subscriptionId: xmlTag(block, 'subscription_id') ?? xmlTag(block, 'id'),
    status: xmlTag(block, 'status'),
    // Plan info lives in a nested <plan> child element in the subscription block.
    planId: xmlTag(block, 'plan_id'),
    planName: xmlTag(block, 'plan_name'),
    planAmount: xmlTag(block, 'plan_amount'),
    dayFrequency: xmlTag(block, 'day_frequency'),
    monthFrequency: xmlTag(block, 'month_frequency'),
    dayOfMonth: xmlTag(block, 'day_of_month'),
    planPayments: xmlTag(block, 'plan_payments'),
    completedPayments: xmlTag(block, 'completed_payments'),
    remainingPayments: xmlTag(block, 'remaining_payments'),
    nextChargeDate: xmlTag(block, 'next_charge_date'),
    customerVaultId: xmlTag(block, 'customer_vault_id') ?? xmlTag(block, 'customerid'),
    currency: xmlTag(block, 'currency'),
    orderId: xmlTag(block, 'orderid') ?? xmlTag(block, 'order_id'),
    orderDescription: xmlTag(block, 'order_description'),
    firstName: xmlTag(block, 'first_name'),
    lastName: xmlTag(block, 'last_name'),
    email: xmlTag(block, 'email'),
    raw: block,
  }
}
