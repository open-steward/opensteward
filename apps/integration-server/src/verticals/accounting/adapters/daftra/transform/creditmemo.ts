import type { CreditMemo, CreditMemoStatus } from '../../../schema/creditmemo'
import type { Lineitem } from '../../../schema/shared'

export interface DaftraCreditNoteLine {
  ProductId?: string
  Description?: string
  Qty?: number
  UnitPrice?: number
  Total?: number
  TaxRate?: number
  [key: string]: unknown
}

export interface DaftraCreditNote {
  id: string
  InvoiceNo?: string
  Date?: string
  DueDate?: string
  TaxAmount?: number
  TotalAmount?: number
  Paid?: number
  Status?: number | string
  ClientId?: string
  Currency?: string
  Lines?: DaftraCreditNoteLine[]
  [key: string]: unknown
}

function mapStatus(status?: number | string): CreditMemoStatus {
  const s = Number(status)
  switch (s) {
    case 1:
      return 'DRAFT'
    case 2:
      return 'AUTHORIZED'
    case 3:
      return 'PAID'
    case 4:
      return 'VOIDED'
    default:
      return 'DRAFT'
  }
}

function mapLineitem(line: DaftraCreditNoteLine): Lineitem {
  return {
    itemId: line.ProductId ? String(line.ProductId) : undefined,
    itemDescription: line.Description || undefined,
    unitQuantity: line.Qty,
    unitAmount: line.UnitPrice,
    totalAmount: line.Total,
    taxrateId: line.TaxRate !== undefined ? String(line.TaxRate) : undefined,
  }
}

export function transformCreditMemo(raw: DaftraCreditNote): CreditMemo {
  return {
    id: String(raw.id),
    status: mapStatus(raw.Status),
    creditmemoNumber: raw.InvoiceNo || undefined,
    contactId: raw.ClientId ? String(raw.ClientId) : undefined,
    currency: raw.Currency || undefined,
    totalAmount: raw.TotalAmount,
    taxAmount: raw.TaxAmount,
    paidAmount: raw.Paid,
    lineItems: (raw.Lines ?? []).map(mapLineitem),
    postedAt: raw.Date ? new Date(raw.Date) : undefined,
    dueAt: raw.DueDate ? new Date(raw.DueDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
