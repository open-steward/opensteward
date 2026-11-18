/**
 * AUDIT: No public REST API documentation available for this platform.
 * Field names in this interface are best-effort approximations.
 * Manual verification against a live API connection is required.
 * Reason: Desktop software — no public REST API.
 */

import type { Order, OrderStatus } from '../../../schema/order'
import type { Lineitem } from '../../../schema/shared'

export interface DaneaRigaOrdine {
  Id: string
  Descrizione: string
  Quantita: number
  Prezzo: number
  Totale: number
  Conto: string
  [key: string]: unknown
}

export interface DaneaOrdine {
  id: string
  Stato: string
  Valuta: string
  ImportoTotale: number
  ClienteId: string
  Data: string
  Righe?: DaneaRigaOrdine[]
  [key: string]: unknown
}

function mapStatus(stato: string): OrderStatus {
  if (stato === 'Completato') return 'COMPLETED'
  if (stato === 'Annullato') return 'CANCELLED'
  return 'ACTIVE'
}

function mapLineitem(row: DaneaRigaOrdine): Lineitem {
  return {
    id: String(row.Id),
    accountId: row.Conto || undefined,
    itemDescription: row.Descrizione || undefined,
    unitAmount: row.Prezzo,
    unitQuantity: row.Quantita,
    totalAmount: row.Totale,
  }
}

export function transformOrder(raw: DaneaOrdine): Order {
  return {
    id: String(raw.id),
    status: mapStatus(raw.Stato),
    type: 'SALES',
    contactId: raw.ClienteId || undefined,
    currency: raw.Valuta || undefined,
    totalAmount: raw.ImportoTotale,
    lineItems: (raw.Righe ?? []).map(mapLineitem),
    postedAt: raw.Data ? new Date(raw.Data) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
