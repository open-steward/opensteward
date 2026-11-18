import { toCalendarDate } from '../../shared/transform'
import type { CreditMemo, CreditMemoStatus } from '../../../schema/creditmemo'
import type { Lineitem } from '../../../schema/shared'

export interface FocusSoftnetCreditMemoLine {
  ItemCode: string
  Description: string
  Qty: number
  UnitPrice: number
  SubTotal: number
  TaxAmt: number
  AccCode: string
  [key: string]: unknown
}

export interface FocusSoftnetCreditMemo {
  DocNo: string
  DocDate: string
  DueDate: string
  SubTotal: number
  TaxAmt: number
  TotalAmt: number
  OutstandingAmt: number
  DocStatus: string
  CustCode: string
  CurrCode: string
  Lines: FocusSoftnetCreditMemoLine[]
  [key: string]: unknown
}

function mapStatus(status: string): CreditMemoStatus {
  switch (status) {
    case 'D': return 'DRAFT'
    case 'A': return 'AUTHORIZED'
    case 'P': return 'PAID'
    case 'C': return 'VOIDED'
    default: return 'DRAFT'
  }
}

function mapLineitem(line: FocusSoftnetCreditMemoLine): Lineitem {
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

export function transformCreditMemo(raw: FocusSoftnetCreditMemo): CreditMemo {
  return {
    id: String(raw.DocNo),
    status: mapStatus(raw.DocStatus),
    creditmemoNumber: String(raw.DocNo),
    contactId: raw.CustCode || undefined,
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

export function untransformCreditMemo(cm: Partial<CreditMemo>): Record<string, unknown> {
  return {
    CustCode: cm.contactId,
    CurrCode: cm.currency,
    DocDate: toCalendarDate(cm.postedAt),
    Lines: cm.lineItems?.map((li) => ({
      ItemCode: li.itemId,
      Description: li.itemDescription,
      Qty: li.unitQuantity,
      UnitPrice: li.unitAmount,
      AccCode: li.accountId,
    })),
  }
}
