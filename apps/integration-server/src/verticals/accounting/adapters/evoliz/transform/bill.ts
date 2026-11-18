import type { Bill, BillStatus } from '../../../schema/bill'

// Evoliz represents purchase bills as "buys" — fetched from /buys endpoint.
export interface EvolizBill {
  id: string
  external_document_number: string
  supplierid: string
  total_ht: number
  total_taxes: number
  total_ttc: number
  balance_due: number
  currency: string
  documentdate: string
  term: { duedate?: string }
  status: string
  [key: string]: unknown
}

function mapStatus(status: string): BillStatus {
  switch (status) {
    case 'created':
    case 'sent': return 'AUTHORIZED'
    case 'paid': return 'PAID'
    case 'cancelled': return 'VOIDED'
    default: return 'DRAFT'
  }
}

export function transformBill(raw: EvolizBill): Bill {
  return {
    id: String(raw.id),
    status: mapStatus(raw.status),
    billNumber: raw.external_document_number || undefined,
    contactId: raw.supplierid ? String(raw.supplierid) : undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.total_ttc,
    taxAmount: raw.total_taxes,
    balanceAmount: raw.balance_due,
    postedAt: raw.documentdate ? new Date(raw.documentdate) : undefined,
    dueAt: raw.term?.duedate ? new Date(raw.term.duedate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
