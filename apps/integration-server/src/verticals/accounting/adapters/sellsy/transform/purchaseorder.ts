import { toCalendarDate } from '../../shared/transform'
import type { PurchaseOrder, PurchaseOrderStatus } from '../../../schema/purchaseorder'
import type { Lineitem } from '../../../schema/shared'

export interface SellsyPurchaseOrderLine {
  id: string
  product_id: string
  description: string
  quantity: number
  unit_amount: number
  total_amount: number
  tax_amount: number
  account_id: string
  [key: string]: unknown
}

export interface SellsyPurchaseOrder {
  id: string
  number: string
  contact_id: string
  currency: string
  date: string
  status: string
  total_amount: number
  tax_amount: number
  lines: SellsyPurchaseOrderLine[]
  [key: string]: unknown
}

function mapStatus(status: string): PurchaseOrderStatus {
  const s = status?.toLowerCase()
  if (s === 'received' || s === 'completed') return 'COMPLETED'
  if (s === 'cancelled') return 'CANCELLED'
  if (s === 'draft') return 'DRAFT'
  return 'ACTIVE'
}

function mapLineitem(row: SellsyPurchaseOrderLine): Lineitem {
  return {
    id: row.id,
    accountId: row.account_id || undefined,
    itemId: row.product_id || undefined,
    itemDescription: row.description || undefined,
    unitAmount: row.unit_amount,
    unitQuantity: row.quantity,
    totalAmount: row.total_amount,
    taxAmount: row.tax_amount || undefined,
  }
}

export function transformPurchaseOrder(raw: SellsyPurchaseOrder): PurchaseOrder {
  return {
    id: raw.id,
    status: mapStatus(raw.status),
    contactId: raw.contact_id || undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.total_amount,
    lineItems: (raw.lines ?? []).map(mapLineitem),
    postedAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformPurchaseOrder(order: Partial<PurchaseOrder>): Record<string, unknown> {
  return {
    contact_id: order.contactId,
    currency: order.currency,
    date: toCalendarDate(order.postedAt),
    lines: order.lineItems?.map((li) => ({
      product_id: li.itemId,
      description: li.itemDescription,
      unit_amount: li.unitAmount,
      quantity: li.unitQuantity,
      account_id: li.accountId,
    })),
  }
}
