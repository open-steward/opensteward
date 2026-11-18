import type { Bill, BillStatus } from '../../../schema/bill'

export interface MoloniBill {
  document_id: number
  document_set_name: string
  status: number
  date: string
  expiration_date: string
  net_value: number
  taxes: Array<{ value: number; [key: string]: unknown }>
  currency_code: string
  supplier_id: number
  [key: string]: unknown
}

function mapStatus(status: number): BillStatus {
  if (status === 2) return 'VOIDED'
  if (status === 1) return 'AUTHORIZED'
  return 'DRAFT'
}

export function transformBill(raw: MoloniBill): Bill {
  const taxAmount = (raw.taxes ?? []).reduce((sum, t) => sum + (t.value ?? 0), 0)

  return {
    id: String(raw.document_id),
    status: mapStatus(raw.status),
    billNumber: raw.document_set_name || undefined,
    contactId: raw.supplier_id ? String(raw.supplier_id) : undefined,
    currency: raw.currency_code || undefined,
    totalAmount: raw.net_value,
    taxAmount: taxAmount || undefined,
    postedAt: raw.date ? new Date(raw.date) : undefined,
    dueAt: raw.expiration_date ? new Date(raw.expiration_date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
