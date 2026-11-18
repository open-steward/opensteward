import type { Transaction } from '../../../schema/transaction'
import type { TransactionLineitem } from '../../../schema/shared'

export interface Fatture24Movimento {
  id: string
  ContoId: string
  Tipo: string
  Riferimento: string
  Valuta: string
  Importo: number
  Data: string
  Descrizione: string
  [key: string]: unknown
}

function mapLineitems(raw: Fatture24Movimento): TransactionLineitem[] {
  return [{ accountId: raw.ContoId || undefined, description: raw.Descrizione || undefined, totalAmount: raw.Importo }]
}

export function transformTransaction(raw: Fatture24Movimento): Transaction {
  return {
    id: String(raw.id),
    accountId: raw.ContoId || undefined,
    type: raw.Tipo || undefined,
    reference: raw.Riferimento || undefined,
    currency: raw.Valuta || undefined,
    totalAmount: raw.Importo,
    lineItems: mapLineitems(raw),
    createdAt: raw.Data ? new Date(raw.Data) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
