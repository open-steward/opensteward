/**
 * AUDIT: No public REST API documentation available for this platform.
 * Field names in this interface are best-effort approximations.
 * Manual verification against a live API connection is required.
 * Reason: Primary API is XML-based; REST API availability unconfirmed.
 */

import type { Account, AccountStatus } from '../../../schema/account'

export interface SzamlazzhuAccount {
  id: string | number
  code?: string
  name?: string
  active?: boolean
  balance?: number
  [key: string]: unknown
}

export function transformAccount(raw: SzamlazzhuAccount): Account {
  const status: AccountStatus = raw.active === false ? 'ARCHIVED' : 'ACTIVE'
  return {
    id: String(raw.id),
    name: raw.name || undefined,
    customerDefinedCode: raw.code || String(raw.id),
    status,
    balance: raw.balance,
    metadata: raw as Record<string, unknown>,
  }
}
