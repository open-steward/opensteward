import type { Bill, BillStatus } from '../../../schema/bill'

// Purchase invoices in Paraşüt have item_type='purchase_bill'
export interface ParasutBill {
  id: string
  type: string
  attributes: {
    item_type?: string
    status?: string  // 'draft' | 'sent' | 'cancelled' | 'paid'
    invoice_no?: string
    net_total?: number
    gross_total?: number
    vat_total?: number
    due_date?: string
    issue_date?: string
    currency?: string
    contact_id?: string
  }
  [key: string]: unknown
}

function mapStatus(status?: string): BillStatus {
  switch (status) {
    case 'sent': return 'AUTHORIZED'
    case 'paid': return 'PAID'
    case 'cancelled': return 'VOIDED'
    default: return 'DRAFT'
  }
}

export function transformBill(raw: ParasutBill): Bill {
  const attrs = raw.attributes ?? {}
  return {
    id: raw.id,
    status: mapStatus(attrs.status),
    billNumber: attrs.invoice_no || undefined,
    contactId: attrs.contact_id ? String(attrs.contact_id) : undefined,
    currency: attrs.currency || undefined,
    totalAmount: attrs.gross_total,
    taxAmount: attrs.vat_total,
    postedAt: attrs.issue_date ? new Date(attrs.issue_date) : undefined,
    dueAt: attrs.due_date ? new Date(attrs.due_date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
