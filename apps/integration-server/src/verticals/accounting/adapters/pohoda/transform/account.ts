/**
 * AUDIT: No public REST API documentation available for this platform.
 * Field names in this interface are best-effort approximations.
 * Manual verification against a live API connection is required.
 * Reason: On-premise / no public REST API.
 */

import type { Account } from '../../../schema/account'

export interface PohodaAccount {
  id: string | number
  code?: string
  name?: string
  type?: string
  currency?: string
  balance?: number
  [key: string]: unknown
}

export function transformAccount(raw: PohodaAccount): Account {
  return {
    id: String(raw.id),
    name: raw.name || undefined,
    customerDefinedCode: raw.code || undefined,
    currency: raw.currency || undefined,
    balance: raw.balance,
    metadata: raw as Record<string, unknown>,
  }
}
