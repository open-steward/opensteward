import { toCalendarDate } from '../../shared/transform'
import type { Order, OrderStatus } from '../../../schema/order'
import type { Lineitem } from '../../../schema/shared'

export interface BusyOrderItem {
  ItemCode: string
  Description: string
  Qty: number
  Rate: number
  Amount: number
  TaxAmt: number
  AccountCode: string
  [key: string]: unknown
}

export interface BusyOrder {
  VoucherNo: string
  Date: string
  GrossAmount: number
  Status: string
  PartyCode: string
  CurrencyCode: string
  Items: BusyOrderItem[]
  [key: string]: unknown
}

function mapStatus(status: string): OrderStatus {
  switch (status) {
    case 'P':
    case 'Draft': return 'DRAFT'
    case 'A':
    case 'Approved': return 'ACTIVE'
    case 'C':
    case 'Closed': return 'COMPLETED'
    case 'X':
    case 'Cancelled': return 'CANCELLED'
    default: return 'DRAFT'
  }
}

function mapLineitem(item: BusyOrderItem): Lineitem {
  return {
    itemId: item.ItemCode || undefined,
    itemDescription: item.Description || undefined,
    unitQuantity: item.Qty,
    unitAmount: item.Rate,
    totalAmount: item.Amount,
    taxAmount: item.TaxAmt,
    accountId: item.AccountCode || undefined,
  }
}

export function transformOrder(raw: BusyOrder): Order {
  return {
    id: String(raw.VoucherNo),
    status: mapStatus(raw.Status),
    type: 'SALES',
    contactId: raw.PartyCode || undefined,
    currency: raw.CurrencyCode || undefined,
    totalAmount: raw.GrossAmount,
    lineItems: (raw.Items ?? []).map(mapLineitem),
    postedAt: raw.Date ? new Date(raw.Date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformOrder(order: Partial<Order>): Record<string, unknown> {
  return {
    PartyCode: order.contactId,
    CurrencyCode: order.currency,
    Date: toCalendarDate(order.postedAt),
    Items: order.lineItems?.map((li) => ({
      ItemCode: li.itemId,
      Description: li.itemDescription,
      Qty: li.unitQuantity,
      Rate: li.unitAmount,
      AccountCode: li.accountId,
    })),
  }
}
