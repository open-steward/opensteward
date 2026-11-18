/**
 * AUDIT: No public REST API documentation available for this platform.
 * Field names in this interface are best-effort approximations.
 * Manual verification against a live API connection is required.
 * Reason: On-premise / no public REST API.
 */

import type { SalesOrder, SalesOrderStatus } from '../../../schema/salesorder'
import type { Lineitem } from '../../../schema/shared'

export interface InsertnexoSalesOrderLine {
  Id: string | number
  Opis?: string
  Cena?: number
  Ilosc?: number
  Wartosc?: number
  KontoId?: string
  [key: string]: unknown
}

export interface InsertnexoSalesOrder {
  Id: string | number
  Status?: string
  KontrahentId?: string | number
  Waluta?: string
  Brutto?: number
  Data?: string
  Pozycje?: InsertnexoSalesOrderLine[]
  [key: string]: unknown
}

function mapStatus(s?: string): SalesOrderStatus {
  switch (s?.toLowerCase()) {
    case 'aktywne': return 'ACTIVE'
    case 'zrealizowane': return 'COMPLETED'
    case 'anulowane': return 'CANCELLED'
    default: return 'DRAFT'
  }
}

export function transformSalesOrder(raw: InsertnexoSalesOrder): SalesOrder {
  return {
    id: String(raw.Id),
    status: mapStatus(raw.Status),
    contactId: raw.KontrahentId ? String(raw.KontrahentId) : undefined,
    currency: raw.Waluta || undefined,
    totalAmount: raw.Brutto,
    postedAt: raw.Data ? new Date(raw.Data) : undefined,
    lineItems: (raw.Pozycje ?? []).map(l => ({
      id: String(l.Id),
      itemDescription: l.Opis || undefined,
      unitAmount: l.Cena,
      unitQuantity: l.Ilosc,
      totalAmount: l.Wartosc,
      accountId: l.KontoId ? String(l.KontoId) : undefined,
    } satisfies Lineitem)),
    metadata: raw as Record<string, unknown>,
  }
}
