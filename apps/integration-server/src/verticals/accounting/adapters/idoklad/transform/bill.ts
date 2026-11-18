import type { Bill, BillStatus } from '../../../schema/bill'
import type { Lineitem } from '../../../schema/shared'

export interface IdokladBillLine {
  Id: string | number
  Name?: string
  UnitPrice?: number
  Amount?: number
  TotalWithVat?: number
  VatAmount?: number
  AccountNumber?: string
  [key: string]: unknown
}

export interface IdokladBill {
  Id: string | number
  DocumentNumber?: string
  DateOfIssue?: string
  PaymentOption?: string
  TotalWithVat?: number
  TotalVatAmount?: number
  DocumentStatus?: number
  ClientId?: string | number
  CurrencyId?: string
  Items?: IdokladBillLine[]
  [key: string]: unknown
}

function mapStatus(status?: number): BillStatus {
  switch (status) {
    case 3: return 'PAID'
    case 2: return 'AUTHORIZED'
    case 4: return 'VOIDED'
    case 1: default: return 'DRAFT'
  }
}

export function transformBill(raw: IdokladBill): Bill {
  return {
    id: String(raw.Id),
    status: mapStatus(raw.DocumentStatus),
    billNumber: raw.DocumentNumber || undefined,
    contactId: raw.ClientId ? String(raw.ClientId) : undefined,
    currency: raw.CurrencyId || undefined,
    totalAmount: raw.TotalWithVat,
    taxAmount: raw.TotalVatAmount,
    balanceAmount: raw.TotalWithVat,
    postedAt: raw.DateOfIssue ? new Date(raw.DateOfIssue) : undefined,
    dueAt: raw.PaymentOption ? new Date(raw.PaymentOption) : undefined,
    lineItems: (raw.Items ?? []).map(l => ({
      id: String(l.Id),
      itemDescription: l.Name || undefined,
      unitAmount: l.UnitPrice,
      unitQuantity: l.Amount,
      totalAmount: l.TotalWithVat,
      taxAmount: l.VatAmount,
      accountId: l.AccountNumber ? String(l.AccountNumber) : undefined,
    } satisfies Lineitem)),
    metadata: raw as Record<string, unknown>,
  }
}
