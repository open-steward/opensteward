/**
 * AUDIT: No public REST API documentation available for this platform.
 * Field names in this interface are best-effort approximations.
 * Manual verification against a live API connection is required.
 * Reason: On-premise / no public REST API.
 */

import type { Account, AccountStatus, AccountType } from '../../../schema/account'

export interface DatevAccount {
  id: string | number
  account_number: string
  name: string
  account_type: string
  active: boolean
  description: string
  [key: string]: unknown
}

function mapAccountType(type: string): AccountType {
  switch (type) {
    case 'asset':
      return 'ASSET'
    case 'liability':
      return 'LIABILITY'
    case 'equity':
      return 'EQUITY'
    case 'income':
      return 'INCOME'
    case 'expense':
      return 'EXPENSE'
    default:
      return 'OTHER'
  }
}

export function transformAccount(raw: DatevAccount): Account {
  const status: AccountStatus = raw.active ? 'ACTIVE' : 'ARCHIVED'
  return {
    id: String(raw.id),
    name: raw.name || undefined,
    customerDefinedCode: raw.account_number || undefined,
    type: mapAccountType(raw.account_type),
    description: raw.description || undefined,
    status,
    metadata: raw as Record<string, unknown>,
  }
}
