import { toCalendarDate } from '../../shared/transform'
import type { Bill, BillStatus } from '../../../schema/bill'
import type { Lineitem } from '../../../schema/shared'

export interface FocusSoftnetBillLine {
  ItemCode: string
  Description: string
  Qty: number
  UnitPrice: number
  SubTotal: number
  TaxAmt: number
  AccCode: string
  [key: string]: unknown
}

export interface FocusSoftnetBill {
  DocNo: string
  DocDate: string
  DueDate: string
  SubTotal: number
  TaxAmt: number
  TotalAmt: number
  OutstandingAmt: number
  DocStatus: string
  SupplCode: string
  CurrCode: string
  Lines: FocusSoftnetBillLine[]
  [key: string]: unknown
}

function mapStatus(status: string): BillStatus {
  switch (status) {
    case 'D': return 'DRAFT'
    case 'A': return 'AUTHORIZED'
    case 'P': return 'PAID'
    case 'C': return 'VOIDED'
    default: return 'DRAFT'
  }
}

function mapLineitem(line: FocusSoftnetBillLine): Lineitem {
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

export function transformBill(raw: FocusSoftnetBill): Bill {
  return {
    id: String(raw.DocNo),
    status: mapStatus(raw.DocStatus),
    billNumber: String(raw.DocNo),
    contactId: raw.SupplCode || undefined,
    currency: raw.CurrCode || undefined,
    totalAmount: raw.TotalAmt,
    taxAmount: raw.TaxAmt,
    balanceAmount: raw.OutstandingAmt,
    lineItems: (raw.Lines ?? []).map(mapLineitem),
    postedAt: raw.DocDate ? new Date(raw.DocDate) : undefined,
    dueAt: raw.DueDate ? new Date(raw.DueDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformBill(bill: Partial<Bill>): Record<string, unknown> {
  return {
    SupplCode: bill.contactId,
    CurrCode: bill.currency,
    DocDate: toCalendarDate(bill.postedAt),
    DueDate: toCalendarDate(bill.dueAt),
    Lines: bill.lineItems?.map((li) => ({
      ItemCode: li.itemId,
      Description: li.itemDescription,
      Qty: li.unitQuantity,
      UnitPrice: li.unitAmount,
      AccCode: li.accountId,
    })),
  }
}
