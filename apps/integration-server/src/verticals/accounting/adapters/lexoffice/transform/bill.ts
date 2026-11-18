import type { Bill, BillStatus } from '../../../schema/bill'

export interface LexofficeVoucher {
  id: string
  voucherNumber: string
  voucherDate: string
  dueDate: string
  contactId: string
  totalAmount: number
  openAmount: number
  taxAmount: number
  currency: string
  voucherStatus: 'draft' | 'open' | 'paid' | 'paidoff' | 'voided' | 'transferred'
  [key: string]: unknown
}

function mapStatus(status: LexofficeVoucher['voucherStatus']): BillStatus {
  switch (status) {
    case 'draft': return 'DRAFT'
    case 'open': return 'AUTHORIZED'
    case 'paid':
    case 'paidoff': return 'PAID'
    case 'voided': return 'VOIDED'
    default: return 'DRAFT'
  }
}

export function transformBill(raw: LexofficeVoucher): Bill {
  return {
    id: raw.id,
    status: mapStatus(raw.voucherStatus),
    billNumber: raw.voucherNumber || undefined,
    contactId: raw.contactId || undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.totalAmount,
    taxAmount: raw.taxAmount,
    balanceAmount: raw.openAmount,
    postedAt: raw.voucherDate ? new Date(raw.voucherDate) : undefined,
    dueAt: raw.dueDate ? new Date(raw.dueDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
