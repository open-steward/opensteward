import type { Invoice, InvoiceStatus } from '../../../schema/invoice'
import { decimalToMinor, pickCurrency, strMap } from './shared'

export interface RawMollieInvoice {
  id?: string
  reference?: string
  status?: string
  netAmount?: { value?: string; currency?: string }
  grossAmount?: { value?: string; currency?: string }
  issuedAt?: string
  paidAt?: string
  dueAt?: string
  [k: string]: unknown
}

function mapStatus(raw: RawMollieInvoice): InvoiceStatus {
  switch ((raw.status ?? '').toLowerCase()) {
    case 'paid':
      return 'paid'
    case 'open':
      return 'open'
    case 'concept':
    case 'draft':
      return 'draft'
    case 'overdue':
      return 'uncollectible'
    default:
      return 'open'
  }
}

export function transformInvoice(raw: RawMollieInvoice): Invoice {
  return {
    id: String(raw.id ?? ''),
    externalId: String(raw.id ?? ''),
    number: raw.reference,
    status: mapStatus(raw),
    currency: pickCurrency(raw.grossAmount?.currency),
    total: decimalToMinor(raw.grossAmount?.value),
    dueDate: raw.dueAt,
    paidAt: raw.paidAt,
    gateway: 'mollie',
    metadata: strMap({}),
    createdAt: raw.issuedAt,
    raw,
  }
}
