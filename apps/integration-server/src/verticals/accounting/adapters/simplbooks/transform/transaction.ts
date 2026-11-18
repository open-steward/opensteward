import type { Transaction } from '../../../schema/transaction'

// SimplBooks bank/cash transaction record
export interface SimplbooksTransaction {
  id: number
  account_id?: number | null
  account_code?: string | null
  currency?: string | null
  total?: number | null
  total_vat?: number | null
  payment_method?: string | null
  reference?: string | null
  description?: string | null
  transaction_date?: string | null  // YYYY-MM-DD
  supplier_id?: number | null
  client_id?: number | null
  [key: string]: unknown
}

export function transformTransaction(raw: SimplbooksTransaction): Transaction {
  const contactId =
    raw.client_id != null
      ? String(raw.client_id)
      : raw.supplier_id != null
        ? String(raw.supplier_id)
        : undefined

  return {
    id: String(raw.id),
    accountId: raw.account_id != null ? String(raw.account_id) : (raw.account_code || undefined),
    reference: raw.reference || undefined,
    memo: raw.description || undefined,
    paymentMethod: raw.payment_method || undefined,
    currency: raw.currency || undefined,
    taxAmount: raw.total_vat ?? undefined,
    totalAmount: raw.total ?? undefined,
    contacts: contactId ? [{ id: contactId }] : undefined,
    createdAt: raw.transaction_date ? new Date(raw.transaction_date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
