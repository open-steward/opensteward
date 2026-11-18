import type { Transaction } from '../../../schema/transaction'
import type { TransactionLineitem } from '../../../schema/shared'

export interface AnfixTransaction {
  id: string
  cuenta_id: string
  tipo: string
  referencia: string
  divisa: string
  importe: number
  fecha: string
  descripcion: string
  [key: string]: unknown
}

export function transformTransaction(raw: AnfixTransaction): Transaction {
  const lineItems: TransactionLineitem[] = [
    {
      accountId: raw.cuenta_id || undefined,
      description: raw.descripcion || undefined,
      totalAmount: raw.importe,
    },
  ]
  return {
    id: raw.id,
    accountId: raw.cuenta_id || undefined,
    type: raw.tipo || undefined,
    reference: raw.referencia || undefined,
    currency: raw.divisa || undefined,
    totalAmount: raw.importe,
    lineItems,
    createdAt: raw.fecha ? new Date(raw.fecha) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
