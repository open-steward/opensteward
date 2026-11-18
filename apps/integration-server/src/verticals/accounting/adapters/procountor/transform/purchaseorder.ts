import { toCalendarDate } from '../../shared/transform'
import type { PurchaseOrder, PurchaseOrderStatus } from '../../../schema/purchaseorder'
import type { Lineitem } from '../../../schema/shared'

export interface ProcountorPurchaseOrderRow {
  id: number
  product: string
  description: string
  quantity: number
  unitPrice: number
  sum: number
  accountNumber: string
  [key: string]: unknown
}

export interface ProcountorPurchaseOrder {
  id: number
  orderNumber: number
  partnerId: number
  currency: string
  date: string
  sum: number
  vatAmount: number
  status: string
  orderRows: ProcountorPurchaseOrderRow[]
  [key: string]: unknown
}

function mapStatus(status: string): PurchaseOrderStatus {
  switch (status) {
    case 'RECEIVED':
    case 'COMPLETED':
      return 'COMPLETED'
    case 'CANCELLED':
      return 'CANCELLED'
    case 'EMPTY':
    case 'UNFINISHED':
      return 'DRAFT'
    default:
      return 'ACTIVE'
  }
}

function mapLineitem(row: ProcountorPurchaseOrderRow): Lineitem {
  return {
    id: String(row.id),
    accountId: row.accountNumber || undefined,
    itemId: row.product || undefined,
    itemDescription: row.description || undefined,
    unitAmount: row.unitPrice,
    unitQuantity: row.quantity,
    totalAmount: row.sum,
  }
}

export function transformPurchaseOrder(raw: ProcountorPurchaseOrder): PurchaseOrder {
  return {
    id: String(raw.id),
    status: mapStatus(raw.status),
    contactId: raw.partnerId ? String(raw.partnerId) : undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.sum,
    lineItems: (raw.orderRows ?? []).map(mapLineitem),
    postedAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformPurchaseOrder(order: Partial<PurchaseOrder>): Record<string, unknown> {
  return {
    partnerId: order.contactId ? Number(order.contactId) : undefined,
    currency: order.currency,
    date: toCalendarDate(order.postedAt),
    orderRows: order.lineItems?.map((li) => ({
      product: li.itemId,
      description: li.itemDescription,
      unitPrice: li.unitAmount,
      quantity: li.unitQuantity,
      accountNumber: li.accountId,
    })),
  }
}
