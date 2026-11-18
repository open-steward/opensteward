import type { Bill, BillStatus } from '../../../schema/bill'
import type { MorningDocument } from './invoice'

function mapStatus(status: number): BillStatus {
  switch (status) {
    case 0: return 'DRAFT'
    case 1: return 'AUTHORIZED'
    case 2: return 'PAID'
    case -1: return 'VOIDED'
    default: return 'DRAFT'
  }
}

export function transformBill(raw: MorningDocument): Bill {
  return {
    id: raw.id,
    status: mapStatus(raw.status),
    billNumber: raw.number,
    contactId: raw.client?.id || undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.sum,
    taxAmount: raw.vat,
    notes: raw.description as string | undefined,
    postedAt: raw.date ? new Date(raw.date) : undefined,
    dueAt: raw.dueDate ? new Date(raw.dueDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
