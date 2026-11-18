import type { Expense } from '../../../schema/expense'
import type { Lineitem } from '../../../schema/shared'

export interface ArubaRigaSpesa {
  id: string
  conto: string
  descrizione: string
  totale: number
  iva: number
  [key: string]: unknown
}

export interface ArubaSpesa {
  id: string
  descrizione: string
  fornitore_id: string
  valuta: string
  importo_iva: number
  importo_totale: number
  data: string
  righe?: ArubaRigaSpesa[]
  [key: string]: unknown
}

function mapLineitem(row: ArubaRigaSpesa): Lineitem {
  return {
    id: String(row.id),
    accountId: row.conto || undefined,
    itemDescription: row.descrizione || undefined,
    totalAmount: row.totale,
    taxAmount: row.iva || undefined,
  }
}

export function transformExpense(raw: ArubaSpesa): Expense {
  return {
    id: String(raw.id),
    name: raw.descrizione || undefined,
    contactId: raw.fornitore_id || undefined,
    currency: raw.valuta || undefined,
    taxAmount: raw.importo_iva || undefined,
    totalAmount: raw.importo_totale,
    lineItems: (raw.righe ?? []).map(mapLineitem),
    postedAt: raw.data ? new Date(raw.data) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
