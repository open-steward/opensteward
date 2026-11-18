import type { Expense } from '../../../schema/expense'
import type { Lineitem } from '../../../schema/shared'

export interface Fatture24RigaSpesa {
  Id: string
  Conto: string
  Descrizione: string
  Totale: number
  Iva: number
  [key: string]: unknown
}

export interface Fatture24Spesa {
  id: string
  Descrizione: string
  FornitoreId: string
  Valuta: string
  Iva: number
  Totale: number
  DataFattura: string
  Righe?: Fatture24RigaSpesa[]
  [key: string]: unknown
}

function mapLineitem(row: Fatture24RigaSpesa): Lineitem {
  return {
    id: String(row.Id),
    accountId: row.Conto || undefined,
    itemDescription: row.Descrizione || undefined,
    totalAmount: row.Totale,
    taxAmount: row.Iva || undefined,
  }
}

export function transformExpense(raw: Fatture24Spesa): Expense {
  return {
    id: String(raw.id),
    name: raw.Descrizione || undefined,
    contactId: raw.FornitoreId || undefined,
    currency: raw.Valuta || undefined,
    taxAmount: raw.Iva || undefined,
    totalAmount: raw.Totale,
    lineItems: (raw.Righe ?? []).map(mapLineitem),
    postedAt: raw.DataFattura ? new Date(raw.DataFattura) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
