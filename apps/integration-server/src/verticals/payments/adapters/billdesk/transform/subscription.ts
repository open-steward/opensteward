import type { Subscription, SubscriptionStatus } from '../../../schema/subscription'
import { pickCurrency, strMap, toIsoDatetime, toMinorUnits } from './shared'

/**
 * A BillDesk Mandate is a recurring payment authorisation that maps onto the
 * canonical Subscription. Confirmed request/response fields from BillDesk docs
 * (https://docs.billdesk.io/reference/createmandate,
 *  https://docs.billdesk.io/reference/retrievemandate):
 *
 *   mandateid            — BillDesk-assigned unique mandate id
 *   mercid               — merchant id
 *   subscription_refid   — merchant's own subscription reference
 *   mandate_amount       — recurring debit amount (major units, e.g. "299.00")
 *   amount_type          — "FIXED" | "VARIABLE" | "MAXIMUM"
 *   frequency            — "MONTHLY" | "QUARTERLY" | "YEARLY" | "AS_PRESENTED" | …
 *   mandate_start_date   — YYYYMMDD
 *   mandate_end_date     — YYYYMMDD
 *   status               — "CREATED" | "ACTIVE" | "PAUSED" | "CANCELLED" | "EXPIRED"
 *   currency             — ISO 4217 numeric code (e.g. "356")
 *   customer_name        — cardholder / account holder name
 *   payment_method_type  — "CARD" | "UPI" | "NACH"
 *   createdon            — ISO-8601 timestamp
 *   updatedon            — ISO-8601 timestamp
 *
 * Endpoint: POST /pgsi/ve1_2/mandates/get  (retrieve by mandateid)
 *           POST /pgsi/ve1_2/mandates/create
 *           POST /pgsi/ve1_2/mandates/list  (list by mercid)
 */
export interface RawBilldeskMandate {
  mandateid?: string
  objectid?: string
  mercid?: string
  subscription_refid?: string
  mandate_amount?: string
  amount_type?: string
  frequency?: string
  mandate_start_date?: string
  mandate_end_date?: string
  status?: string
  currency?: string
  customer_name?: string
  payment_method_type?: string
  createdon?: string
  updatedon?: string
  [k: string]: unknown
}

/**
 * Map BillDesk mandate `status` → canonical SubscriptionStatus.
 * BillDesk statuses are undocumented in public docs; these are derived from
 * mandate lifecycle knowledge (CREATED → pending activation, ACTIVE → live,
 * PAUSED → paused, CANCELLED → cancelled, EXPIRED → expired).
 */
function mapStatus(raw: string | undefined): SubscriptionStatus {
  switch ((raw ?? '').toUpperCase()) {
    case 'ACTIVE':
      return 'active'
    case 'PAUSED':
      return 'paused'
    case 'CANCELLED':
      return 'cancelled'
    case 'EXPIRED':
      return 'expired'
    case 'CREATED':
    default:
      return 'incomplete'
  }
}

export function transformSubscription(raw: RawBilldeskMandate): Subscription {
  const id = String(raw.mandateid ?? raw.objectid ?? '')
  const createdAt = toIsoDatetime(raw.createdon)
  const updatedAt = toIsoDatetime(raw.updatedon ?? raw.createdon)
  const amount = toMinorUnits(raw.mandate_amount)
  const currency = pickCurrency(raw.currency)
  const status = mapStatus(raw.status)

  return {
    id,
    externalId: id,
    // BillDesk has no customer resource; use mandate id as a stand-in customer ref.
    customerId: String(raw.mercid ?? ''),
    status,
    currency,
    items: [
      {
        id,
        amount,
        metadata: strMap({ amount_type: raw.amount_type }),
      },
    ],
    currentPeriodStart: toIsoDatetime(raw.mandate_start_date),
    currentPeriodEnd: toIsoDatetime(raw.mandate_end_date),
    cancelledAt: status === 'cancelled' ? updatedAt : undefined,
    gateway: 'billdesk',
    metadata: strMap({
      mercid: raw.mercid,
      subscription_refid: raw.subscription_refid,
      frequency: raw.frequency,
      amount_type: raw.amount_type,
      payment_method_type: raw.payment_method_type,
      customer_name: raw.customer_name,
    }),
    createdAt,
    updatedAt,
    raw,
  }
}
