import { toCalendarDate } from '../../shared/transform'
import type { PurchaseOrder, PurchaseOrderStatus } from '../../../schema/purchaseorder'
import type { Lineitem } from '../../../schema/shared'

export interface HorizonErpPurchaseOrderLineItem {
  id: string
  name: string
  description: string
  qty: number
  rate: number
  amount: number
  tax_amount: number
  account_id: string
  [key: string]: unknown
}

export interface HorizonErpPurchaseOrder {
  id: string
  order_no: string
  order_date: string
  total_amount: number
  status: string
  supplier_id: string
  currency: string
  line_items: HorizonErpPurchaseOrderLineItem[]
  [key: string]: unknown
}

function mapStatus(status: string): PurchaseOrderStatus {
  switch (status) {
    case 'draft': return 'DRAFT'
    case 'open':
    case 'active': return 'ACTIVE'
    case 'completed': return 'COMPLETED'
    case 'cancelled': return 'CANCELLED'
    default: return 'DRAFT'
  }
}

function mapLineitem(item: HorizonErpPurchaseOrderLineItem): Lineitem {
  return {
    id: String(item.id),
    itemName: item.name || undefined,
    itemDescription: item.description || undefined,
    unitQuantity: item.qty,
    unitAmount: item.rate,
    totalAmount: item.amount,
    taxAmount: item.tax_amount,
    accountId: item.account_id || undefined,
  }
}

export function transformPurchaseOrder(raw: HorizonErpPurchaseOrder): PurchaseOrder {
  return {
    id: String(raw.id),
    status: mapStatus(raw.status),
    contactId: raw.supplier_id || undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.total_amount,
    lineItems: (raw.line_items ?? []).map(mapLineitem),
    postedAt: raw.order_date ? new Date(raw.order_date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformPurchaseOrder(po: Partial<PurchaseOrder>): Record<string, unknown> {
  return {
    supplier_id: po.contactId,
    currency: po.currency,
    order_date: toCalendarDate(po.postedAt),
    line_items: po.lineItems?.map((li) => ({
      name: li.itemName,
      description: li.itemDescription,
      qty: li.unitQuantity,
      rate: li.unitAmount,
      account_id: li.accountId,
    })),
  }
}
