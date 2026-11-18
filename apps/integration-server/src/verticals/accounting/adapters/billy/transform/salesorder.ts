import { toCalendarDate } from '../../shared/transform'
import type { SalesOrder, SalesOrderStatus } from '../../../schema/salesorder'
import type { Lineitem } from '../../../schema/shared'

export interface BillySalesOrderLine {
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

export interface BillySalesOrder {
  id: string
  orderNo: number
  contactId: string
  currencyId: string
  entryDate: string
  state: string
  grossAmount: number
  taxAmount: number
  salesOrderLines: BillySalesOrderLine[]
  organizationId: string
  [key: string]: unknown
}

function mapStatus(state: string): SalesOrderStatus {
  if (state === 'completed' || state === 'invoiced') return 'COMPLETED'
  if (state === 'voided' || state === 'cancelled') return 'CANCELLED'
  if (state === 'draft') return 'DRAFT'
  return 'ACTIVE'
}

function mapLineitem(row: BillySalesOrderLine): Lineitem {
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

export function transformSalesOrder(raw: BillySalesOrder): SalesOrder {
  return {
    id: raw.id,
    status: mapStatus(raw.state),
    contactId: raw.contactId || undefined,
    currency: raw.currencyId || undefined,
    totalAmount: raw.grossAmount,
    lineItems: (raw.salesOrderLines ?? []).map(mapLineitem),
    postedAt: raw.entryDate ? new Date(raw.entryDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformSalesOrder(order: Partial<SalesOrder>): Record<string, unknown> {
  return {
    contactId: order.contactId,
    currencyId: order.currency,
    entryDate: toCalendarDate(order.postedAt),
    salesOrderLines: order.lineItems?.map((li) => ({
      productId: li.itemId,
      description: li.itemDescription,
      unitPrice: li.unitAmount,
      quantity: li.unitQuantity,
      accountId: li.accountId,
    })),
  }
}
