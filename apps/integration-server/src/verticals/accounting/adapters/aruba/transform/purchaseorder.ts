import type { PurchaseOrder, PurchaseOrderStatus } from '../../../schema/purchaseorder'
import type { Lineitem } from '../../../schema/shared'

export interface ArubaRigaOrdineAcquisto {
  id: string
  descrizione: string
  quantita: number
  prezzo: number
  totale: number
  conto: string
  [key: string]: unknown
}

export interface ArubaOrdineAcquisto {
  id: string
  stato: string
  valuta: string
  importo_totale: number
  fornitore_id: string
  data: string
  righe?: ArubaRigaOrdineAcquisto[]
  [key: string]: unknown
}

function mapStatus(stato: string): PurchaseOrderStatus {
  if (stato === 'ricevuto') return 'COMPLETED'
  if (stato === 'annullato') return 'CANCELLED'
  return 'ACTIVE'
}

function mapLineitem(row: ArubaRigaOrdineAcquisto): Lineitem {
  return {
    id: String(row.id),
    accountId: row.conto || undefined,
    itemDescription: row.descrizione || undefined,
    unitAmount: row.prezzo,
    unitQuantity: row.quantita,
    totalAmount: row.totale,
  }
}

export function transformPurchaseOrder(raw: ArubaOrdineAcquisto): PurchaseOrder {
  return {
    id: String(raw.id),
    status: mapStatus(raw.stato),
    contactId: raw.fornitore_id || undefined,
    currency: raw.valuta || undefined,
    totalAmount: raw.importo_totale,
    lineItems: (raw.righe ?? []).map(mapLineitem),
    postedAt: raw.data ? new Date(raw.data) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
