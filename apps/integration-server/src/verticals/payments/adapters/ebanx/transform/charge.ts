import { toIsoDatetime } from '@opensteward/shared'
import type { Charge, ChargeStatus } from '../../../schema/charge'
import { pickCurrency, strMap, toMinorUnits } from './shared'
import type { RawEbanxRefund } from './refund'

/**
 * EBANX payment object, as returned inside `{ payment: {...} }` by
 * /ws/direct, /ws/query, /ws/capture and /ws/cancel.
 *
 * Amounts are decimal-string major units; `*_ext` is the merchant-facing
 * currency the charge was created in. Dates are `YYYY-MM-DD HH:MM:SS`
 * (no timezone).
 */
export interface RawEbanxPayment {
  hash?: string
  merchant_payment_code?: string
  status?: string
  // amount_ext / currency_ext = original merchant currency + amount.
  amount_ext?: string | number
  currency_ext?: string
  // amount_br / currency_code = settled (BRL) leg, if present.
  amount_br?: string | number
  currency_code?: string
  payment_type_code?: string
  instalments?: string | number
  pre_approved?: boolean
  capture_available?: boolean | null
  open_date?: string
  confirm_date?: string | null
  status_date?: string
  customer?: {
    name?: string
    email?: string
    document?: string
    [k: string]: unknown
  }
  transaction_status?: {
    acquirer?: string
    code?: string
    description?: string
    [k: string]: unknown
  }
  refunds?: RawEbanxRefund[]
  [k: string]: unknown
}

/**
 * EBANX payment status codes:
 *   CO confirmed/paid · PE pending · OP open (awaiting payment) · CA cancelled.
 */
function mapStatus(raw: RawEbanxPayment): ChargeStatus {
  switch ((raw.status ?? '').toUpperCase()) {
    case 'CO':
      // A fully-refunded confirmed payment still reports CO; surface that
      // when every refund settled, else 'succeeded'.
      if (raw.refunds && raw.refunds.length > 0) {
        const allConfirmed = raw.refunds.every((r) => (r.status ?? '').toUpperCase() === 'CO')
        return allConfirmed ? 'refunded' : 'partially_refunded'
      }
      return 'succeeded'
    case 'PE':
    case 'OP':
      return 'pending'
    case 'CA':
      return 'cancelled'
    default:
      return 'pending'
  }
}

export function transformCharge(raw: RawEbanxPayment): Charge {
  const currency = pickCurrency(raw.currency_ext ?? raw.currency_code)
  const captureAvailable = raw.capture_available === true
  return {
    id: String(raw.hash ?? raw.merchant_payment_code ?? ''),
    externalId: String(raw.hash ?? raw.merchant_payment_code ?? ''),
    amount: toMinorUnits(raw.amount_ext ?? raw.amount_br, currency),
    currency,
    status: mapStatus(raw),
    // EBANX captures automatically unless capture_available is still true.
    captured: !captureAvailable,
    capturedAt: captureAvailable ? undefined : toIsoDatetime(raw.confirm_date),
    receiptEmail: raw.customer?.email,
    failureCode: raw.transaction_status?.code,
    failureMessage: raw.transaction_status?.description,
    refundIds: (raw.refunds ?? [])
      .map((r) => (r.id != null ? String(r.id) : ''))
      .filter((id) => id !== ''),
    gateway: 'ebanx',
    metadata: strMap({
      payment_type_code: raw.payment_type_code,
      merchant_payment_code: raw.merchant_payment_code,
      instalments: raw.instalments,
      acquirer: raw.transaction_status?.acquirer,
    }),
    createdAt: toIsoDatetime(raw.open_date),
    updatedAt: toIsoDatetime(raw.status_date ?? raw.confirm_date ?? raw.open_date),
    raw,
  }
}
