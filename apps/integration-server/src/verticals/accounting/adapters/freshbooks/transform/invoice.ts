import type { Invoice, InvoiceStatus } from '../../../schema/invoice'

export interface FreshBooksLine {
  lineid: number
  name: string
  description: string
  unit_cost: { amount: string; code: string }
  qty: string
  taxName1: string
  taxAmount1: string
  amount: { amount: string; code: string }
}

export interface FreshBooksInvoice {
  id: number
  invoice_number: string
  customerid: number
  create_date: string
  due_date: string
  currency_code: string
  amount: { amount: string; code: string }
  outstanding: { amount: string; code: string }
  paid: { amount: string; code: string }
  status: number  // 1=draft, 2=created, 4=sent, 5=viewed, 6=outstanding, 7=overdue, 8=replied, 9=partial, 10=paid, 11=auto-paid, 12=disputed
  v3_status: string
  lines: FreshBooksLine[]
  [key: string]: unknown
}

function mapStatus(raw: FreshBooksInvoice): InvoiceStatus {
  switch (raw.status) {
    case 1: return 'DRAFT'
    case 2:
    case 4:
    case 5:
    case 6: return 'AUTHORIZED'
    case 7: return 'OVERDUE'
    case 8:
    case 9: return 'PARTIALLY_PAID'
    case 10:
    case 11: return 'PAID'
    case 12: return 'VOIDED'
    default: return 'DRAFT'
  }
}

export function transformInvoice(raw: FreshBooksInvoice): Invoice {
  return {
    id: String(raw.id),
    type: 'INVOICE',
    status: mapStatus(raw),
    invoiceNumber: raw.invoice_number || undefined,
    contactId: raw.customerid ? String(raw.customerid) : undefined,
    currency: raw.currency_code || undefined,
    totalAmount: raw.amount?.amount ? parseFloat(raw.amount.amount) : undefined,
    balanceAmount: raw.outstanding?.amount ? parseFloat(raw.outstanding.amount) : undefined,
    paidAmount: raw.paid?.amount ? parseFloat(raw.paid.amount) : undefined,
    lineItems: (raw.lines ?? []).map((l) => ({
      id: String(l.lineid),
      itemDescription: l.description || l.name || undefined,
      unitAmount: l.unit_cost?.amount ? parseFloat(l.unit_cost.amount) : undefined,
      unitQuantity: l.qty ? parseFloat(l.qty) : undefined,
      totalAmount: l.amount?.amount ? parseFloat(l.amount.amount) : undefined,
    })),
    postedAt: raw.create_date ? new Date(raw.create_date) : undefined,
    dueAt: raw.due_date ? new Date(raw.due_date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
