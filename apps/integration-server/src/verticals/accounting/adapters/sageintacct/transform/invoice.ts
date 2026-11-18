import type { Invoice, InvoiceStatus } from '../../../schema/invoice'

export interface IntacctInvoice {
  RECORDNO: string
  RECORDID: string
  CUSTOMERID: string
  TOTALENTERED: string
  TOTALPAID: string
  TOTALDUE: string
  CURRENCY: string
  WHENCREATED: string
  WHENDUE: string
  STATE: 'Draft' | 'Posted' | 'Paid' | 'Reversed'
  [key: string]: unknown
}

function mapStatus(raw: IntacctInvoice): InvoiceStatus {
  const totalDue = parseFloat(raw.TOTALDUE)
  const totalPaid = parseFloat(raw.TOTALPAID)
  switch (raw.STATE) {
    case 'Draft':
      return 'DRAFT'
    case 'Posted':
      if (totalDue === 0) return 'PAID'
      if (totalPaid > 0 && totalDue > 0) return 'PARTIALLY_PAID'
      return 'AUTHORIZED'
    case 'Paid':
      return 'PAID'
    case 'Reversed':
      return 'VOIDED'
    default:
      return 'DRAFT'
  }
}

export function transformInvoice(raw: IntacctInvoice): Invoice {
  return {
    id: raw.RECORDNO,
    type: 'INVOICE',
    status: mapStatus(raw),
    invoiceNumber: raw.RECORDID || undefined,
    contactId: raw.CUSTOMERID || undefined,
    currency: raw.CURRENCY || undefined,
    totalAmount: parseFloat(raw.TOTALENTERED),
    paidAmount: parseFloat(raw.TOTALPAID),
    balanceAmount: parseFloat(raw.TOTALDUE),
    postedAt: raw.WHENCREATED ? new Date(raw.WHENCREATED) : undefined,
    dueAt: raw.WHENDUE ? new Date(raw.WHENDUE) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
