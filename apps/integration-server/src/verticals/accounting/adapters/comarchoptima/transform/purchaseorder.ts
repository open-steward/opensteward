/**
 * AUDIT: No public REST API documentation available for this platform.
 * Field names in this interface are best-effort approximations.
 * Manual verification against a live API connection is required.
 * Reason: On-premise / no public REST API.
 */

import type { PurchaseOrder, PurchaseOrderStatus } from '../../../schema/purchaseorder'
import type { Lineitem } from '../../../schema/shared'

export interface ComarchoptimaPurchaseOrderLine {
  id: string | number
  opis?: string
  cena?: number
  ilosc?: number
  wartosc?: number
  konto_id?: string
  [key: string]: unknown
}

export interface ComarchoptimaPurchaseOrder {
  id: string | number
  status?: string
  kontrahent_id?: string | number
  waluta?: string
  wartosc_brutto?: number
  data?: string
  pozycje?: ComarchoptimaPurchaseOrderLine[]
  [key: string]: unknown
}

function mapStatus(s?: string): PurchaseOrderStatus {
  switch (s?.toLowerCase()) {
    case 'aktywne': return 'ACTIVE'
    case 'zrealizowane': return 'COMPLETED'
    case 'anulowane': return 'CANCELLED'
    default: return 'DRAFT'
  }
}

export function transformPurchaseOrder(raw: ComarchoptimaPurchaseOrder): PurchaseOrder {
  return {
    id: String(raw.id),
    status: mapStatus(raw.status),
    contactId: raw.kontrahent_id ? String(raw.kontrahent_id) : undefined,
    currency: raw.waluta || undefined,
    totalAmount: raw.wartosc_brutto,
    postedAt: raw.data ? new Date(raw.data) : undefined,
    lineItems: (raw.pozycje ?? []).map(l => ({
      id: String(l.id),
      itemDescription: l.opis || undefined,
      unitAmount: l.cena,
      unitQuantity: l.ilosc,
      totalAmount: l.wartosc,
      accountId: l.konto_id ? String(l.konto_id) : undefined,
    } satisfies Lineitem)),
    metadata: raw as Record<string, unknown>,
  }
}
