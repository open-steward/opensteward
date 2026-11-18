import { toCalendarDate } from '../../shared/transform'
import type { Order, OrderStatus } from '../../../schema/order'
import type { Lineitem } from '../../../schema/shared'

export interface FocusSoftnetOrderLine {
  ItemCode: string
  Description: string
  Qty: number
  UnitPrice: number
  SubTotal: number
  TaxAmt: number
  AccCode: string
  [key: string]: unknown
}

export interface FocusSoftnetOrder {
  DocNo: string
  DocDate: string
  TotalAmt: number
  DocStatus: string
  CustCode: string
  CurrCode: string
  Lines: FocusSoftnetOrderLine[]
  [key: string]: unknown
}

function mapStatus(status: string): OrderStatus {
  switch (status) {
    case 'D': return 'DRAFT'
    case 'A': return 'ACTIVE'
    case 'P': return 'COMPLETED'
    case 'C': return 'CANCELLED'
    default: return 'DRAFT'
  }
}

function mapLineitem(line: FocusSoftnetOrderLine): Lineitem {
  return {
    itemId: line.ItemCode || undefined,
    itemDescription: line.Description || undefined,
    unitQuantity: line.Qty,
    unitAmount: line.UnitPrice,
    totalAmount: line.SubTotal,
    taxAmount: line.TaxAmt,
    accountId: line.AccCode || undefined,
  }
}

export function transformOrder(raw: FocusSoftnetOrder): Order {
  return {
    id: String(raw.DocNo),
    status: mapStatus(raw.DocStatus),
    type: 'SALES',
    contactId: raw.CustCode || undefined,
    currency: raw.CurrCode || undefined,
    totalAmount: raw.TotalAmt,
    lineItems: (raw.Lines ?? []).map(mapLineitem),
    postedAt: raw.DocDate ? new Date(raw.DocDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformOrder(order: Partial<Order>): Record<string, unknown> {
  return {
    CustCode: order.contactId,
    CurrCode: order.currency,
    DocDate: toCalendarDate(order.postedAt),
    Lines: order.lineItems?.map((li) => ({
      ItemCode: li.itemId,
      Description: li.itemDescription,
      Qty: li.unitQuantity,
      UnitPrice: li.unitAmount,
      AccCode: li.accountId,
    })),
  }
}
