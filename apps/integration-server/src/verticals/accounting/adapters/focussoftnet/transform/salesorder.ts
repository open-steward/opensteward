import { toCalendarDate } from '../../shared/transform'
import type { SalesOrder, SalesOrderStatus } from '../../../schema/salesorder'
import type { Lineitem } from '../../../schema/shared'

export interface FocusSoftnetSalesOrderLine {
  ItemCode: string
  Description: string
  Qty: number
  UnitPrice: number
  SubTotal: number
  TaxAmt: number
  AccCode: string
  [key: string]: unknown
}

export interface FocusSoftnetSalesOrder {
  DocNo: string
  DocDate: string
  TotalAmt: number
  DocStatus: string
  CustCode: string
  CurrCode: string
  Lines: FocusSoftnetSalesOrderLine[]
  [key: string]: unknown
}

function mapStatus(status: string): SalesOrderStatus {
  switch (status) {
    case 'D': return 'DRAFT'
    case 'A': return 'ACTIVE'
    case 'P': return 'COMPLETED'
    case 'C': return 'CANCELLED'
    default: return 'DRAFT'
  }
}

function mapLineitem(line: FocusSoftnetSalesOrderLine): Lineitem {
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

export function transformSalesOrder(raw: FocusSoftnetSalesOrder): SalesOrder {
  return {
    id: String(raw.DocNo),
    status: mapStatus(raw.DocStatus),
    contactId: raw.CustCode || undefined,
    currency: raw.CurrCode || undefined,
    totalAmount: raw.TotalAmt,
    lineItems: (raw.Lines ?? []).map(mapLineitem),
    postedAt: raw.DocDate ? new Date(raw.DocDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformSalesOrder(so: Partial<SalesOrder>): Record<string, unknown> {
  return {
    CustCode: so.contactId,
    CurrCode: so.currency,
    DocDate: toCalendarDate(so.postedAt),
    Lines: so.lineItems?.map((li) => ({
      ItemCode: li.itemId,
      Description: li.itemDescription,
      Qty: li.unitQuantity,
      UnitPrice: li.unitAmount,
      AccCode: li.accountId,
    })),
  }
}
