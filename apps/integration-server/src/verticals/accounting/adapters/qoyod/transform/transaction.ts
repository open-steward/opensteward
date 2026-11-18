import type { Transaction } from '../../../schema/transaction'
import type { TransactionLineitem } from '../../../schema/shared'

// Qoyod "receipts" / "invoice_payments" — payments collected against invoices
export interface QoyodPayment {
  id: number
  reference?: string | null
  customer_id?: number | null
  customer_name?: string | null
  invoice_id?: number | null
  date?: string | null
  amount?: number | null
  currency?: string | null
  payment_method?: string | null
  account_id?: number | null
  notes?: string | null
  [key: string]: unknown
}

export function transformTransaction(raw: QoyodPayment): Transaction {
  const lineItems: TransactionLineitem[] = [
    {
      accountId: raw.account_id != null ? String(raw.account_id) : undefined,
      name: raw.payment_method || undefined,
      totalAmount: raw.amount ?? undefined,
    },
  ]

  return {
    id: String(raw.id),
    accountId: raw.account_id != null ? String(raw.account_id) : undefined,
    type: raw.payment_method || undefined,
    reference: raw.invoice_id != null ? String(raw.invoice_id) : (raw.reference || undefined),
    currency: raw.currency || undefined,
    totalAmount: raw.amount ?? undefined,
    contacts:
      raw.customer_id != null
        ? [{ id: String(raw.customer_id), name: raw.customer_name || undefined }]
        : undefined,
    lineItems,
    createdAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
