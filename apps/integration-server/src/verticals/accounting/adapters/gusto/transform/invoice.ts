import type { Invoice, InvoiceStatus } from '../../../schema/invoice'
import type { Lineitem } from '../../../schema/shared'

export interface GustoPayrollLine {
  id: string | number
  description: string
  amount: number
  [key: string]: unknown
}

export interface GustoInvoice {
  id: string | number
  status: string
  check_date: string
  processed_date: string
  company_id: string | number
  gross_pay: number
  net_pay: number
  employee_taxes: number
  currency?: string
  lines?: GustoPayrollLine[]
  [key: string]: unknown
}

function mapStatus(status: string): InvoiceStatus {
  switch (status) {
    case 'processed':
      return 'PAID'
    case 'unprocessed':
      return 'DRAFT'
    case 'void':
      return 'VOIDED'
    default:
      return 'DRAFT'
  }
}

function mapLineitem(line: GustoPayrollLine): Lineitem {
  return {
    id: String(line.id),
    itemDescription: line.description || undefined,
    totalAmount: line.amount,
  }
}

export function transformInvoice(raw: GustoInvoice): Invoice {
  return {
    id: String(raw.id),
    type: 'INVOICE',
    status: mapStatus(raw.status),
    contactId: raw.company_id ? String(raw.company_id) : undefined,
    currency: raw.currency || 'USD',
    totalAmount: raw.gross_pay,
    paidAmount: raw.status === 'processed' ? raw.net_pay : undefined,
    taxAmount: raw.employee_taxes,
    lineItems: (raw.lines ?? []).map(mapLineitem),
    postedAt: raw.check_date ? new Date(raw.check_date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
