import type { Order, OrderStatus } from '../../../schema/order'
import type { Lineitem } from '../../../schema/shared'

export interface Fatture24RigaOrdine {
  Id: string
  Descrizione: string
  Quantita: number
  Prezzo: number
  Totale: number
  Conto: string
  [key: string]: unknown
}

export interface Fatture24Ordine {
  id: string
  Stato: string
  Valuta: string
  Totale: number
  ClienteId: string
  Data: string
  Righe?: Fatture24RigaOrdine[]
  [key: string]: unknown
}

function mapStatus(stato: string): OrderStatus {
  if (stato === 'completato') return 'COMPLETED'
  if (stato === 'annullato') return 'CANCELLED'
  return 'ACTIVE'
}

function mapLineitem(row: Fatture24RigaOrdine): Lineitem {
  return {
    id: String(row.Id),
    accountId: row.Conto || undefined,
    itemDescription: row.Descrizione || undefined,
    unitAmount: row.Prezzo,
    unitQuantity: row.Quantita,
    totalAmount: row.Totale,
  }
}

export function transformOrder(raw: Fatture24Ordine): Order {
  return {
    id: String(raw.id),
    status: mapStatus(raw.Stato),
    type: 'SALES',
    contactId: raw.ClienteId || undefined,
    currency: raw.Valuta || undefined,
    totalAmount: raw.Totale,
    lineItems: (raw.Righe ?? []).map(mapLineitem),
    postedAt: raw.Data ? new Date(raw.Data) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
