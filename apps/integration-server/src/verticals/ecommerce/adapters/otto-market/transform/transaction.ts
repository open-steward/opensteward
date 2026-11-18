/**
 * OTTO Market Receipt → canonical Transaction (read-only).
 *
 * `GET /v3/receipts` (filters: `receiptTypes` = PURCHASE | REFUND |
 * PARTIAL_REFUND, `salesOrderId`, `from`, `to`, `limit`, `next`) and
 * `GET /v3/receipts/{receiptNumber}` are confirmed. `receiptNumber` is used
 * as the id — it is the confirmed path parameter, matching the same
 * `<resource>Id`-in-the-path convention `returnAddressId` confirms
 * elsewhere. The amount field itself is not shown with a worked JSON
 * example, so it is read defensively and — since this is a read-only
 * financial record, not a value this adapter ever writes — a genuinely
 * missing amount is simply omitted (`Transaction.amount` is optional)
 * rather than defaulted to zero.
 *
 * This is the seller-facing financial ledger; OTTO Market generates it, so
 * `createTransaction` is not implemented — see index.ts.
 *
 * Docs: https://api.otto.market/docs/functional-interfaces/receipts
 */

import type { Transaction, TransactionKind } from '../../../schema/transaction'
import type { Money } from '../../../schema/shared'

export type RawOttoReceiptType = 'PURCHASE' | 'REFUND' | 'PARTIAL_REFUND' | (string & {})

export interface RawOttoReceipt {
  receiptNumber: string
  receiptType?: RawOttoReceiptType
  salesOrderId?: string
  orderId?: string
  receiptDate?: string
  amount?: unknown
  [key: string]: unknown
}

function mapKind(type: RawOttoReceiptType | undefined): TransactionKind {
  switch (type) {
    case 'PURCHASE':
      return 'SALE'
    case 'REFUND':
    case 'PARTIAL_REFUND':
      return 'REFUND'
    default:
      return 'unknown'
  }
}

function extractAmount(raw: RawOttoReceipt): Money | undefined {
  const candidate = raw.amount
  if (candidate != null && typeof candidate === 'object') {
    const obj = candidate as Record<string, unknown>
    const amount = obj['amount']
    const currency = obj['currency']
    if (typeof amount === 'number' && typeof currency === 'string' && /^[A-Za-z]{3}$/.test(currency)) {
      return { amount: Math.round(amount), currency: currency.toUpperCase() }
    }
  }
  return undefined
}

export function transformTransaction(raw: RawOttoReceipt): Transaction {
  return {
    id: raw.receiptNumber,
    orderId: raw.salesOrderId ?? raw.orderId,
    kind: mapKind(raw.receiptType),
    status: 'SUCCESS',
    amount: extractAmount(raw),
    gateway: 'otto-market',
    processedAt: raw.receiptDate,
    createdAt: raw.receiptDate,
    metadata: raw as unknown as Record<string, unknown>,
  }
}
