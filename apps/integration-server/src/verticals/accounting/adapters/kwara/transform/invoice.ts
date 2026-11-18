import type { Invoice, InvoiceStatus } from '../../../schema/invoice'

export interface KwaraLoan {
  id: string
  loan_number?: string
  disbursed_date?: string
  due_date?: string
  amount?: number
  accrued_interest?: number
  total_balance?: number
  state?: string
  member_id?: string
  [key: string]: unknown
}

function mapStatus(state?: string): InvoiceStatus {
  switch (state) {
    case 'active':
      return 'AUTHORIZED'
    case 'closed':
      return 'PAID'
    case 'written_off':
      return 'VOIDED'
    case 'pending':
    default:
      return 'DRAFT'
  }
}

export function transformInvoice(raw: KwaraLoan): Invoice {
  const principal = raw.amount ?? 0
  const interest = raw.accrued_interest ?? 0
  return {
    id: raw.id,
    type: 'INVOICE',
    status: mapStatus(raw.state),
    invoiceNumber: raw.loan_number || undefined,
    contactId: raw.member_id || undefined,
    totalAmount: principal + interest,
    taxAmount: interest,
    balanceAmount: raw.total_balance,
    postedAt: raw.disbursed_date ? new Date(raw.disbursed_date) : undefined,
    dueAt: raw.due_date ? new Date(raw.due_date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
