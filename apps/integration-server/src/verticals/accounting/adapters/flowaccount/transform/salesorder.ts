import type { SalesOrder, SalesOrderStatus } from '../../../schema/salesorder'
import type { Lineitem } from '../../../schema/shared'

export interface FlowAccountSalesOrderItem {
  id: string | number
  description: string
  quantity: number
  unitPrice: number
  amount: number
  vatAmount: number
  [key: string]: unknown
}

export interface FlowAccountSalesOrder {
  id: string | number
  documentSerial: string
  statusId: number
  issuedDate: string
  amountTotal: number
  currencyCode: string
  contactCode: string
  items: FlowAccountSalesOrderItem[]
  [key: string]: unknown
}

function mapStatus(statusId: number): SalesOrderStatus {
  switch (statusId) {
    case 3:
      return 'COMPLETED'
    case 4:
      return 'CANCELLED'
    case 2:
      return 'ACTIVE'
    case 1:
    default:
      return 'DRAFT'
  }
}

function mapLineitem(item: FlowAccountSalesOrderItem): Lineitem {
  return {
    id: String(item.id),
    itemDescription: item.description || undefined,
    unitAmount: item.unitPrice,
    unitQuantity: item.quantity,
    totalAmount: item.amount,
    taxAmount: item.vatAmount || undefined,
  }
}

export function transformSalesOrder(raw: FlowAccountSalesOrder): SalesOrder {
  return {
    id: String(raw.id),
    status: mapStatus(raw.statusId),
    contactId: raw.contactCode || undefined,
    currency: raw.currencyCode || undefined,
    totalAmount: raw.amountTotal,
    lineItems: (raw.items ?? []).map(mapLineitem),
    postedAt: raw.issuedDate ? new Date(raw.issuedDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
