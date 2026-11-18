import type { SalesOrder, SalesOrderStatus } from '../../../schema/salesorder'
import type { Lineitem } from '../../../schema/shared'

export interface ZucchettiRigaOrdineVendita {
  id: string
  descrizione: string
  quantita: number
  prezzo: number
  totale: number
  conto: string
  [key: string]: unknown
}

export interface ZucchettiOrdineVendita {
  id: string
  stato: string
  valuta: string
  totale: number
  cliente_id: string
  data: string
  righe?: ZucchettiRigaOrdineVendita[]
  [key: string]: unknown
}

function mapStatus(stato: string): SalesOrderStatus {
  if (stato === 'completato') return 'COMPLETED'
  if (stato === 'annullato') return 'CANCELLED'
  return 'ACTIVE'
}

function mapLineitem(row: ZucchettiRigaOrdineVendita): Lineitem {
  return {
    id: String(row.id),
    accountId: row.conto || undefined,
    itemDescription: row.descrizione || undefined,
    unitAmount: row.prezzo,
    unitQuantity: row.quantita,
    totalAmount: row.totale,
  }
}

export function transformSalesOrder(raw: ZucchettiOrdineVendita): SalesOrder {
  return {
    id: String(raw.id),
    status: mapStatus(raw.stato),
    contactId: raw.cliente_id || undefined,
    currency: raw.valuta || undefined,
    totalAmount: raw.totale,
    lineItems: (raw.righe ?? []).map(mapLineitem),
    postedAt: raw.data ? new Date(raw.data) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
