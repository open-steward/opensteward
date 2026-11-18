/**
 * AUDIT: No public REST API documentation available for this platform.
 * Field names in this interface are best-effort approximations.
 * Manual verification against a live API connection is required.
 * Reason: On-premise / no public REST API.
 */

import type { Account } from '../../../schema/account'

export interface ComarchoptimaAccount {
  id: string | number
  numer?: string
  nazwa?: string
  typ?: string
  waluta?: string
  saldo?: number
  [key: string]: unknown
}

export function transformAccount(raw: ComarchoptimaAccount): Account {
  return {
    id: String(raw.id),
    name: raw.nazwa || undefined,
    customerDefinedCode: raw.numer || undefined,
    currency: raw.waluta || undefined,
    balance: raw.saldo,
    metadata: raw as Record<string, unknown>,
  }
}
