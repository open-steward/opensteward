import type { Transaction } from '../../../schema/transaction'

export interface SnelStartTransaction {
  id: string
  datum: string
  bedrag: number
  omschrijving: string
  grootboekrekening: { id: string } | null
  valutacode: string
  boekstukType: string
  [key: string]: unknown
}

export function transformTransaction(raw: SnelStartTransaction): Transaction {
  return {
    id: raw.id,
    accountId: raw.grootboekrekening?.id || undefined,
    type: raw.boekstukType || undefined,
    memo: raw.omschrijving || undefined,
    currency: raw.valutacode || undefined,
    totalAmount: raw.bedrag,
    createdAt: raw.datum ? new Date(raw.datum) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
