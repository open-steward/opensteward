import type { Transaction } from '../../../schema/transaction'
import { toMinorUnits } from '../../shared/transform'

/**
 * Built Africa transaction — a payment transaction record linked to an invoice
 * or bill. The Built API exposes these at GET /api/v3/transactions.
 */
export interface BuiltAfricaTransaction {
  id: number
  uuid?: string
  transaction_type?: string  // "payment" | "receipt" | "transfer" | "refund"
  reference?: string
  description?: string
  amount?: number
  base_currency?: string
  fx_currency?: string
  payment_account?: {
    id?: number
    account_name?: string
    [key: string]: unknown
  }
  receiving_account?: {
    id?: number
    account_name?: string
    [key: string]: unknown
  }
  invoice_id?: number | null
  bill_id?: number | null
  customer_id?: number | null
  created_at?: string
  updated_at?: string
  deleted_at?: string | null
  [key: string]: unknown
}

export function transformTransaction(raw: BuiltAfricaTransaction): Transaction {
  return {
    id: String(raw.id),
    accountId:
      raw.payment_account?.id !== undefined ? String(raw.payment_account.id) : undefined,
    splitAccountId:
      raw.receiving_account?.id !== undefined ? String(raw.receiving_account.id) : undefined,
    type: raw.transaction_type || undefined,
    reference: raw.reference || undefined,
    memo: raw.description || undefined,
    currency: raw.base_currency || raw.fx_currency || undefined,
    // Built returns decimal amounts; canonical is integer minor units
    totalAmount: toMinorUnits(raw.amount),
    createdAt: raw.created_at ? new Date(raw.created_at) : undefined,
    updatedAt: raw.updated_at ? new Date(raw.updated_at) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
