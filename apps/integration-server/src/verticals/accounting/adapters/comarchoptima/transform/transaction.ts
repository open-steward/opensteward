/**
 * AUDIT: No public REST API documentation available for this platform.
 * Field names in this interface are best-effort approximations.
 * Manual verification against a live API connection is required.
 * Reason: On-premise / no public REST API.
 */

import type { Transaction } from '../../../schema/transaction'

export interface ComarchoptimaTransaction {
  id: string | number
  data?: string
  kwota?: number
  waluta?: string
  opis?: string
  typ?: string
  konto_id?: string
  kwota_vat?: number
  [key: string]: unknown
}

export function transformTransaction(raw: ComarchoptimaTransaction): Transaction {
  return {
    id: String(raw.id),
    accountId: raw.konto_id ? String(raw.konto_id) : undefined,
    type: raw.typ || undefined,
    memo: raw.opis || undefined,
    currency: raw.waluta || undefined,
    totalAmount: raw.kwota,
    taxAmount: raw.kwota_vat,
    createdAt: raw.data ? new Date(raw.data) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
