/**
 * Afterpay `Payment` (an authorised + captured loan) → canonical `Charge`.
 * `Charge.amount` = total order principal. Installment schedule lives in
 * `Charge.raw` only.
 */
import type { Charge, ChargeStatus } from '../../../schema/charge'
import { decimalToMinor, pickCurrency, strMap } from './shared'

export interface RawAfterpayPayment {
  id?: string
  token?: string
  status?: string
  totalAmount?: { amount?: string; currency?: string }
  refundedAmount?: { amount?: string }
  orderDetails?: { consumer?: { email?: string; givenNames?: string; surname?: string } }
  merchantReference?: string
  created?: string
  [k: string]: unknown
}

function mapStatus(raw: RawAfterpayPayment): ChargeStatus {
  switch ((raw.status ?? '').toUpperCase()) {
    case 'APPROVED':
    case 'CAPTURED':
      return 'succeeded'
    case 'AUTH_APPROVED':
    case 'PENDING':
      return 'pending'
    case 'DECLINED':
    case 'FAILED':
      return 'failed'
    case 'VOIDED':
      return 'cancelled'
    case 'REFUNDED':
      return 'refunded'
    case 'PARTIALLY_REFUNDED':
      return 'partially_refunded'
    default:
      return 'pending'
  }
}

export function transformCharge(raw: RawAfterpayPayment): Charge {
  const consumer = raw.orderDetails?.consumer
  const name = [consumer?.givenNames, consumer?.surname].filter(Boolean).join(' ').trim()
  return {
    id: String(raw.id ?? raw.token ?? ''),
    externalId: String(raw.id ?? raw.token ?? ''),
    amount: decimalToMinor(raw.totalAmount?.amount),
    currency: pickCurrency(raw.totalAmount?.currency),
    amountRefunded: decimalToMinor(raw.refundedAmount?.amount),
    status: mapStatus(raw),
    receiptEmail: consumer?.email,
    description: name || raw.merchantReference,
    gateway: 'afterpay',
    metadata: strMap({ merchant_reference: raw.merchantReference, token: raw.token }),
    createdAt: raw.created,
    raw,
  }
}
