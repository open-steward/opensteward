import { toCalendarDate } from '../../shared/transform'
import type { SalesOrder, SalesOrderStatus } from '../../../schema/salesorder'
import type { Lineitem } from '../../../schema/shared'

export interface BusySalesOrderItem {
  ItemCode: string
  Description: string
  Qty: number
  Rate: number
  Amount: number
  TaxAmt: number
  AccountCode: string
  [key: string]: unknown
}

export interface BusySalesOrder {
  VoucherNo: string
  Date: string
  GrossAmount: number
  Status: string
  PartyCode: string
  CurrencyCode: string
  Items: BusySalesOrderItem[]
  [key: string]: unknown
}

function mapStatus(status: string): SalesOrderStatus {
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

function mapLineitem(item: BusySalesOrderItem): Lineitem {
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

export function transformSalesOrder(raw: BusySalesOrder): SalesOrder {
  return {
    id: String(raw.VoucherNo),
    status: mapStatus(raw.Status),
    contactId: raw.PartyCode || undefined,
    currency: raw.CurrencyCode || undefined,
    totalAmount: raw.GrossAmount,
    lineItems: (raw.Items ?? []).map(mapLineitem),
    postedAt: raw.Date ? new Date(raw.Date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformSalesOrder(so: Partial<SalesOrder>): Record<string, unknown> {
  return {
    PartyCode: so.contactId,
    CurrencyCode: so.currency,
    Date: toCalendarDate(so.postedAt),
    Items: so.lineItems?.map((li) => ({
      ItemCode: li.itemId,
      Description: li.itemDescription,
      Qty: li.unitQuantity,
      Rate: li.unitAmount,
      AccountCode: li.accountId,
    })),
  }
}
