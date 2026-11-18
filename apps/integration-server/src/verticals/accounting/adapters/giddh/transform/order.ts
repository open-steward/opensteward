import type { Order, OrderStatus } from '../../../schema/order'
import type { Lineitem } from '../../../schema/shared'

export interface GiddhOrderEntry {
  uniqueName: string
  description: string
  quantity: number
  rate: number
  amount: number
  accountUniqueName: string
  accountName: string
  [key: string]: unknown
}

export interface GiddhOrderVoucherAccount {
  uniqueName: string
  name: string
  [key: string]: unknown
}

export interface GiddhOrderVoucher {
  uniqueName: string
  number: string
  voucherDate: string
  dueDate: string
  grandTotal: number
  taxesTotal: number
  account: GiddhOrderVoucherAccount
  status: string
  entries: GiddhOrderEntry[]
  [key: string]: unknown
}

function mapStatus(status: string): OrderStatus {
  switch (status?.toLowerCase()) {
    case 'draft':
      return 'DRAFT'
    case 'cancelled':
      return 'CANCELLED'
    case 'completed':
    case 'invoiced':
      return 'COMPLETED'
    default:
      return 'ACTIVE'
  }
}

function mapLineitem(entry: GiddhOrderEntry): Lineitem {
  return {
    accountId: entry.accountUniqueName || undefined,
    itemDescription: entry.description || undefined,
    unitAmount: entry.rate,
    unitQuantity: entry.quantity,
    totalAmount: entry.amount,
  }
}

export function transformOrder(raw: GiddhOrderVoucher): Order {
  return {
    id: raw.uniqueName,
    status: mapStatus(raw.status),
    type: 'SALES',
    contactId: raw.account?.uniqueName || undefined,
    totalAmount: raw.grandTotal,
    lineItems: (raw.entries ?? []).map(mapLineitem),
    postedAt: raw.voucherDate ? new Date(raw.voucherDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
