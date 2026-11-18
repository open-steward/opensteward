import { toCalendarDate } from '../../shared/transform'
import type { PurchaseOrder, PurchaseOrderStatus } from '../../../schema/purchaseorder'
import type { Lineitem } from '../../../schema/shared'

export interface BusyPurchaseOrderItem {
  ItemCode: string
  Description: string
  Qty: number
  Rate: number
  Amount: number
  TaxAmt: number
  AccountCode: string
  [key: string]: unknown
}

export interface BusyPurchaseOrder {
  VoucherNo: string
  Date: string
  GrossAmount: number
  Status: string
  PartyCode: string
  CurrencyCode: string
  Items: BusyPurchaseOrderItem[]
  [key: string]: unknown
}

function mapStatus(status: string): PurchaseOrderStatus {
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

function mapLineitem(item: BusyPurchaseOrderItem): Lineitem {
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

export function transformPurchaseOrder(raw: BusyPurchaseOrder): PurchaseOrder {
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

export function untransformPurchaseOrder(po: Partial<PurchaseOrder>): Record<string, unknown> {
  return {
    PartyCode: po.contactId,
    CurrencyCode: po.currency,
    Date: toCalendarDate(po.postedAt),
    Items: po.lineItems?.map((li) => ({
      ItemCode: li.itemId,
      Description: li.itemDescription,
      Qty: li.unitQuantity,
      Rate: li.unitAmount,
      AccountCode: li.accountId,
    })),
  }
}
