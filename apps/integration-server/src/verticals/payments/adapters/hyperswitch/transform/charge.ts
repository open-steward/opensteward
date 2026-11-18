/**
 * Hyperswitch Payment (PaymentsResponse) → canonical Charge.
 *
 * Hyperswitch models a "charge" as a Payment intent. Amounts are integer minor
 * units. The `status` field is an `IntentStatus` enum; `customer` is a nested
 * `CustomerDetailsResponse`. `customer_id` is deprecated upstream but still
 * emitted, so we fall back to it.
 *
 * Docs: https://api-reference.hyperswitch.io/api-reference/payments/payments--retrieve
 */
import { toIsoDatetime } from '@opensteward/shared'
import type { Charge, ChargeStatus } from '../../../schema/charge'
import { pickCurrency, strMap } from './shared'

export interface RawHyperswitchCustomerDetails {
  id?: string
  name?: string | null
  email?: string | null
  phone?: string | null
  phone_country_code?: string | null
  [k: string]: unknown
}

export interface RawHyperswitchPayment {
  payment_id?: string
  merchant_id?: string
  status?: string
  amount?: number
  net_amount?: number
  amount_capturable?: number
  amount_received?: number
  currency?: string
  customer_id?: string | null
  customer?: RawHyperswitchCustomerDetails | null
  payment_method?: string | null
  payment_method_id?: string | null
  description?: string | null
  statement_descriptor_name?: string | null
  error_code?: string | null
  error_message?: string | null
  capture_method?: string | null
  connector?: string | null
  profile_id?: string | null
  email?: string | null
  created?: string | null
  metadata?: Record<string, unknown> | null
  [k: string]: unknown
}

/**
 * Map the Hyperswitch `IntentStatus` enum onto canonical `ChargeStatus`.
 * In-flight / action-required states collapse to `pending`.
 */
function mapStatus(raw: RawHyperswitchPayment): ChargeStatus {
  switch ((raw.status ?? '').toLowerCase()) {
    case 'succeeded':
    case 'partially_captured':
      return 'succeeded'
    case 'failed':
      return 'failed'
    case 'cancelled':
    case 'cancelled_post_capture':
    case 'expired':
      return 'cancelled'
    case 'processing':
    case 'requires_customer_action':
    case 'requires_merchant_action':
    case 'requires_payment_method':
    case 'requires_confirmation':
    case 'requires_capture':
    case 'partially_captured_and_capturable':
    case 'partially_authorized_and_requires_capture':
    case 'partially_captured_and_processing':
    case 'conflicted':
    case 'review':
      return 'pending'
    default:
      return 'pending'
  }
}

export function transformCharge(raw: RawHyperswitchPayment): Charge {
  const id = String(raw.payment_id ?? '')
  return {
    id,
    externalId: id,
    amount: raw.amount ?? 0,
    currency: pickCurrency(raw.currency),
    amountCaptured: raw.amount_received ?? undefined,
    status: mapStatus(raw),
    customerId: raw.customer?.id ?? raw.customer_id ?? undefined,
    paymentMethodId: raw.payment_method_id ?? undefined,
    description: raw.description ?? undefined,
    statementDescriptor: raw.statement_descriptor_name ?? undefined,
    failureCode: raw.error_code ?? undefined,
    failureMessage: raw.error_message ?? undefined,
    receiptEmail: raw.customer?.email ?? raw.email ?? undefined,
    gateway: 'hyperswitch',
    metadata: strMap({
      ...(raw.metadata ?? {}),
      payment_method: raw.payment_method,
      capture_method: raw.capture_method,
      connector: raw.connector,
      profile_id: raw.profile_id,
      merchant_id: raw.merchant_id,
    }),
    createdAt: toIsoDatetime(raw.created),
    raw,
  }
}
