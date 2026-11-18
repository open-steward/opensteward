import type { Invoice, InvoiceStatus } from '../../../schema/invoice'

export interface FreeAgentInvoice {
  url: string
  contact: string
  project: string
  invoice_number: string
  reference: string
  dated_on: string
  payment_terms_in_days: number
  currency: string
  net_value: string
  total_value: string
  paid_value: string
  due_value: string
  status: 'Draft' | 'Scheduled' | 'Sent' | 'Email Scheduled' | 'Overdue' | 'Partly Paid' | 'Paid' | 'Void'
  [key: string]: unknown
}

function extractId(url: string): string {
  return url.split('/').pop() ?? url
}

function mapStatus(raw: FreeAgentInvoice): InvoiceStatus {
  switch (raw.status) {
    case 'Draft':
    case 'Scheduled': return 'DRAFT'
    case 'Sent':
    case 'Email Scheduled': return 'AUTHORIZED'
    case 'Overdue': return 'OVERDUE'
    case 'Partly Paid': return 'PARTIALLY_PAID'
    case 'Paid': return 'PAID'
    case 'Void': return 'VOIDED'
    default: return 'DRAFT'
  }
}

export function transformInvoice(raw: FreeAgentInvoice): Invoice {
  const paymentTermsDays = raw.payment_terms_in_days ?? 0
  const postedAt = raw.dated_on ? new Date(raw.dated_on) : undefined
  const dueAt = postedAt && paymentTermsDays
    ? new Date(postedAt.getTime() + paymentTermsDays * 86400 * 1000)
    : undefined

  return {
    id: extractId(raw.url),
    type: 'INVOICE',
    status: mapStatus(raw),
    invoiceNumber: raw.invoice_number || undefined,
    contactId: raw.contact ? extractId(raw.contact) : undefined,
    currency: raw.currency || undefined,
    totalAmount: parseFloat(raw.total_value) || undefined,
    balanceAmount: parseFloat(raw.due_value) || undefined,
    paidAmount: parseFloat(raw.paid_value) || undefined,
    reference: raw.reference || undefined,
    postedAt,
    dueAt,
    metadata: raw as Record<string, unknown>,
  }
}
