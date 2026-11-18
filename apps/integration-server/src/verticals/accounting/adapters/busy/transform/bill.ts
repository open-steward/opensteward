import { toCalendarDate } from '../../shared/transform'
import type { Bill, BillStatus } from '../../../schema/bill'
import type { Lineitem } from '../../../schema/shared'

export interface BusyBillItem {
  ItemCode: string
  Description: string
  Qty: number
  Rate: number
  Amount: number
  TaxAmt: number
  AccountCode: string
  [key: string]: unknown
}

export interface BusyBill {
  VoucherNo: string
  Date: string
  DueDate: string
  NetAmount: number
  TaxAmount: number
  GrossAmount: number
  Balance: number
  Status: string
  PartyCode: string
  CurrencyCode: string
  Items: BusyBillItem[]
  [key: string]: unknown
}

function mapStatus(status: string): BillStatus {
  switch (status) {
    case 'P':
    case 'Draft': return 'DRAFT'
    case 'A':
    case 'Approved': return 'AUTHORIZED'
    case 'C':
    case 'Closed': return 'PAID'
    case 'X':
    case 'Cancelled': return 'VOIDED'
    default: return 'DRAFT'
  }
}

function mapLineitem(item: BusyBillItem): Lineitem {
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

export function transformBill(raw: BusyBill): Bill {
  return {
    id: String(raw.VoucherNo),
    status: mapStatus(raw.Status),
    billNumber: String(raw.VoucherNo),
    contactId: raw.PartyCode || undefined,
    currency: raw.CurrencyCode || undefined,
    totalAmount: raw.GrossAmount,
    taxAmount: raw.TaxAmount,
    balanceAmount: raw.Balance,
    lineItems: (raw.Items ?? []).map(mapLineitem),
    postedAt: raw.Date ? new Date(raw.Date) : undefined,
    dueAt: raw.DueDate ? new Date(raw.DueDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformBill(bill: Partial<Bill>): Record<string, unknown> {
  return {
    PartyCode: bill.contactId,
    CurrencyCode: bill.currency,
    Date: toCalendarDate(bill.postedAt),
    DueDate: toCalendarDate(bill.dueAt),
    Items: bill.lineItems?.map((li) => ({
      ItemCode: li.itemId,
      Description: li.itemDescription,
      Qty: li.unitQuantity,
      Rate: li.unitAmount,
      AccountCode: li.accountId,
    })),
  }
}
