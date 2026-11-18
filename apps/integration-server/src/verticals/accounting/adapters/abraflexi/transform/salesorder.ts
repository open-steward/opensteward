import type { SalesOrder, SalesOrderStatus } from '../../../schema/salesorder'
import type { Lineitem } from '../../../schema/shared'

export interface AbraflexiSalesOrderLine {
  id: string | number
  nazev?: string
  cenaMj?: number
  mnozstvi?: number
  sumZklZakl?: number
  ucetni?: string
  [key: string]: unknown
}

export interface AbraflexiSalesOrder {
  id: string | number
  stavK?: string
  firma?: string | number
  mena?: string
  sumCelkem?: number
  datVyst?: string
  polozky?: AbraflexiSalesOrderLine[]
  [key: string]: unknown
}

function mapStatus(s?: string): SalesOrderStatus {
  switch (s) {
    case 'aktivni': return 'ACTIVE'
    case 'dokonceno': return 'COMPLETED'
    case 'storno': return 'CANCELLED'
    default: return 'DRAFT'
  }
}

export function transformSalesOrder(raw: AbraflexiSalesOrder): SalesOrder {
  return {
    id: String(raw.id),
    status: mapStatus(raw.stavK),
    contactId: raw.firma ? String(raw.firma) : undefined,
    currency: raw.mena || undefined,
    totalAmount: raw.sumCelkem,
    postedAt: raw.datVyst ? new Date(raw.datVyst) : undefined,
    lineItems: (raw.polozky ?? []).map(l => ({
      id: String(l.id),
      itemDescription: l.nazev || undefined,
      unitAmount: l.cenaMj,
      unitQuantity: l.mnozstvi,
      totalAmount: l.sumZklZakl,
      accountId: l.ucetni ? String(l.ucetni) : undefined,
    } satisfies Lineitem)),
    metadata: raw as Record<string, unknown>,
  }
}
