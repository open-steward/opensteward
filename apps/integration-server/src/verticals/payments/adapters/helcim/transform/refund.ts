/**
 * Helcim refund ↔ canonical Refund.
 *
 * Helcim has no standalone refund resource and no refund list endpoint: a
 * refund is created with `POST /payment/refund` (referencing the original
 * transaction id) and the response is itself a transaction object. So only
 * `createRefund` is wired up in index.ts, and this transform maps that
 * transaction response onto the canonical Refund.
 *
 * `amount` is decimal dollars → integer minor units. `status` is
 * `APPROVED` | `DECLINED`. `chargeId` is the original transaction id we
 * refunded against (the response's `transactionId` is the *new* refund
 * transaction).
 *
 * Refs: https://devdocs.helcim.com/reference/refund
 */
import { toIsoDatetime } from '@opensteward/shared'
import type { Refund, RefundStatus } from '../../../schema/refund'
import { pickCurrency, strMap, toMinorUnits } from './shared'

export interface RawHelcimRefundTransaction {
  transactionId?: number | string
  dateCreated?: string
  type?: string
  amount?: number | string
  currency?: string
  status?: string
  approvalCode?: string
  customerCode?: string
  [k: string]: unknown
}

function mapStatus(raw: RawHelcimRefundTransaction): RefundStatus {
  switch ((raw.status ?? '').toUpperCase()) {
    case 'APPROVED':
      return 'succeeded'
    case 'DECLINED':
      return 'failed'
    default:
      return 'pending'
  }
}

/**
 * @param raw                  The refund transaction object from the response.
 * @param originalTransactionId The transaction id the refund was taken against.
 */
export function transformRefund(
  raw: RawHelcimRefundTransaction,
  originalTransactionId: string,
): Refund {
  return {
    id: String(raw.transactionId ?? ''),
    externalId: String(raw.transactionId ?? ''),
    chargeId: String(originalTransactionId),
    amount: toMinorUnits(raw.amount),
    currency: pickCurrency(raw.currency),
    status: mapStatus(raw),
    gateway: 'helcim',
    metadata: strMap({
      type: raw.type,
      approvalCode: raw.approvalCode,
      customerCode: raw.customerCode,
    }),
    createdAt: toIsoDatetime(raw.dateCreated),
    raw,
  }
}
