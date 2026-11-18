import type { PurchaseOrder, PurchaseOrderStatus } from '../../../schema/purchaseorder'
import type { Lineitem } from '../../../schema/shared'

export interface QBOPurchaseOrderLine {
  Id: string
  Description: string
  Amount: number
  DetailType: string
  ItemBasedExpenseLineDetail?: { ItemRef: { value: string }; UnitPrice?: number; Qty?: number }
  AccountBasedExpenseLineDetail?: { AccountRef: { value: string }; UnitPrice?: number; Qty?: number }
}

export interface QBOPurchaseOrder {
  Id: string
  DocNumber: string
  VendorRef: { value: string }
  TxnDate: string
  DueDate?: string
  TotalAmt: number
  POStatus: string
  CurrencyRef?: { value: string }
  Line: QBOPurchaseOrderLine[]
  [key: string]: unknown
}

function mapStatus(status: string): PurchaseOrderStatus {
  switch (status) {
    case 'Closed': return 'COMPLETED'
    case 'Open': return 'ACTIVE'
    default: return 'DRAFT'
  }
}

function mapLines(lines: QBOPurchaseOrderLine[]): Lineitem[] {
  return (lines ?? [])
    .filter((l) => l.DetailType === 'ItemBasedExpenseLineDetail' || l.DetailType === 'AccountBasedExpenseLineDetail')
    .map((l) => {
      const detail = l.ItemBasedExpenseLineDetail ?? l.AccountBasedExpenseLineDetail
      return {
        id: l.Id || undefined,
        accountId: l.AccountBasedExpenseLineDetail?.AccountRef?.value || undefined,
        itemId: l.ItemBasedExpenseLineDetail?.ItemRef?.value || undefined,
        itemDescription: l.Description || undefined,
        unitAmount: detail?.UnitPrice,
        unitQuantity: detail?.Qty,
        totalAmount: l.Amount,
      }
    })
}

export function transformPurchaseOrder(raw: QBOPurchaseOrder): PurchaseOrder {
  return {
    id: raw.Id,
    status: mapStatus(raw.POStatus),
    contactId: raw.VendorRef?.value || undefined,
    currency: raw.CurrencyRef?.value || undefined,
    totalAmount: raw.TotalAmt,
    lineItems: mapLines(raw.Line ?? []),
    postedAt: raw.TxnDate ? new Date(raw.TxnDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
