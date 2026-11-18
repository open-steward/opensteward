import type { Transaction } from '../../../schema/transaction'

export interface AutocountTransaction {
  DocNo: string
  DocDate: string
  AccNo: string
  Description: string
  DrAmt: number
  CrAmt: number
  Balance: number
  DocType: string
  [key: string]: unknown
}

export function transformTransaction(raw: AutocountTransaction): Transaction {
  // DrAmt represents debit (money out), CrAmt represents credit (money in)
  const totalAmount = raw.DrAmt !== 0 ? raw.DrAmt : raw.CrAmt
  const type = raw.DrAmt !== 0 ? 'debit' : 'credit'

  return {
    id: raw.DocNo,
    accountId: raw.AccNo || undefined,
    type: raw.DocType || type,
    memo: raw.Description || undefined,
    totalAmount,
    createdAt: raw.DocDate ? new Date(raw.DocDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
