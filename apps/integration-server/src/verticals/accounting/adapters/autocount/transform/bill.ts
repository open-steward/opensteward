import type { Bill, BillStatus } from '../../../schema/bill'
import type { Lineitem } from '../../../schema/shared'

export interface AutocountBillDetailItem {
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

export interface AutocountBill {
  DocNo: string
  DocDate: string
  DueDate: string
  SubTotal: number
  TaxAmt: number
  DocAmt: number
  CreditBalance: number
  CreditorCode: string
  CreditorName: string
  CurrencyCode: string
  Cancelled: boolean
  Posted: boolean
  DetailItems: AutocountBillDetailItem[]
  [key: string]: unknown
}

function mapStatus(bill: AutocountBill): BillStatus {
  if (bill.Cancelled) return 'VOIDED'
  if (bill.Posted && bill.CreditBalance === 0) return 'PAID'
  if (bill.Posted && bill.CreditBalance > 0 && bill.CreditBalance < bill.DocAmt)
    return 'PARTIALLY_PAID'
  if (bill.Posted) return 'AUTHORIZED'
  return 'DRAFT'
}

function mapLineitem(item: AutocountBillDetailItem): Lineitem {
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

export function transformBill(raw: AutocountBill): Bill {
  return {
    id: raw.DocNo,
    status: mapStatus(raw),
    billNumber: raw.DocNo,
    contactId: raw.CreditorCode || undefined,
    currency: raw.CurrencyCode || undefined,
    totalAmount: raw.DocAmt,
    taxAmount: raw.TaxAmt,
    balanceAmount: raw.CreditBalance,
    lineItems: (raw.DetailItems ?? []).map(mapLineitem),
    postedAt: raw.DocDate ? new Date(raw.DocDate) : undefined,
    dueAt: raw.DueDate ? new Date(raw.DueDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
