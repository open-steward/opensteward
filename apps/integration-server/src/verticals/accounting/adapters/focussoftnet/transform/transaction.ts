import type { Transaction } from '../../../schema/transaction'

export interface FocusSoftnetTransaction {
  DocNo: string
  TransDate: string
  Amount: number
  CurrCode: string
  DocType: string
  Description: string
  Status: string
  [key: string]: unknown
}

export function transformTransaction(raw: FocusSoftnetTransaction): Transaction {
  return {
    id: String(raw.DocNo),
    type: raw.DocType || undefined,
    memo: raw.Description || undefined,
    currency: raw.CurrCode || undefined,
    totalAmount: raw.Amount,
    createdAt: raw.TransDate ? new Date(raw.TransDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
