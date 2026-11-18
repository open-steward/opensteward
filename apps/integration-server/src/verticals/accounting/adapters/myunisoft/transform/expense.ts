import type { Expense } from '../../../schema/expense'
import type { Lineitem } from '../../../schema/shared'

export interface MyunisoftExpenseRow {
  id: number
  compte_id: string
  description: string
  ht: number
  tva: number
  [key: string]: unknown
}

export interface MyunisoftExpense {
  id: string
  libelle: string
  fournisseur_id: string
  ht: number
  tva: number
  ttc: number
  devise: string
  date: string
  lignes: MyunisoftExpenseRow[]
  [key: string]: unknown
}

function mapLineitem(row: MyunisoftExpenseRow): Lineitem {
  return {
    id: String(row.id),
    accountId: row.compte_id || undefined,
    itemDescription: row.description || undefined,
    totalAmount: row.ht,
    taxAmount: row.tva || undefined,
  }
}

export function transformExpense(raw: MyunisoftExpense): Expense {
  return {
    id: String(raw.id),
    name: raw.libelle || undefined,
    contactId: raw.fournisseur_id || undefined,
    currency: raw.devise || undefined,
    taxAmount: raw.tva || undefined,
    totalAmount: raw.ttc,
    lineItems: (raw.lignes ?? []).map(mapLineitem),
    postedAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
