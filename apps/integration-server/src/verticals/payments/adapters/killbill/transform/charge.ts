import { toIsoDatetime } from '@opensteward/shared'
import type { Charge, ChargeStatus } from '../../../schema/charge'
import { requireCurrency, requireId, str, toMinor } from './shared'

/**
 * PaymentTransaction (https://killbill.github.io/slate/payment-transaction.html):
 * "transactionType: Possible values are: AUTHORIZE, CAPTURE, CHARGEBACK,
 *  CREDIT, PURCHASE, REFUND, VOID"; "status: Possible values are: SUCCESS,
 *  UNKNOWN, PENDING, PAYMENT_FAILURE, PLUGIN_FAILURE, or PAYMENT_SYSTEM_OFF".
 */
export interface RawKillbillTransaction {
  transactionId?: string
  paymentId?: string
  transactionType?: string
  amount?: number | null
  currency?: string | null
  effectiveDate?: string | null
  status?: string | null
  gatewayErrorCode?: string | null
  gatewayErrorMsg?: string | null
  [k: string]: unknown
}

/**
 * Payment (https://killbill.github.io/slate/payment.html, "Payment Resource"):
 * paymentId, accountId, paymentNumber, paymentExternalKey, authAmount,
 * capturedAmount, purchasedAmount, refundedAmount, creditedAmount, currency,
 * paymentMethodId, transactions.
 */
export interface RawKillbillPayment {
  paymentId?: string
  accountId?: string
  paymentExternalKey?: string | null
  capturedAmount?: number | null
  purchasedAmount?: number | null
  refundedAmount?: number | null
  currency?: string | null
  paymentMethodId?: string | null
  transactions?: RawKillbillTransaction[] | null
  [k: string]: unknown
}

/**
 * The transaction that opened the payment as a charge: its first AUTHORIZE or
 * PURCHASE. A payment with neither (one opened by CREDIT) pays the customer
 * and is not a charge.
 */
export function openingTransaction(raw: RawKillbillPayment): RawKillbillTransaction | undefined {
  return (raw.transactions ?? []).find(
    (t) => t.transactionType === 'AUTHORIZE' || t.transactionType === 'PURCHASE',
  )
}

export function isCharge(raw: RawKillbillPayment): boolean {
  return openingTransaction(raw) !== undefined
}

function txStatus(s: unknown): ChargeStatus {
  switch (s) {
    case 'SUCCESS':
      return 'succeeded'
    case 'PENDING':
      return 'pending'
    case 'PAYMENT_FAILURE':
    case 'PLUGIN_FAILURE':
    case 'PAYMENT_SYSTEM_OFF':
      return 'failed'
    default:
      return 'unknown'
  }
}

export function transformCharge(raw: RawKillbillPayment): Charge {
  const id = requireId(raw.paymentId, 'paymentId', 'payment')
  const opening = openingTransaction(raw)
  if (!opening) throw new Error(`Kill Bill payment ${id} has no AUTHORIZE or PURCHASE transaction`)
  const currency = requireCurrency(raw.currency, 'payment')
  const amount = toMinor(opening.amount, currency)
  if (amount === undefined) throw new Error(`Kill Bill payment ${id} has no transaction amount`)
  const refunded = toMinor(raw.refundedAmount, currency)
  const captured =
    opening.transactionType === 'PURCHASE'
      ? toMinor(raw.purchasedAmount, currency)
      : toMinor(raw.capturedAmount, currency)
  const txs = raw.transactions ?? []
  let status = txStatus(opening.status)
  if (status === 'succeeded') {
    if (txs.some((t) => t.transactionType === 'VOID' && t.status === 'SUCCESS'))
      status = 'cancelled'
    else if (refunded !== undefined && refunded > 0)
      status = refunded >= amount ? 'refunded' : 'partially_refunded'
  }
  return {
    id,
    externalId: id,
    amount,
    currency,
    amountRefunded: refunded,
    amountCaptured: captured,
    status,
    customerId: str(raw.accountId),
    paymentMethodId: str(raw.paymentMethodId),
    failureCode: str(opening.gatewayErrorCode),
    failureMessage: str(opening.gatewayErrorMsg),
    refundIds: txs
      .filter((t) => t.transactionType === 'REFUND' && str(t.transactionId))
      .map((t) => t.transactionId as string),
    gateway: 'killbill',
    metadata: {},
    createdAt: toIsoDatetime(opening.effectiveDate),
    raw,
  }
}
