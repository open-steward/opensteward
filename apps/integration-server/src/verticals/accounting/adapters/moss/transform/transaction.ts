import type { Transaction } from '../../../schema/transaction'
import type { TransactionLineitem } from '../../../schema/shared'
import type { MossMoney } from './expense'

// ── Moss BankTransactionFee ───────────────────────────────────────────────────

export interface MossBankTransactionFee {
  amount?: MossMoney | null
  [key: string]: unknown
}

// ── Moss BankTransaction ──────────────────────────────────────────────────────

export interface MossBankTransaction {
  id: string
  bankAccountId: string
  organisationId: string
  transactionType: string
  amount: MossMoney
  bookingDate: string
  valueDate: string
  description?: string | null
  fees?: MossBankTransactionFee[]
  [key: string]: unknown
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseMoney(money?: MossMoney | null): number | undefined {
  if (!money?.amount || typeof money.amount !== 'string') return undefined
  const n = parseFloat(money.amount)
  return isNaN(n) ? undefined : Math.round(n * 100)
}

// ── Transform ─────────────────────────────────────────────────────────────────

export function transformBankTransaction(raw: MossBankTransaction): Transaction {
  const lineItems: TransactionLineitem[] = [
    {
      accountId: raw.bankAccountId || undefined,
      name: raw.transactionType || undefined,
      totalAmount: parseMoney(raw.amount),
    },
  ]

  for (const fee of raw.fees ?? []) {
    const feeAmt = parseMoney(fee.amount)
    if (feeAmt != null) {
      lineItems.push({ description: 'fee', totalAmount: feeAmt })
    }
  }

  return {
    id: raw.id,
    accountId: raw.bankAccountId || undefined,
    type: raw.transactionType || undefined,
    memo: raw.description || undefined,
    currency: raw.amount?.currency || undefined,
    totalAmount: parseMoney(raw.amount),
    lineItems,
    createdAt: raw.bookingDate ? new Date(raw.bookingDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
