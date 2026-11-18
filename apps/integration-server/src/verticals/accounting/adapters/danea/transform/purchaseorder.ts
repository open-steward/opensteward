/**
 * AUDIT: No public REST API documentation available for this platform.
 * Field names in this interface are best-effort approximations.
 * Manual verification against a live API connection is required.
 * Reason: Desktop software — no public REST API.
 */

import type { PurchaseOrder, PurchaseOrderStatus } from '../../../schema/purchaseorder'
import type { Lineitem } from '../../../schema/shared'

export interface DaneaRigaOrdineAcquisto {
  Id: string
  Descrizione: string
  Quantita: number
  Prezzo: number
  Totale: number
  Conto: string
  [key: string]: unknown
}

export interface DaneaOrdineAcquisto {
  id: string
  Stato: string
  Valuta: string
  ImportoTotale: number
  FornitoreId: string
  Data: string
  Righe?: DaneaRigaOrdineAcquisto[]
  [key: string]: unknown
}

function mapStatus(stato: string): PurchaseOrderStatus {
  if (stato === 'Ricevuto') return 'COMPLETED'
  if (stato === 'Annullato') return 'CANCELLED'
  return 'ACTIVE'
}

function mapLineitem(row: DaneaRigaOrdineAcquisto): Lineitem {
  return {
    id: String(row.Id),
    accountId: row.Conto || undefined,
    itemDescription: row.Descrizione || undefined,
    unitAmount: row.Prezzo,
    unitQuantity: row.Quantita,
    totalAmount: row.Totale,
  }
}

export function transformPurchaseOrder(raw: DaneaOrdineAcquisto): PurchaseOrder {
  return {
    id: String(raw.id),
    status: mapStatus(raw.Stato),
    contactId: raw.FornitoreId || undefined,
    currency: raw.Valuta || undefined,
    totalAmount: raw.ImportoTotale,
    lineItems: (raw.Righe ?? []).map(mapLineitem),
    postedAt: raw.Data ? new Date(raw.Data) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
