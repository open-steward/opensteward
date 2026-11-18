/**
 * AUDIT: No public REST API documentation available for this platform.
 * Field names in this interface are best-effort approximations.
 * Manual verification against a live API connection is required.
 * Reason: Desktop software — no public REST API.
 */

import type { Transaction } from '../../../schema/transaction'
import type { TransactionLineitem } from '../../../schema/shared'

export interface DaneaMovimento {
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

function mapLineitems(raw: DaneaMovimento): TransactionLineitem[] {
  return [
    {
      accountId: raw.ContoId || undefined,
      description: raw.Descrizione || undefined,
      totalAmount: raw.Importo,
    },
  ]
}

export function transformTransaction(raw: DaneaMovimento): Transaction {
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
