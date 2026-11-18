import type { Bill, BillStatus } from '../../../schema/bill'

export interface BexioBill {
  id: number
  document_nr: string
  contact_id: number
  currency_id: number
  currency_code: string
  is_valid_from: string
  is_valid_to: string
  kb_item_status: string
  total_gross: number
  total_taxes: number
  total_remaining_payments: number
  total_received_payments: number
  [key: string]: unknown
}

function mapStatus(raw: BexioBill): BillStatus {
  switch (raw.kb_item_status) {
    case 'draft':
      return 'DRAFT'
    case 'pending':
      return 'AUTHORIZED'
    case 'paid':
      return 'PAID'
    case 'partial':
      return 'PARTIALLY_PAID'
    case 'cancelled':
      return 'VOIDED'
    default:
      return 'DRAFT'
  }
}

export function transformBill(raw: BexioBill): Bill {
  return {
    id: String(raw.id),
    status: mapStatus(raw),
    billNumber: raw.document_nr || undefined,
    contactId: raw.contact_id ? String(raw.contact_id) : undefined,
    currency: raw.currency_code || undefined,
    totalAmount: raw.total_gross,
    taxAmount: raw.total_taxes,
    balanceAmount: raw.total_remaining_payments,
    paidAmount: raw.total_received_payments || undefined,
    postedAt: raw.is_valid_from ? new Date(raw.is_valid_from) : undefined,
    dueAt: raw.is_valid_to ? new Date(raw.is_valid_to) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
