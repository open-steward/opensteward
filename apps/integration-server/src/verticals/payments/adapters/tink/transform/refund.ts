/**
 * Tink SettlementAccountRefund → canonical Refund.
 *
 * Fields (https://docs.tink.com/api#payment/settlement-accounts/get-refund):
 * accountId, amount, createdTime ("The date and time when the refund was
 * initiated."), id, merchantId, metadata, reference, scheme, status,
 * transactionId ("Id of the transaction to refund."), updatedTime ("The date
 * and time when the refund was updated.").
 *
 * transactionId is a settlement-account transaction id, the id space
 * listCharges returns, so it is the refund's chargeId.
 *
 * SettlementAccountRefundStatus: PENDING "Default value.", COMPLETED "Refund
 * was successful.", FAILED "Refund failed to complete."
 */
import type { Refund, RefundStatus } from '../../../schema/refund'
import {
  amountToMinor,
  isoDate,
  requireId,
  stringMap,
  text,
  type RawCurrencyDenominatedAmount,
} from './shared'

export interface RawTinkRefund {
  accountId?: string
  amount?: RawCurrencyDenominatedAmount
  createdTime?: string
  id?: string
  merchantId?: string
  metadata?: Record<string, unknown> | null
  reference?: string
  scheme?: string
  status?: string
  transactionId?: string
  updatedTime?: string
}

export function mapRefundStatus(status: unknown): RefundStatus {
  switch (status) {
    case 'PENDING':
      return 'pending'
    case 'COMPLETED':
      return 'succeeded'
    case 'FAILED':
      return 'failed'
    default:
      return 'unknown'
  }
}

export function transformRefund(raw: RawTinkRefund): Refund {
  const id = requireId(raw.id, 'refund')
  const chargeId = text(raw.transactionId)
  // transactionId is documented `required`; never invent a charge link.
  if (!chargeId) throw new Error(`Tink refund ${id} is missing transactionId`)
  const { amount, currency } = amountToMinor(raw.amount, `refund ${id}`)
  return {
    id,
    externalId: id,
    chargeId,
    amount,
    currency,
    status: mapRefundStatus(raw.status),
    gateway: 'tink',
    metadata: stringMap(raw.metadata),
    createdAt: isoDate(raw.createdTime),
    updatedAt: isoDate(raw.updatedTime),
    raw,
  }
}
