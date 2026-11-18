import { toCalendarDate } from '../../shared/transform'
import type { PurchaseOrder, PurchaseOrderStatus } from '../../../schema/purchaseorder'
import type { Lineitem } from '../../../schema/shared'

export interface BillyPurchaseOrderLine {
  id: string
  productId: string
  description: string
  quantity: number
  unitPrice: number
  amount: number
  taxRateId: string
  taxAmount: number
  accountId: string
  [key: string]: unknown
}

export interface BillyPurchaseOrder {
  id: string
  orderNo: number
  contactId: string
  currencyId: string
  entryDate: string
  state: string
  grossAmount: number
  taxAmount: number
  purchaseOrderLines: BillyPurchaseOrderLine[]
  organizationId: string
  [key: string]: unknown
}

function mapStatus(state: string): PurchaseOrderStatus {
  if (state === 'received' || state === 'completed') return 'COMPLETED'
  if (state === 'voided' || state === 'cancelled') return 'CANCELLED'
  if (state === 'draft') return 'DRAFT'
  return 'ACTIVE'
}

function mapLineitem(row: BillyPurchaseOrderLine): Lineitem {
  return {
    id: row.id,
    accountId: row.accountId || undefined,
    itemId: row.productId || undefined,
    itemDescription: row.description || undefined,
    unitAmount: row.unitPrice,
    unitQuantity: row.quantity,
    totalAmount: row.amount,
    taxAmount: row.taxAmount || undefined,
    taxrateId: row.taxRateId || undefined,
  }
}

export function transformPurchaseOrder(raw: BillyPurchaseOrder): PurchaseOrder {
  return {
    id: raw.id,
    status: mapStatus(raw.state),
    contactId: raw.contactId || undefined,
    currency: raw.currencyId || undefined,
    totalAmount: raw.grossAmount,
    lineItems: (raw.purchaseOrderLines ?? []).map(mapLineitem),
    postedAt: raw.entryDate ? new Date(raw.entryDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformPurchaseOrder(order: Partial<PurchaseOrder>): Record<string, unknown> {
  return {
    contactId: order.contactId,
    currencyId: order.currency,
    entryDate: toCalendarDate(order.postedAt),
    purchaseOrderLines: order.lineItems?.map((li) => ({
      productId: li.itemId,
      description: li.itemDescription,
      unitPrice: li.unitAmount,
      quantity: li.unitQuantity,
      accountId: li.accountId,
    })),
  }
}
