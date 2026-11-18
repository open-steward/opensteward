import { toCalendarDate } from '../../shared/transform'
import type { CreditMemo, CreditMemoStatus } from '../../../schema/creditmemo'
import type { Lineitem } from '../../../schema/shared'

export interface FacturamaCreditMemoItem {
  Id: string
  ProductCode: string
  Description: string
  UnitPrice: number
  Quantity: number
  Total: number
  TaxAmount: number
  Discount: number
  [key: string]: unknown
}

export interface FacturamaCreditMemo {
  Id: string
  Folio: string
  ClientId: string
  Currency: string
  Total: number
  TaxAmount: number
  Balance: number
  PaidAmount: number
  Date: string
  DueDate: string
  Status: string
  IsCancelled: boolean
  Items: FacturamaCreditMemoItem[]
  [key: string]: unknown
}

function mapStatus(raw: FacturamaCreditMemo): CreditMemoStatus {
  if (raw.IsCancelled) return 'VOIDED'
  if (raw.Status === 'paid' || raw.Balance === 0) return 'PAID'
  if (raw.Balance > 0 && raw.Balance < Math.abs(raw.Total)) return 'PARTIALLY_PAID'
  if (raw.Status === 'authorized') return 'AUTHORIZED'
  return 'DRAFT'
}

function mapLineitem(row: FacturamaCreditMemoItem): Lineitem {
  return {
    id: String(row.Id),
    itemId: row.ProductCode || undefined,
    itemDescription: row.Description || undefined,
    unitAmount: row.UnitPrice,
    unitQuantity: row.Quantity,
    totalAmount: row.Total,
    taxAmount: row.TaxAmount,
    discountAmount: row.Discount || undefined,
  }
}

export function transformCreditMemo(raw: FacturamaCreditMemo): CreditMemo {
  return {
    id: String(raw.Id),
    status: mapStatus(raw),
    creditmemoNumber: raw.Folio || undefined,
    contactId: raw.ClientId || undefined,
    currency: raw.Currency || undefined,
    totalAmount: raw.Total,
    taxAmount: raw.TaxAmount,
    balanceAmount: raw.Balance,
    paidAmount: raw.PaidAmount || undefined,
    lineItems: (raw.Items ?? []).map(mapLineitem),
    postedAt: raw.Date ? new Date(raw.Date) : undefined,
    dueAt: raw.DueDate ? new Date(raw.DueDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformCreditMemo(cm: Partial<CreditMemo>): Record<string, unknown> {
  return {
    ClientId: cm.contactId,
    Currency: cm.currency,
    Date: toCalendarDate(cm.postedAt),
    DueDate: toCalendarDate(cm.dueAt),
    Items: cm.lineItems?.map((li) => ({
      ProductCode: li.itemId,
      Description: li.itemDescription,
      UnitPrice: li.unitAmount,
      Quantity: li.unitQuantity,
    })),
  }
}
