/**
 * AUDIT: No public REST API documentation available for this platform.
 * Field names in this interface are best-effort approximations.
 * Manual verification against a live API connection is required.
 * Reason: Platform deprecated (Debitoor shut down).
 */

import type { Account, AccountStatus } from '../../../schema/account'

export interface DebitoorAccount {
  id: string
  accountNumber: string
  name: string
  isActive: boolean
  balance: number
  type: string
  [key: string]: unknown
}

export function transformAccount(raw: DebitoorAccount): Account {
  const status: AccountStatus = raw.isActive ? 'ACTIVE' : 'ARCHIVED'
  return {
    id: raw.id,
    name: raw.name || undefined,
    customerDefinedCode: raw.accountNumber || undefined,
    status,
    balance: raw.balance,
    metadata: raw as Record<string, unknown>,
  }
}
