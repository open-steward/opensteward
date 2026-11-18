import type { PurchaseOrder, PurchaseOrderStatus } from '../../../schema/purchaseorder'
import type { Lineitem } from '../../../schema/shared'

export interface IdokladPurchaseOrderLine {
  Id: string | number
  Name?: string
  UnitPrice?: number
  Amount?: number
  TotalWithVat?: number
  AccountNumber?: string
  [key: string]: unknown
}

export interface IdokladPurchaseOrder {
  Id: string | number
  DocumentStatus?: number
  ClientId?: string | number
  CurrencyId?: string
  TotalWithVat?: number
  DateOfIssue?: string
  Items?: IdokladPurchaseOrderLine[]
  [key: string]: unknown
}

function mapStatus(status?: number): PurchaseOrderStatus {
  switch (status) {
    case 2: return 'ACTIVE'
    case 3: return 'COMPLETED'
    case 4: return 'CANCELLED'
    case 1: default: return 'DRAFT'
  }
}

export function transformPurchaseOrder(raw: IdokladPurchaseOrder): PurchaseOrder {
  return {
    id: String(raw.Id),
    status: mapStatus(raw.DocumentStatus),
    contactId: raw.ClientId ? String(raw.ClientId) : undefined,
    currency: raw.CurrencyId || undefined,
    totalAmount: raw.TotalWithVat,
    postedAt: raw.DateOfIssue ? new Date(raw.DateOfIssue) : undefined,
    lineItems: (raw.Items ?? []).map(l => ({
      id: String(l.Id),
      itemDescription: l.Name || undefined,
      unitAmount: l.UnitPrice,
      unitQuantity: l.Amount,
      totalAmount: l.TotalWithVat,
      accountId: l.AccountNumber ? String(l.AccountNumber) : undefined,
    } satisfies Lineitem)),
    metadata: raw as Record<string, unknown>,
  }
}
