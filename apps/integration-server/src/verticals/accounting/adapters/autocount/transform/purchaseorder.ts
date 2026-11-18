import type { PurchaseOrder, PurchaseOrderStatus } from '../../../schema/purchaseorder'
import type { Lineitem } from '../../../schema/shared'

export interface AutocountPurchaseOrderItem {
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

export interface AutocountPurchaseOrder {
  DocNo: string
  DocDate: string
  DueDate: string
  SubTotal: number
  TaxAmt: number
  DocAmt: number
  CreditorCode: string
  CreditorName: string
  Cancelled: boolean
  Status: number
  DetailItems: AutocountPurchaseOrderItem[]
  [key: string]: unknown
}

function mapStatus(raw: AutocountPurchaseOrder): PurchaseOrderStatus {
  if (raw.Cancelled) return 'CANCELLED'
  if (raw.Status === 2) return 'COMPLETED'
  return 'ACTIVE'
}

function mapLineitem(item: AutocountPurchaseOrderItem): Lineitem {
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

export function transformPurchaseOrder(raw: AutocountPurchaseOrder): PurchaseOrder {
  return {
    id: raw.DocNo,
    status: mapStatus(raw),
    contactId: raw.CreditorCode || undefined,
    totalAmount: raw.DocAmt,
    lineItems: (raw.DetailItems ?? []).map(mapLineitem),
    postedAt: raw.DocDate ? new Date(raw.DocDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
