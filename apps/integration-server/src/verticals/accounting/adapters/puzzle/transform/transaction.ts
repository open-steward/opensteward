import type { Transaction, TransactionContact } from '../../../schema/transaction'
import type { PuzzleMoney } from './invoice'

// ── Puzzle wire types ─────────────────────────────────────────────────────────

export interface PuzzleTransaction {
  id: string
  descriptor?: string
  timestamp?: string
  amountAsMoney?: PuzzleMoney
  memo?: string
  nativeId?: string
  category?: string
  coaKey?: string
  accountId?: string
  status?: string    // Finalized | NotFinalized | NotCategorized
  vendorId?: string
  customerId?: string
  [key: string]: unknown
}

// ── Transform ─────────────────────────────────────────────────────────────────

export function transformTransaction(raw: PuzzleTransaction): Transaction {
  const contacts: TransactionContact[] = []
  if (raw.customerId) contacts.push({ id: raw.customerId })
  else if (raw.vendorId) contacts.push({ id: raw.vendorId })

  const totalCents =
    raw.amountAsMoney?.amount != null
      ? Math.round(parseFloat(raw.amountAsMoney.amount) * 100)
      : undefined

  return {
    id: raw.id,
    accountId: raw.accountId || undefined,
    reference: raw.nativeId || undefined,
    memo: raw.memo || raw.descriptor || undefined,
    currency: raw.amountAsMoney?.currency || undefined,
    totalAmount: totalCents,
    contacts: contacts.length > 0 ? contacts : undefined,
    createdAt: raw.timestamp ? new Date(raw.timestamp) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
