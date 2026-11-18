import type { PurchaseOrder, PurchaseOrderStatus } from '../../../schema/purchaseorder'
import type { Lineitem } from '../../../schema/shared'

export interface Fatture24RigaOrdineAcquisto {
  Id: string
  Descrizione: string
  Quantita: number
  Prezzo: number
  Totale: number
  Conto: string
  [key: string]: unknown
}

export interface Fatture24OrdineAcquisto {
  id: string
  Stato: string
  Valuta: string
  Totale: number
  FornitoreId: string
  Data: string
  Righe?: Fatture24RigaOrdineAcquisto[]
  [key: string]: unknown
}

function mapStatus(stato: string): PurchaseOrderStatus {
  if (stato === 'ricevuto') return 'COMPLETED'
  if (stato === 'annullato') return 'CANCELLED'
  return 'ACTIVE'
}

function mapLineitem(row: Fatture24RigaOrdineAcquisto): Lineitem {
  return {
    id: String(row.Id),
    accountId: row.Conto || undefined,
    itemDescription: row.Descrizione || undefined,
    unitAmount: row.Prezzo,
    unitQuantity: row.Quantita,
    totalAmount: row.Totale,
  }
}

export function transformPurchaseOrder(raw: Fatture24OrdineAcquisto): PurchaseOrder {
  return {
    id: String(raw.id),
    status: mapStatus(raw.Stato),
    contactId: raw.FornitoreId || undefined,
    currency: raw.Valuta || undefined,
    totalAmount: raw.Totale,
    lineItems: (raw.Righe ?? []).map(mapLineitem),
    postedAt: raw.Data ? new Date(raw.Data) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
