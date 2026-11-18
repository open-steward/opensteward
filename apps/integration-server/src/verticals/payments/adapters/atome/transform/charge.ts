/**
 * An Atome **payment** (`GET /payments/{referenceId}`) carries the amount,
 * currency, lifecycle status, the settled `paymentTransaction`, and the
 * `refundTransactions[]` history — so it maps onto the canonical **Charge**.
 *
 * Money is already a positive integer in the smallest currency unit, matching
 * the canonical schema, so no conversion is needed. Atome statuses are
 * PROCESSING / PAID / FAILED / REFUNDED / CANCELLED; a PAID payment with a
 * non-zero `refundTransactions[]` but a still-positive `refundableAmount` is a
 * partial refund. Timestamps live on the sub-transactions as epoch-millisecond
 * strings (e.g. `"1605085352000"`) and are normalised with `toIsoDatetime`.
 *
 * There is no buyer/customer id on the payment (Atome pre-fills contact details
 * from `customerInfo` at create time but does not return a customer resource),
 * so `customerId` is left unset.
 *
 * Docs: https://doc.apaylater.com/v2/
 */
import { toIsoDatetime } from '@opensteward/shared'
import type { Charge, ChargeStatus } from '../../../schema/charge'
import { pickCurrency, strMap, toMinor } from './shared'

export interface RawAtomePaymentTransaction {
  orderId?: string
  transactionId?: string
  /** Order creation time, epoch-millisecond timestamp string. */
  createAt?: string
  tenor?: number
  [k: string]: unknown
}

export interface RawAtomeRefundTransaction {
  refundId?: string
  transactionId?: string
  amount?: number
  /** Refund creation time, epoch-millisecond timestamp string. */
  createAt?: string
  [k: string]: unknown
}

export interface RawAtomePayment {
  referenceId?: string
  merchantReferenceId?: string
  currency?: string
  amount?: number
  refundableAmount?: number
  status?: string
  paymentTransaction?: RawAtomePaymentTransaction | null
  refundTransactions?: RawAtomeRefundTransaction[] | null
  redirectUrl?: string
  appPaymentUrl?: string
  additionalInfo?: Record<string, unknown> | null
  [k: string]: unknown
}

function sumRefunded(list: RawAtomeRefundTransaction[] | null | undefined): number {
  return (list ?? []).reduce((acc, e) => acc + toMinor(e.amount), 0)
}

function mapStatus(raw: RawAtomePayment, amount: number, refunded: number): ChargeStatus {
  switch ((raw.status ?? '').toUpperCase()) {
    case 'PAID':
      // PAID stays PAID through partial refunds; full refunds flip to REFUNDED.
      return refunded > 0 && refunded < amount ? 'partially_refunded' : 'succeeded'
    case 'REFUNDED':
      return 'refunded'
    case 'FAILED':
      return 'failed'
    case 'CANCELLED':
      return 'cancelled'
    case 'PROCESSING':
      return 'pending'
    default:
      return 'pending'
  }
}

export function transformCharge(raw: RawAtomePayment): Charge {
  const currency = pickCurrency(raw.currency)
  const amount = toMinor(raw.amount)
  const refundTransactions = raw.refundTransactions ?? []
  const refunded = sumRefunded(refundTransactions)
  // Newest refund transaction lists first per the API contract.
  const latestRefund = refundTransactions[0]

  return {
    id: String(raw.referenceId ?? ''),
    externalId: String(raw.referenceId ?? ''),
    amount,
    currency,
    amountRefunded: refunded > 0 ? refunded : undefined,
    status: mapStatus(raw, amount, refunded),
    refundIds: refundTransactions
      .map((r) => String(r.refundId ?? ''))
      .filter((id) => id.length > 0),
    gateway: 'atome',
    metadata: strMap({
      atome_status: raw.status,
      merchant_reference_id: raw.merchantReferenceId,
      refundable_amount: raw.refundableAmount,
      order_id: raw.paymentTransaction?.orderId,
      transaction_id: raw.paymentTransaction?.transactionId,
      tenor: raw.paymentTransaction?.tenor,
      redirect_url: raw.redirectUrl,
      app_payment_url: raw.appPaymentUrl,
    }),
    createdAt: toIsoDatetime(raw.paymentTransaction?.createAt),
    updatedAt: toIsoDatetime(latestRefund?.createAt ?? raw.paymentTransaction?.createAt),
    raw,
  }
}
