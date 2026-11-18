import { toIsoDatetime } from '@opensteward/shared'
import type { Charge, ChargeStatus } from '../../../schema/charge'
import { pickCurrency, strMap, toMinorUnits } from './shared'

/**
 * A settled payment nested inside a payment request's `payments[]` array.
 * Present once the buyer has actually paid.
 */
export interface RawHitpayPayment {
  id?: string
  status?: string
  buyer_name?: string
  buyer_email?: string
  currency?: string
  amount?: string | number
  refunded_amount?: string | number
  payment_type?: string
  fees?: string | number
  created_at?: string
  updated_at?: string
  [k: string]: unknown
}

/**
 * A HitPay Payment Request — the closest analogue to a canonical charge.
 * Created via `POST /payment-requests`, fetched via `GET /payment-requests/{id}`.
 */
export interface RawHitpayPaymentRequest {
  id?: string
  status?: string
  amount?: string | number
  currency?: string
  name?: string
  email?: string
  phone?: string
  purpose?: string
  reference_number?: string
  payment_methods?: string[]
  url?: string
  redirect_url?: string
  webhook?: string
  send_email?: boolean
  send_sms?: boolean
  payments?: RawHitpayPayment[]
  created_at?: string
  updated_at?: string
  [k: string]: unknown
}

/**
 * Map HitPay's payment-request lifecycle onto the canonical charge status.
 *   pending   → pending   (link issued, not yet paid)
 *   completed → succeeded
 *   failed    → failed
 *   expired   → cancelled (link lapsed without payment)
 */
function mapStatus(raw: RawHitpayPaymentRequest): ChargeStatus {
  switch ((raw.status ?? '').toLowerCase()) {
    case 'completed':
    case 'succeeded':
      return 'succeeded'
    case 'pending':
      return 'pending'
    case 'failed':
      return 'failed'
    case 'expired':
    case 'canceled':
    case 'cancelled':
      return 'cancelled'
    default:
      return 'pending'
  }
}

export function transformCharge(raw: RawHitpayPaymentRequest): Charge {
  const settled = (raw.payments ?? []).find((p) => (p.status ?? '').toLowerCase() === 'succeeded')
    ?? raw.payments?.[0]
  const status = mapStatus(raw)
  const refunded = settled?.refunded_amount != null ? toMinorUnits(settled.refunded_amount) : undefined

  return {
    id: String(raw.id ?? ''),
    externalId: String(raw.id ?? ''),
    amount: toMinorUnits(raw.amount),
    currency: pickCurrency(raw.currency ?? settled?.currency),
    amountRefunded: refunded,
    status,
    captured: status === 'succeeded',
    capturedAt: status === 'succeeded' ? toIsoDatetime(settled?.created_at ?? raw.updated_at) : undefined,
    paymentMethodId: settled?.id ? String(settled.id) : undefined,
    description: raw.purpose,
    receiptUrl: raw.url,
    receiptEmail: raw.email ?? settled?.buyer_email,
    gateway: 'hitpay',
    metadata: strMap({
      reference_number: raw.reference_number,
      name: raw.name ?? settled?.buyer_name,
      phone: raw.phone,
      payment_type: settled?.payment_type,
      payment_methods: raw.payment_methods?.join(','),
      redirect_url: raw.redirect_url,
      fees: settled?.fees,
    }),
    createdAt: toIsoDatetime(raw.created_at),
    updatedAt: toIsoDatetime(raw.updated_at),
    raw,
  }
}
