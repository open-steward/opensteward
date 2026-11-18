import type { Expense } from '../../../schema/expense'
import type { Lineitem } from '../../../schema/shared'

export interface TiimeExpenseRow {
  id: number
  compte_id: string
  description: string
  montant_ht: number
  montant_tva: number
  [key: string]: unknown
}

export interface TiimeExpense {
  id: string
  libelle: string
  fournisseur_id: string
  montant_ht: number
  montant_tva: number
  montant_ttc: number
  devise: string
  date: string
  lignes: TiimeExpenseRow[]
  [key: string]: unknown
}

function mapLineitem(row: TiimeExpenseRow): Lineitem {
  return {
    id: String(row.id),
    accountId: row.compte_id || undefined,
    itemDescription: row.description || undefined,
    totalAmount: row.montant_ht,
    taxAmount: row.montant_tva || undefined,
  }
}

export function transformExpense(raw: TiimeExpense): Expense {
  return {
    id: String(raw.id),
    name: raw.libelle || undefined,
    contactId: raw.fournisseur_id || undefined,
    currency: raw.devise || undefined,
    taxAmount: raw.montant_tva || undefined,
    totalAmount: raw.montant_ttc,
    lineItems: (raw.lignes ?? []).map(mapLineitem),
    postedAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
