import { toCalendarDate } from '../../shared/transform'
import type { Bill, BillStatus } from '../../../schema/bill'
import type { Lineitem } from '../../../schema/shared'

export interface ManagerioBillLine {
  Item: string
  Description: string
  Qty: number
  UnitPrice: number
  LineTotal: number
  Tax: string
  TaxAmount: number
  Account: string
  [key: string]: unknown
}

export interface ManagerioBill {
  Key: string
  Reference: string
  Date: string
  DueDate: string
  Lines: ManagerioBillLine[]
  Total: number
  TotalTax: number
  AmountDue: number
  Contact: string
  Currency: string
  Status: string
  [key: string]: unknown
}

function mapStatus(status: string): BillStatus {
  switch (status) {
    case 'Draft': return 'DRAFT'
    case 'Unpaid': return 'AUTHORIZED'
    case 'Paid': return 'PAID'
    case 'Voided': return 'VOIDED'
    default: return 'DRAFT'
  }
}

function mapLineitem(line: ManagerioBillLine): Lineitem {
  return {
    itemId: line.Item || undefined,
    itemDescription: line.Description || undefined,
    unitQuantity: line.Qty,
    unitAmount: line.UnitPrice,
    totalAmount: line.LineTotal,
    taxAmount: line.TaxAmount,
    taxrateId: line.Tax || undefined,
    accountId: line.Account || undefined,
  }
}

export function transformBill(raw: ManagerioBill): Bill {
  return {
    id: String(raw.Key),
    status: mapStatus(raw.Status),
    billNumber: raw.Reference || String(raw.Key),
    contactId: raw.Contact || undefined,
    currency: raw.Currency || undefined,
    totalAmount: raw.Total,
    taxAmount: raw.TotalTax,
    balanceAmount: raw.AmountDue,
    lineItems: (raw.Lines ?? []).map(mapLineitem),
    postedAt: raw.Date ? new Date(raw.Date) : undefined,
    dueAt: raw.DueDate ? new Date(raw.DueDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformBill(bill: Partial<Bill>): Record<string, unknown> {
  return {
    Reference: bill.billNumber,
    Date: toCalendarDate(bill.postedAt),
    DueDate: toCalendarDate(bill.dueAt),
    Contact: bill.contactId,
    Currency: bill.currency,
    Lines: bill.lineItems?.map((li) => ({
      Item: li.itemId,
      Description: li.itemDescription,
      Qty: li.unitQuantity,
      UnitPrice: li.unitAmount,
      Account: li.accountId,
      Tax: li.taxrateId,
    })),
  }
}
