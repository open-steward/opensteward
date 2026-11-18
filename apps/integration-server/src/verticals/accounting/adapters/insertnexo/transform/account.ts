/**
 * AUDIT: No public REST API documentation available for this platform.
 * Field names in this interface are best-effort approximations.
 * Manual verification against a live API connection is required.
 * Reason: On-premise / no public REST API.
 */

import type { Account } from '../../../schema/account'

export interface InsertnexoAccount {
  Id: string | number
  Numer?: string
  Nazwa?: string
  Typ?: string
  Waluta?: string
  Saldo?: number
  [key: string]: unknown
}

export function transformAccount(raw: InsertnexoAccount): Account {
  return {
    id: String(raw.Id),
    name: raw.Nazwa || undefined,
    customerDefinedCode: raw.Numer || undefined,
    currency: raw.Waluta || undefined,
    balance: raw.Saldo,
    metadata: raw as Record<string, unknown>,
  }
}
