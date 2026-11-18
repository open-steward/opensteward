import type { Transaction, TransactionContact } from '../../../schema/transaction'

export interface IntacctTransaction {
  RECORDNO: string
  CUSTOMERNAME: string
  CUSTOMERID: string
  AMOUNT: string
  CURRENCY: string
  WHENCREATED: string
  DESCRIPTION: string
  FINANCIALENTITY: string
  STATE: string
  [key: string]: unknown
}

export function transformTransaction(raw: IntacctTransaction): Transaction {
  const contacts: TransactionContact[] = [
    {
      id: raw.CUSTOMERID || undefined,
      name: raw.CUSTOMERNAME || undefined,
    },
  ]

  return {
    id: raw.RECORDNO,
    memo: raw.DESCRIPTION || undefined,
    currency: raw.CURRENCY || undefined,
    totalAmount: parseFloat(raw.AMOUNT),
    contacts,
    createdAt: raw.WHENCREATED ? new Date(raw.WHENCREATED) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
