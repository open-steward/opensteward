import type { Transaction } from '../../../schema/transaction'

export interface DolibarrBankTransaction {
  id?: number | string
  rowid?: number | string
  datev?: number | string
  label?: string
  amount?: number
  fk_account?: number | string
  num_chq?: string
  fk_bordereau?: number | string
  [key: string]: unknown
}

export function transformTransaction(raw: DolibarrBankTransaction): Transaction {
  const id = raw.rowid ?? raw.id
  return {
    id: id !== undefined ? String(id) : '',
    accountId: raw.fk_account !== undefined ? String(raw.fk_account) : undefined,
    reference: raw.num_chq || undefined,
    memo: raw.label || undefined,
    totalAmount: raw.amount ?? 0,
    createdAt: raw.datev ? new Date(Number(raw.datev) * 1000) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
