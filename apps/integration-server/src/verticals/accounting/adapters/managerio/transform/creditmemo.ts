import { toCalendarDate } from '../../shared/transform'
import type { CreditMemo, CreditMemoStatus } from '../../../schema/creditmemo'
import type { Lineitem } from '../../../schema/shared'

export interface ManagerioCreditMemoLine {
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

export interface ManagerioCreditMemo {
  Key: string
  Reference: string
  Date: string
  DueDate: string
  Lines: ManagerioCreditMemoLine[]
  Total: number
  TotalTax: number
  AmountDue: number
  Contact: string
  Currency: string
  Status: string
  [key: string]: unknown
}

function mapStatus(status: string): CreditMemoStatus {
  switch (status) {
    case 'Draft': return 'DRAFT'
    case 'Unpaid': return 'AUTHORIZED'
    case 'Paid': return 'PAID'
    case 'Voided': return 'VOIDED'
    default: return 'DRAFT'
  }
}

function mapLineitem(line: ManagerioCreditMemoLine): Lineitem {
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

export function transformCreditMemo(raw: ManagerioCreditMemo): CreditMemo {
  return {
    id: String(raw.Key),
    status: mapStatus(raw.Status),
    creditmemoNumber: raw.Reference || String(raw.Key),
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

export function untransformCreditMemo(cm: Partial<CreditMemo>): Record<string, unknown> {
  return {
    Reference: cm.creditmemoNumber,
    Date: toCalendarDate(cm.postedAt),
    DueDate: toCalendarDate(cm.dueAt),
    Contact: cm.contactId,
    Currency: cm.currency,
    Lines: cm.lineItems?.map((li) => ({
      Item: li.itemId,
      Description: li.itemDescription,
      Qty: li.unitQuantity,
      UnitPrice: li.unitAmount,
      Account: li.accountId,
      Tax: li.taxrateId,
    })),
  }
}
