import type { SalesOrder, SalesOrderStatus } from '../../../schema/salesorder'
import type { Lineitem } from '../../../schema/shared'

export interface IdokladSalesOrderLine {
  Id: string | number
  Name?: string
  UnitPrice?: number
  Amount?: number
  TotalWithVat?: number
  AccountNumber?: string
  [key: string]: unknown
}

export interface IdokladSalesOrder {
  Id: string | number
  DocumentStatus?: number
  ClientId?: string | number
  CurrencyId?: string
  TotalWithVat?: number
  DateOfIssue?: string
  Items?: IdokladSalesOrderLine[]
  [key: string]: unknown
}

function mapStatus(status?: number): SalesOrderStatus {
  switch (status) {
    case 2: return 'ACTIVE'
    case 3: return 'COMPLETED'
    case 4: return 'CANCELLED'
    case 1: default: return 'DRAFT'
  }
}

export function transformSalesOrder(raw: IdokladSalesOrder): SalesOrder {
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
