import type { Order, OrderStatus } from '../../../schema/order'
import type { Lineitem } from '../../../schema/shared'

export interface AutocountOrderItem {
  Seq: number
  ItemCode: string
  Description: string
  Qty: number
  UnitPrice: number
  Amount: number
  TaxAmt: number
  TaxCode: string
  AccNo: string
  [key: string]: unknown
}

export interface AutocountOrder {
  DocNo: string
  DocDate: string
  DueDate: string
  SubTotal: number
  TaxAmt: number
  DocAmt: number
  DebtorCode: string
  DebtorName: string
  Cancelled: boolean
  // 0=open, 1=partial, 2=closed
  Status: number
  DetailItems: AutocountOrderItem[]
  [key: string]: unknown
}

function mapStatus(raw: AutocountOrder): OrderStatus {
  if (raw.Cancelled) return 'CANCELLED'
  if (raw.Status === 2) return 'COMPLETED'
  return 'ACTIVE'
}

function mapLineitem(item: AutocountOrderItem): Lineitem {
  return {
    id: String(item.Seq),
    accountId: item.AccNo || undefined,
    itemId: item.ItemCode || undefined,
    itemDescription: item.Description || undefined,
    unitAmount: item.UnitPrice,
    unitQuantity: item.Qty,
    totalAmount: item.Amount,
    taxAmount: item.TaxAmt || undefined,
    taxrateId: item.TaxCode || undefined,
  }
}

export function transformOrder(raw: AutocountOrder): Order {
  return {
    id: raw.DocNo,
    status: mapStatus(raw),
    type: 'SALES',
    contactId: raw.DebtorCode || undefined,
    totalAmount: raw.DocAmt,
    lineItems: (raw.DetailItems ?? []).map(mapLineitem),
    postedAt: raw.DocDate ? new Date(raw.DocDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
