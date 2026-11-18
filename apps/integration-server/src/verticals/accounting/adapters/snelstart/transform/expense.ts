import type { Expense } from '../../../schema/expense'

export interface SnelStartExpense {
  id: string
  omschrijving: string
  relatie: { id: string } | null
  grootboekrekening: { id: string } | null
  valutacode: string
  factuurbedrag: number
  btw: number
  factuurdatum: string
  [key: string]: unknown
}

export function transformExpense(raw: SnelStartExpense): Expense {
  return {
    id: raw.id,
    name: raw.omschrijving || undefined,
    accountId: raw.grootboekrekening?.id || undefined,
    contactId: raw.relatie?.id || undefined,
    currency: raw.valutacode || undefined,
    taxAmount: raw.btw || undefined,
    totalAmount: raw.factuurbedrag,
    postedAt: raw.factuurdatum ? new Date(raw.factuurdatum) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
