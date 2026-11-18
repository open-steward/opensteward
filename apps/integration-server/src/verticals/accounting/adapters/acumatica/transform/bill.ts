import type { Bill, BillStatus } from '../../../schema/bill'
import type { Lineitem } from '../../../schema/shared'

export interface AcumaticaBillLine {
  LineNbr: number
  InventoryID: string
  Description: string
  Qty: number
  UnitCost: number
  ExtCost: number
  TaxAmt: number
  AccountID: string
  [key: string]: unknown
}

export interface AcumaticaBill {
  RefNbr: string
  Type: string
  Status: string
  Amount: number
  TaxTotal: number
  Balance: number
  CurrencyID: string
  VendorID: string
  DocDate: string
  DueDate: string
  InvoiceNbr: string
  Details: AcumaticaBillLine[]
  [key: string]: unknown
}

function mapStatus(status: string): BillStatus {
  switch (status) {
    case 'Open':
      return 'AUTHORIZED'
    case 'Closed':
      return 'PAID'
    case 'Hold':
      return 'DRAFT'
    case 'Voided':
      return 'VOIDED'
    default:
      return 'DRAFT'
  }
}

function mapLineitem(line: AcumaticaBillLine): Lineitem {
  return {
    id: String(line.LineNbr),
    accountId: line.AccountID || undefined,
    itemId: line.InventoryID || undefined,
    itemDescription: line.Description || undefined,
    unitAmount: line.UnitCost,
    unitQuantity: line.Qty,
    totalAmount: line.ExtCost,
    taxAmount: line.TaxAmt || undefined,
  }
}

export function transformBill(raw: AcumaticaBill): Bill {
  return {
    id: raw.RefNbr,
    status: mapStatus(raw.Status),
    billNumber: raw.InvoiceNbr || raw.RefNbr || undefined,
    contactId: raw.VendorID || undefined,
    currency: raw.CurrencyID || undefined,
    totalAmount: raw.Amount,
    taxAmount: raw.TaxTotal || undefined,
    lineItems: (raw.Details ?? []).map(mapLineitem),
    postedAt: raw.DocDate ? new Date(raw.DocDate) : undefined,
    dueAt: raw.DueDate ? new Date(raw.DueDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
