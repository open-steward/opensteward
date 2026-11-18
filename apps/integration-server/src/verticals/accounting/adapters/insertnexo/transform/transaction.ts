/**
 * AUDIT: No public REST API documentation available for this platform.
 * Field names in this interface are best-effort approximations.
 * Manual verification against a live API connection is required.
 * Reason: On-premise / no public REST API.
 */

import type { Transaction } from '../../../schema/transaction'

export interface InsertnexoTransaction {
  Id: string | number
  Data?: string
  Kwota?: number
  Waluta?: string
  Opis?: string
  Typ?: string
  KontoId?: string
  KwotaVat?: number
  [key: string]: unknown
}

export function transformTransaction(raw: InsertnexoTransaction): Transaction {
  return {
    id: String(raw.Id),
    accountId: raw.KontoId ? String(raw.KontoId) : undefined,
    type: raw.Typ || undefined,
    memo: raw.Opis || undefined,
    currency: raw.Waluta || undefined,
    totalAmount: raw.Kwota,
    taxAmount: raw.KwotaVat,
    createdAt: raw.Data ? new Date(raw.Data) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
