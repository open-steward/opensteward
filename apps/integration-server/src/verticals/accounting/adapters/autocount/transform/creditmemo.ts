import type { CreditMemo, CreditMemoStatus } from '../../../schema/creditmemo'
import type { Lineitem } from '../../../schema/shared'

export interface AutocountCreditNoteItem {
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

export interface AutocountCreditNote {
  DocNo: string
  DocDate: string
  SubTotal: number
  TaxAmt: number
  DocAmt: number
  CreditBalance: number
  DebtorCode: string
  DebtorName: string
  Cancelled: boolean
  DetailItems: AutocountCreditNoteItem[]
  [key: string]: unknown
}

function mapStatus(cn: AutocountCreditNote): CreditMemoStatus {
  if (cn.Cancelled) return 'VOIDED'
  if (cn.CreditBalance === 0) return 'PAID'
  if (cn.CreditBalance > 0 && cn.CreditBalance < cn.DocAmt) return 'PARTIALLY_PAID'
  return 'AUTHORIZED'
}

function mapLineitem(item: AutocountCreditNoteItem): Lineitem {
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

export function transformCreditMemo(raw: AutocountCreditNote): CreditMemo {
  return {
    id: raw.DocNo,
    status: mapStatus(raw),
    creditmemoNumber: raw.DocNo,
    contactId: raw.DebtorCode || undefined,
    totalAmount: raw.DocAmt,
    taxAmount: raw.TaxAmt,
    balanceAmount: raw.CreditBalance,
    lineItems: (raw.DetailItems ?? []).map(mapLineitem),
    postedAt: raw.DocDate ? new Date(raw.DocDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
