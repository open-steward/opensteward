/**
 * Loyverse Payment → canonical Transaction.
 *
 * Loyverse does not expose a standalone "transactions" endpoint. Payments are
 * embedded inside receipt objects under the `payments` array. Each payment
 * entry carries:
 *  - `payment_type_id`: identifier for the payment type
 *  - `name`: payment type display name (e.g. "Cash", "Credit Card")
 *  - `money_amount`: amount in major units
 *
 * We synthesize a Transaction id as `${receiptNumber}:${paymentTypeId}:{index}`
 * to ensure uniqueness within a receipt.
 *
 * There is no standalone transaction CRUD in Loyverse — this transform is used
 * only when reading transactions from a receipt context.
 */

import type { Transaction } from '../../../schema/transaction'
import { majorToMinor } from '../../../schema/shared'
import type { RawLoyversePayment } from './order'

function toMinor(v: number | null | undefined, currency: string): number {
  if (v == null) return 0
  return majorToMinor(v, currency)
}

export function transformTransaction(
  raw: RawLoyversePayment,
  receiptNumber: string,
  index: number,
  currency: string = 'USD',
): Transaction {
  const id = `${receiptNumber}:${raw.payment_type_id ?? 'payment'}:${index}`
  return {
    id,
    orderId: receiptNumber,
    kind: 'SALE',
    status: 'SUCCESS',
    amount:
      raw.money_amount != null
        ? { amount: toMinor(raw.money_amount, currency), currency }
        : undefined,
    gateway: raw.name ?? raw.payment_type_id ?? undefined,
    processedAt: undefined,
    createdAt: undefined,
    metadata: { ...raw, receiptNumber } as unknown as Record<string, unknown>,
  }
}
