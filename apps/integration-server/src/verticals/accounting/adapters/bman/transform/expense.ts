import type { Expense } from '../../../schema/expense'
import type { Lineitem } from '../../../schema/shared'

export interface BmanRigaSpesa {
  id: string
  conto: string
  descrizione: string
  totale: number
  iva: number
  [key: string]: unknown
}

export interface BmanSpesa {
  id: string
  descrizione: string
  fornitore_id: string
  valuta: string
  iva: number
  totale: number
  data: string
  righe?: BmanRigaSpesa[]
  [key: string]: unknown
}

function mapLineitem(row: BmanRigaSpesa): Lineitem {
  return {
    id: String(row.id),
    accountId: row.conto || undefined,
    itemDescription: row.descrizione || undefined,
    totalAmount: row.totale,
    taxAmount: row.iva || undefined,
  }
}

export function transformExpense(raw: BmanSpesa): Expense {
  return {
    id: String(raw.id),
    name: raw.descrizione || undefined,
    contactId: raw.fornitore_id || undefined,
    currency: raw.valuta || undefined,
    taxAmount: raw.iva || undefined,
    totalAmount: raw.totale,
    lineItems: (raw.righe ?? []).map(mapLineitem),
    postedAt: raw.data ? new Date(raw.data) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
