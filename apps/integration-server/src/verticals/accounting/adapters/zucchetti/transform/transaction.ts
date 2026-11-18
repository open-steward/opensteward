import type { Transaction } from '../../../schema/transaction'
import type { TransactionLineitem } from '../../../schema/shared'

export interface ZucchettiMovimento {
  id: string
  conto_id: string
  tipo: string
  riferimento: string
  valuta: string
  importo: number
  data: string
  descrizione: string
  [key: string]: unknown
}

function mapLineitems(raw: ZucchettiMovimento): TransactionLineitem[] {
  return [
    {
      accountId: raw.conto_id || undefined,
      description: raw.descrizione || undefined,
      totalAmount: raw.importo,
    },
  ]
}

export function transformTransaction(raw: ZucchettiMovimento): Transaction {
  return {
    id: String(raw.id),
    accountId: raw.conto_id || undefined,
    type: raw.tipo || undefined,
    reference: raw.riferimento || undefined,
    currency: raw.valuta || undefined,
    totalAmount: raw.importo,
    lineItems: mapLineitems(raw),
    createdAt: raw.data ? new Date(raw.data) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
