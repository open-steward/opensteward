import type { Invoice, InvoiceStatus } from '../../../schema/invoice'

export interface MoloniInvoice {
  document_id: number
  document_set_name: string
  status: number
  date: string
  expiration_date: string
  net_value: number
  global_discount: number
  taxes: Array<{ value: number; [key: string]: unknown }>
  currency_code: string
  client_id: number
  [key: string]: unknown
}

function mapStatus(status: number): InvoiceStatus {
  if (status === 2) return 'VOIDED'
  if (status === 1) return 'AUTHORIZED'
  return 'DRAFT'
}

export function transformInvoice(raw: MoloniInvoice): Invoice {
  const taxAmount = (raw.taxes ?? []).reduce((sum, t) => sum + (t.value ?? 0), 0)

  return {
    id: String(raw.document_id),
    type: 'INVOICE',
    status: mapStatus(raw.status),
    invoiceNumber: raw.document_set_name || undefined,
    contactId: raw.client_id ? String(raw.client_id) : undefined,
    currency: raw.currency_code || undefined,
    totalAmount: raw.net_value,
    taxAmount: taxAmount || undefined,
    discountAmount: raw.global_discount || undefined,
    postedAt: raw.date ? new Date(raw.date) : undefined,
    dueAt: raw.expiration_date ? new Date(raw.expiration_date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
