import { toCalendarDate } from '../../shared/transform'
import type { PurchaseOrder, PurchaseOrderStatus } from '../../../schema/purchaseorder'
import type { Lineitem } from '../../../schema/shared'

export interface FikenPurchaseOrderLine {
  netPrice: number
  vatAmount: number
  grossPrice: number
  description: string
  accountCode: string
  vatType: string
  [key: string]: unknown
}

export interface FikenPurchaseOrder {
  purchaseOrderId: number
  identifier: string
  supplierId: number
  currency: string
  net: number
  vat: number
  gross: number
  date: string
  status: string
  lines: FikenPurchaseOrderLine[]
  [key: string]: unknown
}

function mapStatus(status: string): PurchaseOrderStatus {
  switch (status) {
    case 'completed':
    case 'received':
      return 'COMPLETED'
    case 'cancelled':
      return 'CANCELLED'
    case 'draft':
      return 'DRAFT'
    default:
      return 'ACTIVE'
  }
}

function mapLineitem(row: FikenPurchaseOrderLine): Lineitem {
  return {
    itemDescription: row.description || undefined,
    totalAmount: row.grossPrice,
    taxAmount: row.vatAmount || undefined,
    accountId: row.accountCode || undefined,
  }
}

export function transformPurchaseOrder(raw: FikenPurchaseOrder): PurchaseOrder {
  return {
    id: String(raw.purchaseOrderId),
    status: mapStatus(raw.status),
    contactId: raw.supplierId ? String(raw.supplierId) : undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.gross,
    lineItems: (raw.lines ?? []).map(mapLineitem),
    postedAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformPurchaseOrder(
  order: Partial<PurchaseOrder>,
): Record<string, unknown> {
  return {
    supplierId: order.contactId ? Number(order.contactId) : undefined,
    currency: order.currency,
    date: toCalendarDate(order.postedAt),
    lines: order.lineItems?.map((li) => ({
      description: li.itemDescription,
      accountCode: li.accountId,
    })),
  }
}
