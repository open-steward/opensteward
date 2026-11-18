import type { Order, OrderStatus } from '../../../schema/order'

export interface LexofficeQuotation {
  id: string
  voucherNumber: string
  voucherDate: string
  expirationDate: string
  contactId: string
  totalAmount: number
  currency: string
  voucherStatus: 'draft' | 'open' | 'accepted' | 'rejected' | 'expired'
  [key: string]: unknown
}

function mapStatus(status: LexofficeQuotation['voucherStatus']): OrderStatus {
  switch (status) {
    case 'accepted': return 'COMPLETED'
    case 'rejected':
    case 'expired': return 'CANCELLED'
    default: return 'ACTIVE'
  }
}

export function transformOrder(raw: LexofficeQuotation): Order {
  return {
    id: raw.id,
    status: mapStatus(raw.voucherStatus),
    type: 'SALES',
    contactId: raw.contactId || undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.totalAmount,
    postedAt: raw.voucherDate ? new Date(raw.voucherDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
