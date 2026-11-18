/**
 * AUDIT: No public REST API documentation available for this platform.
 * Field names in this interface are best-effort approximations.
 * Manual verification against a live API connection is required.
 * Reason: Desktop software — no public REST API.
 */

import type { Expense } from '../../../schema/expense'
import type { Lineitem } from '../../../schema/shared'

export interface DaneaRigaSpesa {
  Id: string
  Conto: string
  Descrizione: string
  Totale: number
  Iva: number
  [key: string]: unknown
}

export interface DaneaSpesa {
  id: string
  Descrizione: string
  FornitoreId: string
  Valuta: string
  TotaleIva: number
  TotaleLordo: number
  Data: string
  Righe?: DaneaRigaSpesa[]
  [key: string]: unknown
}

function mapLineitem(row: DaneaRigaSpesa): Lineitem {
  return {
    id: String(row.Id),
    accountId: row.Conto || undefined,
    itemDescription: row.Descrizione || undefined,
    totalAmount: row.Totale,
    taxAmount: row.Iva || undefined,
  }
}

export function transformExpense(raw: DaneaSpesa): Expense {
  return {
    id: String(raw.id),
    name: raw.Descrizione || undefined,
    contactId: raw.FornitoreId || undefined,
    currency: raw.Valuta || undefined,
    taxAmount: raw.TotaleIva || undefined,
    totalAmount: raw.TotaleLordo,
    lineItems: (raw.Righe ?? []).map(mapLineitem),
    postedAt: raw.Data ? new Date(raw.Data) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
