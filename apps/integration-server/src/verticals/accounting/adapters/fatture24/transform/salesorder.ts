import type { SalesOrder, SalesOrderStatus } from '../../../schema/salesorder'
import type { Lineitem } from '../../../schema/shared'

export interface Fatture24RigaOrdineVendita {
  Id: string
  Descrizione: string
  Quantita: number
  Prezzo: number
  Totale: number
  Conto: string
  [key: string]: unknown
}

export interface Fatture24OrdineVendita {
  id: string
  Stato: string
  Valuta: string
  Totale: number
  ClienteId: string
  Data: string
  Righe?: Fatture24RigaOrdineVendita[]
  [key: string]: unknown
}

function mapStatus(stato: string): SalesOrderStatus {
  if (stato === 'completato') return 'COMPLETED'
  if (stato === 'annullato') return 'CANCELLED'
  return 'ACTIVE'
}

function mapLineitem(row: Fatture24RigaOrdineVendita): Lineitem {
  return {
    id: String(row.Id),
    accountId: row.Conto || undefined,
    itemDescription: row.Descrizione || undefined,
    unitAmount: row.Prezzo,
    unitQuantity: row.Quantita,
    totalAmount: row.Totale,
  }
}

export function transformSalesOrder(raw: Fatture24OrdineVendita): SalesOrder {
  return {
    id: String(raw.id),
    status: mapStatus(raw.Stato),
    contactId: raw.ClienteId || undefined,
    currency: raw.Valuta || undefined,
    totalAmount: raw.Totale,
    lineItems: (raw.Righe ?? []).map(mapLineitem),
    postedAt: raw.Data ? new Date(raw.Data) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
