import type { Bill, BillStatus } from '../../../schema/bill'

export interface RegateBill {
  id: string
  invoice_number: string
  supplier_id: string
  gross_amount_cents: number
  vat_amount_cents: number
  including_taxes_amount_cents: number
  paid_amount_cents: number
  currency: string
  issue_date: string
  due_date: string
  state: string
  [key: string]: unknown
}

function mapStatus(state: string): BillStatus {
  switch (state) {
    case 'received':
    case 'recorded': return 'AUTHORIZED'
    case 'paid':
    case 'reconciled': return 'PAID'
    case 'excluded': return 'VOIDED'
    default: return 'DRAFT'
  }
}

export function transformBill(raw: RegateBill): Bill {
  const totalCents = raw.including_taxes_amount_cents ?? 0
  const taxCents = raw.vat_amount_cents ?? 0
  const paidCents = raw.paid_amount_cents ?? 0
  return {
    id: String(raw.id),
    status: mapStatus(raw.state),
    billNumber: raw.invoice_number || undefined,
    contactId: raw.supplier_id || undefined,
    currency: raw.currency || undefined,
    totalAmount: totalCents / 100,
    taxAmount: taxCents / 100,
    balanceAmount: (totalCents - paidCents) / 100,
    postedAt: raw.issue_date ? new Date(raw.issue_date) : undefined,
    dueAt: raw.due_date ? new Date(raw.due_date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
