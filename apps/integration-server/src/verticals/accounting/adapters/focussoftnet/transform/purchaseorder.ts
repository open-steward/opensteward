import { toCalendarDate } from '../../shared/transform'
import type { PurchaseOrder, PurchaseOrderStatus } from '../../../schema/purchaseorder'
import type { Lineitem } from '../../../schema/shared'

export interface FocusSoftnetPurchaseOrderLine {
  ItemCode: string
  Description: string
  Qty: number
  UnitPrice: number
  SubTotal: number
  TaxAmt: number
  AccCode: string
  [key: string]: unknown
}

export interface FocusSoftnetPurchaseOrder {
  DocNo: string
  DocDate: string
  TotalAmt: number
  DocStatus: string
  SupplCode: string
  CurrCode: string
  Lines: FocusSoftnetPurchaseOrderLine[]
  [key: string]: unknown
}

function mapStatus(status: string): PurchaseOrderStatus {
  switch (status) {
    case 'D': return 'DRAFT'
    case 'A': return 'ACTIVE'
    case 'P': return 'COMPLETED'
    case 'C': return 'CANCELLED'
    default: return 'DRAFT'
  }
}

function mapLineitem(line: FocusSoftnetPurchaseOrderLine): Lineitem {
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

export function transformPurchaseOrder(raw: FocusSoftnetPurchaseOrder): PurchaseOrder {
  return {
    id: String(raw.DocNo),
    status: mapStatus(raw.DocStatus),
    contactId: raw.SupplCode || undefined,
    currency: raw.CurrCode || undefined,
    totalAmount: raw.TotalAmt,
    lineItems: (raw.Lines ?? []).map(mapLineitem),
    postedAt: raw.DocDate ? new Date(raw.DocDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformPurchaseOrder(po: Partial<PurchaseOrder>): Record<string, unknown> {
  return {
    SupplCode: po.contactId,
    CurrCode: po.currency,
    DocDate: toCalendarDate(po.postedAt),
    Lines: po.lineItems?.map((li) => ({
      ItemCode: li.itemId,
      Description: li.itemDescription,
      Qty: li.unitQuantity,
      UnitPrice: li.unitAmount,
      AccCode: li.accountId,
    })),
  }
}
