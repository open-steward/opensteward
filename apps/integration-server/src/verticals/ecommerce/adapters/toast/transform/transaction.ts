/**
 * Toast Orders API `Payment` → canonical Transaction.
 *
 * GET /orders/v2/payments/{guid} "Returns a JSON `Payment` object containing
 * detailed information about a single payment, specified by its GUID."
 * https://doc.toasttab.com/openapi/orders/operation/paymentsGuidGet/
 *
 * Documented fields used: `guid`, `orderGuid` ("The Toast platform identifier
 * for the order that contains the payment."), `amount` ("The amount of this
 * payment, excluding tips."), `paidDate`, and `paymentStatus`. Amounts are
 * decimal numbers in the restaurant's currency, which the adapter reads from
 * the Restaurants API (see `restaurantCurrency` in ./order).
 */

import type { Transaction, TransactionStatus } from '../../../schema/transaction'
import { toIsoDatetime } from '@opensteward/shared'
import { toastMoney } from './order'

export interface RawToastRefundInfo {
  /** "The amount of the refund, excluding the tip." */
  refundAmount?: number | null
  /** "The amount of the tip refund." */
  tipRefundAmount?: number | null
  refundDate?: string | null
  refundBusinessDate?: number | null
  refundTransaction?: { guid: string; entityType?: string } | null
}

export interface RawToastPayment {
  guid: string
  entityType?: string
  externalId?: string | null
  paidDate?: string | null
  paidBusinessDate?: number | null
  /** CASH, CREDIT, GIFTCARD, HOUSE_ACCOUNT, REWARDCARD, LEVELUP, TOAST_SV, OTHER, UNDETERMINED */
  type?: string | null
  amount?: number | null
  tipAmount?: number | null
  refundStatus?: string | null
  refund?: RawToastRefundInfo | null
  paymentStatus?: string | null
  voidInfo?: Record<string, unknown> | null
  orderGuid?: string | null
  checkGuid?: string | null
  [key: string]: unknown
}

/**
 * `paymentStatus` ("The status of this payment when the type is `CREDIT`"):
 * `CAPTURED` - "the guest account is charged"; `OPEN`, `PROCESSING`,
 * `AUTHORIZED` ("approved but not yet captured"), `CAPTURE_IN_PROGRESS` and
 * `PROCESSING_VOID` are in flight; `DENIED` - "The payment request was
 * denied."; `ERROR` / `ERROR_NETWORK` - processing errors. `VOIDED`,
 * `CANCELLED` and the two deprecated values have no canonical status.
 */
const STATUS_MAP: Record<string, TransactionStatus> = {
  CAPTURED: 'SUCCESS',
  OPEN: 'PENDING',
  PROCESSING: 'PENDING',
  AUTHORIZED: 'PENDING',
  CAPTURE_IN_PROGRESS: 'PENDING',
  PROCESSING_VOID: 'PENDING',
  DENIED: 'FAILURE',
  ERROR: 'ERROR',
  ERROR_NETWORK: 'ERROR',
}

export function transformTransaction(
  raw: RawToastPayment,
  currency: string | undefined,
): Transaction {
  return {
    id: raw.guid,
    orderId: raw.orderGuid ?? undefined,
    // A payment applied to a guest check.
    kind: 'SALE',
    status: raw.paymentStatus ? STATUS_MAP[raw.paymentStatus] : undefined,
    amount: toastMoney(raw.amount, currency),
    processedAt: toIsoDatetime(raw.paidDate),
    metadata: raw as unknown as Record<string, unknown>,
  }
}
