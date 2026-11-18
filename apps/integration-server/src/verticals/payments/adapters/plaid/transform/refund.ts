/**
 * Plaid Transfer Refund → canonical Refund.
 *
 * A Plaid refund reverses a settled `debit` transfer back to the customer's
 * bank account. The refund references its parent via `transfer_id`. Money is a
 * decimal string in major units; the refund itself carries no currency field,
 * so the currency is inherited from the parent transfer when known (defaults
 * to USD otherwise). Timestamps are RFC-3339.
 */
import { toIsoDatetime } from '@opensteward/shared'
import type { Refund, RefundStatus } from '../../../schema/refund'
import { decimalToMinor, pickCurrency, strMap } from './shared'

export interface RawPlaidRefund {
  id?: string
  transfer_id?: string
  amount?: string
  status?: string
  created?: string
  failure_reason?: { description?: string | null; ach_return_code?: string | null } | null
  [key: string]: unknown
}

/**
 * Plaid refund.status → canonical RefundStatus.
 *   pending / posted          → pending
 *   settled / funds_available → succeeded
 *   failed / returned         → failed
 *   cancelled                 → cancelled
 */
export function mapRefundStatus(raw: RawPlaidRefund): RefundStatus {
  switch ((raw.status ?? '').toLowerCase()) {
    case 'settled':
    case 'funds_available':
      return 'succeeded'
    case 'pending':
    case 'posted':
      return 'pending'
    case 'failed':
    case 'returned':
      return 'failed'
    case 'cancelled':
      return 'cancelled'
    default:
      return 'pending'
  }
}

export function transformRefund(raw: RawPlaidRefund, currencyCode?: string | null): Refund {
  const id = String(raw.id ?? '')
  return {
    id,
    externalId: id,
    chargeId: String(raw.transfer_id ?? ''),
    amount: decimalToMinor(raw.amount),
    currency: pickCurrency(currencyCode),
    status: mapRefundStatus(raw),
    failureReason: raw.failure_reason?.description ?? undefined,
    gateway: 'plaid',
    metadata: strMap({ ach_return_code: raw.failure_reason?.ach_return_code }),
    createdAt: toIsoDatetime(raw.created),
    raw,
  }
}
