import { toCalendarDate } from '../../shared/transform'
import type { CreditMemo, CreditMemoStatus } from '../../../schema/creditmemo'
import type { Lineitem } from '../../../schema/shared'

export interface BusyCreditMemoItem {
  ItemCode: string
  Description: string
  Qty: number
  Rate: number
  Amount: number
  TaxAmt: number
  AccountCode: string
  [key: string]: unknown
}

export interface BusyCreditMemo {
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
  Items: BusyCreditMemoItem[]
  [key: string]: unknown
}

function mapStatus(status: string): CreditMemoStatus {
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

function mapLineitem(item: BusyCreditMemoItem): Lineitem {
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

export function transformCreditMemo(raw: BusyCreditMemo): CreditMemo {
  return {
    id: String(raw.VoucherNo),
    status: mapStatus(raw.Status),
    creditmemoNumber: String(raw.VoucherNo),
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

export function untransformCreditMemo(cm: Partial<CreditMemo>): Record<string, unknown> {
  return {
    PartyCode: cm.contactId,
    CurrencyCode: cm.currency,
    Date: toCalendarDate(cm.postedAt),
    Items: cm.lineItems?.map((li) => ({
      ItemCode: li.itemId,
      Description: li.itemDescription,
      Qty: li.unitQuantity,
      Rate: li.unitAmount,
      AccountCode: li.accountId,
    })),
  }
}
