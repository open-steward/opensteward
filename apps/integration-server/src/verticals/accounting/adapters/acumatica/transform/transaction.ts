import type { Transaction } from '../../../schema/transaction'

export interface AcumaticaTransaction {
  TranID: string | number
  TranDate: string
  TranDesc: string
  CuryTranAmt: number
  CuryID: string
  AccountID: string
  [key: string]: unknown
}

export function transformTransaction(raw: AcumaticaTransaction): Transaction {
  return {
    id: String(raw.TranID),
    memo: raw.TranDesc || undefined,
    totalAmount: raw.CuryTranAmt,
    currency: raw.CuryID || undefined,
    accountId: raw.AccountID || undefined,
    createdAt: raw.TranDate ? new Date(raw.TranDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
