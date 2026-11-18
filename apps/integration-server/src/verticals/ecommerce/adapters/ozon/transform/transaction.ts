/**
 * Ozon finance operation → canonical Transaction.
 *
 * `POST /v3/finance/transaction/list` operations: `operation_id`,
 * `operation_type`, `operation_type_name`, `operation_date`, `amount`,
 * `type`, `posting.posting_number`, `items`, `services`. `amount` has no
 * currency and `operation_date` no zone, so neither is promoted to a
 * canonical field; `operation_type` is Ozon's own taxonomy and does not map
 * onto sale/refund/capture without guessing. All of it stays in `metadata`.
 *
 * Docs: https://docs.ozon.ru/api/seller/ (FinanceAPI)
 */
import type { Transaction } from '../../../schema/transaction'
import { isoIfZoned } from '../dates'

export interface RawOzonFinancePosting {
  posting_number?: string
  [key: string]: unknown
}

export interface RawOzonFinanceOperation {
  operation_id: number
  operation_type?: string
  operation_type_name?: string
  operation_date?: string
  amount?: number
  type?: string
  posting?: RawOzonFinancePosting
  [key: string]: unknown
}

export function transformTransaction(raw: RawOzonFinanceOperation): Transaction {
  return {
    id: String(raw.operation_id),
    orderId: raw.posting?.posting_number || undefined,
    processedAt: isoIfZoned(raw.operation_date),
    metadata: raw as unknown as Record<string, unknown>,
  }
}
