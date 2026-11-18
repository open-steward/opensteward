import type { Transaction } from '../../../schema/transaction'

export interface FreeAgentBankTransaction {
  url: string
  bank_account: string
  dated_on: string
  description: string
  amount: string
  gross_value: string
  foreign_currency_amount: string
  currency: string
  type: string
  is_manual: boolean
  [key: string]: unknown
}

function extractId(url: string): string {
  return url.split('/').pop() ?? url
}

export function transformTransaction(raw: FreeAgentBankTransaction): Transaction {
  return {
    id: extractId(raw.url),
    accountId: raw.bank_account ? extractId(raw.bank_account) : undefined,
    type: raw.type || undefined,
    memo: raw.description || undefined,
    currency: raw.currency || undefined,
    totalAmount: parseFloat(raw.gross_value) || parseFloat(raw.amount) || undefined,
    createdAt: raw.dated_on ? new Date(raw.dated_on) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
