import { toIsoDatetime } from '@opensteward/shared'
import type { Subscription, SubscriptionStatus } from '../../../schema/subscription'
import { pickCurrency, strMap, toMinorUnits } from './shared'

/**
 * Juspay Mandate object, treated as a subscription.
 *
 * Returned inside `list[]` by `GET /customers/{customer_id}/mandates`.
 *
 * Juspay mandates are recurring payment authorisations (cards, UPI, NetBanking).
 * They carry a status, max_amount, currency, frequency, start/end dates
 * and a mandate_id. We model them as subscriptions since they represent a
 * recurring billing agreement between the customer and merchant.
 *
 * Docs: https://juspay.io/in/docs/payment-page-enterprise/web/mandates/list-mandate-api
 */
export interface RawJuspayMandate {
  mandate_id?: string | null
  mandate_token?: string | null
  mandate_debit_token?: string | null
  mandate_type?: string | null
  status?: string | null
  max_amount?: number | null
  currency?: string | null
  frequency?: string | null
  start_date?: number | null
  end_date?: number | null
  activated_at?: string | null
  revokable_by_customer?: boolean | null
  block_fund?: boolean | null
  amount_rule?: string | null
  rule_type?: string | null
  rule_value?: string | null
  payment_info?: {
    payment_method_type?: string | null
    payment_method?: string | null
    card?: Record<string, unknown> | null
    bank_details?: Record<string, unknown> | null
    [k: string]: unknown
  } | null
  /** caller threads in the customer id */
  customer_id?: string | null
  [k: string]: unknown
}

function mapStatus(raw: string | null | undefined): SubscriptionStatus {
  switch ((raw ?? '').toUpperCase()) {
    case 'ACTIVE':
      return 'active'
    case 'CREATED':
      return 'incomplete'
    case 'PAUSED':
      return 'paused'
    case 'REVOKED':
    case 'CANCELLED':
      return 'cancelled'
    case 'EXPIRED':
      return 'expired'
    case 'FAILURE':
      return 'past_due'
    default:
      return 'incomplete'
  }
}

export function transformSubscription(raw: RawJuspayMandate): Subscription {
  const id = String(raw.mandate_id ?? '')
  const status = mapStatus(raw.status)

  // start_date / end_date are Unix timestamps (seconds) from Juspay.
  const periodStart =
    raw.start_date != null ? new Date(raw.start_date * 1000).toISOString() : undefined
  const periodEnd =
    raw.end_date != null ? new Date(raw.end_date * 1000).toISOString() : undefined

  const cancelledAt =
    status === 'cancelled' ? toIsoDatetime(raw.activated_at) ?? undefined : undefined

  return {
    id,
    externalId: id,
    customerId: String(raw.customer_id ?? ''),
    status,
    currency: raw.currency ? pickCurrency(raw.currency) : undefined,
    items: raw.max_amount != null
      ? [
          {
            id: `${id}_item`,
            amount: toMinorUnits(raw.max_amount),
            quantity: 1,
            metadata: {},
          },
        ]
      : [],
    currentPeriodStart: periodStart,
    currentPeriodEnd: periodEnd,
    billingAnchor: toIsoDatetime(raw.activated_at) ?? undefined,
    trialStart: undefined,
    trialEnd: undefined,
    cancelAt: undefined,
    cancelledAt,
    cancelAtPeriodEnd: undefined,
    collectionMethod: 'charge_automatically',
    dunningState: undefined,
    defaultPaymentMethodId: raw.mandate_debit_token ?? raw.mandate_token ?? undefined,
    latestInvoiceId: undefined,
    gateway: 'juspay',
    metadata: strMap({
      mandate_type: raw.mandate_type,
      frequency: raw.frequency,
      amount_rule: raw.amount_rule,
      rule_type: raw.rule_type,
      rule_value: raw.rule_value,
      block_fund: raw.block_fund != null ? String(raw.block_fund) : undefined,
      payment_method_type: raw.payment_info?.payment_method_type,
      payment_method: raw.payment_info?.payment_method,
    }),
    createdAt: toIsoDatetime(raw.activated_at),
    updatedAt: toIsoDatetime(raw.activated_at),
    raw,
  }
}
