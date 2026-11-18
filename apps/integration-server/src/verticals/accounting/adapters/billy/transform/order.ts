import { toCalendarDate } from '../../shared/transform'
import type { Order, OrderStatus } from '../../../schema/order'
import type { Lineitem } from '../../../schema/shared'

export interface BillyOrderLine {
  id: string
  productId: string
  description: string
  quantity: number
  unitPrice: number
  amount: number
  taxRateId: string
  taxAmount: number
  accountId: string
  discount: number
  [key: string]: unknown
}

export interface BillyOrder {
  id: string
  orderNo: number
  contactId: string
  currencyId: string
  entryDate: string
  state: string
  grossAmount: number
  taxAmount: number
  orderLines: BillyOrderLine[]
  organizationId: string
  [key: string]: unknown
}

function mapStatus(state: string): OrderStatus {
  if (state === 'completed' || state === 'invoiced') return 'COMPLETED'
  if (state === 'voided' || state === 'cancelled') return 'CANCELLED'
  if (state === 'draft') return 'DRAFT'
  return 'ACTIVE'
}

function mapLineitem(row: BillyOrderLine): Lineitem {
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
    discountAmount: row.discount || undefined,
  }
}

export function transformOrder(raw: BillyOrder): Order {
  return {
    id: raw.id,
    status: mapStatus(raw.state),
    type: 'SALES',
    contactId: raw.contactId || undefined,
    currency: raw.currencyId || undefined,
    totalAmount: raw.grossAmount,
    lineItems: (raw.orderLines ?? []).map(mapLineitem),
    postedAt: raw.entryDate ? new Date(raw.entryDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformOrder(order: Partial<Order>): Record<string, unknown> {
  return {
    contactId: order.contactId,
    currencyId: order.currency,
    entryDate: toCalendarDate(order.postedAt),
    orderLines: order.lineItems?.map((li) => ({
      productId: li.itemId,
      description: li.itemDescription,
      unitPrice: li.unitAmount,
      quantity: li.unitQuantity,
      accountId: li.accountId,
    })),
  }
}
