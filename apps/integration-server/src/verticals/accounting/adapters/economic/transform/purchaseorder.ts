import { toCalendarDate } from '../../shared/transform'
import type { PurchaseOrder, PurchaseOrderStatus } from '../../../schema/purchaseorder'
import type { Lineitem } from '../../../schema/shared'

export interface EconomicPurchaseOrderLine {
  lineNumber: number
  description: string
  product: { productNumber: string; name: string } | null
  quantity: number
  unitNetPrice: number
  totalNetAmount: number
  [key: string]: unknown
}

export interface EconomicPurchaseOrder {
  orderNumber: number
  date: string
  currency: string
  netAmount: number
  grossAmount: number
  supplier: { supplierNumber: number; name: string } | null
  lines: EconomicPurchaseOrderLine[]
  isArchived: boolean
  isSent: boolean
  [key: string]: unknown
}

function mapStatus(order: EconomicPurchaseOrder): PurchaseOrderStatus {
  if (order.isArchived) return 'COMPLETED'
  return 'ACTIVE'
}

function mapLineitem(row: EconomicPurchaseOrderLine): Lineitem {
  return {
    id: String(row.lineNumber),
    itemId: row.product?.productNumber || undefined,
    itemDescription: row.description || undefined,
    unitAmount: row.unitNetPrice,
    unitQuantity: row.quantity,
    totalAmount: row.totalNetAmount,
  }
}

export function transformPurchaseOrder(raw: EconomicPurchaseOrder): PurchaseOrder {
  return {
    id: String(raw.orderNumber),
    status: mapStatus(raw),
    contactId: raw.supplier?.supplierNumber ? String(raw.supplier.supplierNumber) : undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.grossAmount,
    lineItems: (raw.lines ?? []).map(mapLineitem),
    postedAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformPurchaseOrder(order: Partial<PurchaseOrder>): Record<string, unknown> {
  return {
    date: toCalendarDate(order.postedAt),
    currency: order.currency,
    supplier: order.contactId ? { supplierNumber: Number(order.contactId) } : undefined,
    lines: order.lineItems?.map((li, i) => ({
      lineNumber: i + 1,
      description: li.itemDescription,
      product: li.itemId ? { productNumber: li.itemId } : undefined,
      quantity: li.unitQuantity,
      unitNetPrice: li.unitAmount,
    })),
  }
}
