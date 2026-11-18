/**
 * Crater payments → canonical Transaction.
 *
 * Crater exposes GET /api/v1/payments (list) and GET /api/v1/payments/{id}.
 * Payments represent received/sent money linked to an invoice.
 */
import type { Transaction, TransactionContact } from '../../../schema/transaction'

// ── Crater wire type ──────────────────────────────────────────────────────────

export interface CraterPayment {
  id: string
  payment_number: string
  payment_date: string
  amount: number
  notes?: string
  status?: string         // PAID | FAILED | PROCESSING
  payment_type?: string   // incoming | outgoing
  invoice_id?: string
  customer_business_id?: string
  vendor_business_id?: string
  payment_method_id?: string
  customer?: { id: string; name?: string }
  vendor?: { id: string; name?: string }
  invoice?: { id: string; invoice_number?: string }
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

// ── Transform ─────────────────────────────────────────────────────────────────

export function transformTransaction(raw: CraterPayment): Transaction {
  const contacts: TransactionContact[] = []
  if (raw.customer) {
    contacts.push({ id: raw.customer.id, name: raw.customer.name ?? undefined })
  } else if (raw.customer_business_id) {
    contacts.push({ id: raw.customer_business_id })
  }
  if (raw.vendor) {
    contacts.push({ id: raw.vendor.id, name: raw.vendor.name ?? undefined })
  } else if (raw.vendor_business_id) {
    contacts.push({ id: raw.vendor_business_id })
  }

  return {
    id: raw.id,
    type: raw.payment_type || undefined,
    reference: raw.invoice?.invoice_number || raw.invoice_id || undefined,
    memo: raw.notes || undefined,
    totalAmount: raw.amount,
    contacts: contacts.length > 0 ? contacts : undefined,
    createdAt: raw.payment_date ? new Date(raw.payment_date) : undefined,
    updatedAt: raw.updated_at ? new Date(raw.updated_at) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
