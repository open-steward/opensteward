import type { Transaction } from '../../../schema/transaction'
import type { TransactionLineitem } from '../../../schema/shared'

/** Convert a Payhawk decimal float amount to integer minor units (cents). */
function toMinorUnits(value: number | undefined | null): number | undefined {
  if (value == null) return undefined
  return Math.round(value * 100)
}

// Payhawk bank-statement entry (fund account statement line)
// Docs: GET /api/v3/accounts/{accountId}/fund-accounts/{fundAccountId}/bank-statement
export interface PayhawkBankStatementEntry {
  id?: string
  type?: string                 // "debit" | "credit"
  paymentId?: string
  fundAccountId?: string
  date?: string                 // ISO date-time
  currency?: string
  paidCurrency?: string
  amount?: number
  paidAmount?: number
  description?: string
  fxRate?: number
  expenseIds?: string[]
  /**
   * IExpensePaymentFees: one amount per kind of fee, all three required.
   * An object, not a list: iterating it threw on every real line.
   */
  fees?: {
    fx?: number
    pos?: number
    bank?: number
  }
  [key: string]: unknown
}

const FEE_KINDS = [
  ['fx', 'FX fee'],
  ['pos', 'POS fee'],
  ['bank', 'Bank fee'],
] as const

function mapLineitems(raw: PayhawkBankStatementEntry): TransactionLineitem[] {
  const items: TransactionLineitem[] = []

  if (raw.amount != null) {
    items.push({
      name: raw.type || undefined,
      description: raw.description || undefined,
      totalAmount: toMinorUnits(raw.amount),
    })
  }

  // A fee of 0 is the platform saying there was none of that kind.
  for (const [kind, label] of FEE_KINDS) {
    const amount = raw.fees?.[kind]
    if (typeof amount !== 'number' || amount === 0) continue
    items.push({ name: 'fee', description: label, totalAmount: toMinorUnits(amount) })
  }

  return items
}

export function transformTransaction(raw: PayhawkBankStatementEntry): Transaction {
  const lineItems = mapLineitems(raw)
  return {
    id: raw.id || undefined,
    type: raw.type || undefined,
    memo: raw.description || undefined,
    currency: raw.currency || undefined,
    totalAmount: toMinorUnits(raw.amount),
    lineItems: lineItems.length > 0 ? lineItems : undefined,
    createdAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
