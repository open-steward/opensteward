import type { Transaction, TransactionContact } from '../../../schema/transaction'
import type { TransactionLineitem } from '../../../schema/shared'
import { toMinorUnits } from '../../shared/transform'

// Campfire transaction response shape (GET /coa/api/transaction and /coa/api/transaction/{id})
// These are GL/chart transactions tied to accounts, vendors, and journal entries.
export interface CampfireTransaction {
  id: number
  account?: number | null
  account_name?: string | null
  entity?: number | null
  vendor?: number | null
  vendor_name?: string | null
  merchant_name?: string | null
  department?: number | null
  department_name?: string | null
  memo?: string | null
  posted_at?: string | null
  created_at?: string | null
  last_modified_at?: string | null
  currency?: string | null
  amount?: number | null
  amount_book?: number | null
  amount_native?: number | null
  debit_amount?: number | null
  credit_amount?: number | null
  debit_amount_native?: number | null
  credit_amount_native?: number | null
  [key: string]: unknown
}

function mapContact(raw: CampfireTransaction): TransactionContact[] {
  const contacts: TransactionContact[] = []
  if (raw.vendor != null || raw.vendor_name || raw.merchant_name) {
    contacts.push({
      id: raw.vendor != null ? String(raw.vendor) : undefined,
      name: raw.vendor_name || raw.merchant_name || undefined,
    })
  }
  return contacts
}

export function transformTransaction(raw: CampfireTransaction): Transaction {
  // Campfire amounts are decimal dollars; canonical is integer minor units.
  // Use amount (consolidated) as total; derive sub-totals from debit/credit if present.
  const totalAmount = toMinorUnits(raw.amount)
  const debitAmount = toMinorUnits(raw.debit_amount)
  const creditAmount = toMinorUnits(raw.credit_amount)

  // Build a single line item representing the GL transaction entry.
  const lineItems: TransactionLineitem[] = raw.account != null
    ? [
        {
          accountId: String(raw.account),
          name: raw.account_name || undefined,
          description: raw.memo || undefined,
          totalAmount,
        },
      ]
    : []

  return {
    id: String(raw.id),
    accountId: raw.account != null ? String(raw.account) : undefined,
    type: debitAmount != null && debitAmount > 0 ? 'DEBIT' : creditAmount != null && creditAmount > 0 ? 'CREDIT' : undefined,
    memo: raw.memo || undefined,
    currency: raw.currency || undefined,
    totalAmount,
    contacts: mapContact(raw),
    lineItems,
    createdAt: raw.created_at ? new Date(raw.created_at) : undefined,
    updatedAt: raw.last_modified_at ? new Date(raw.last_modified_at) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
