/**
 * Crater chart-of-accounts transform.
 *
 * Crater exposes a chart of accounts via GET /api/v1/accounts.
 * Each account has an id, name, type, and optional sub_type.
 */
import type { Account, AccountStatus, AccountType } from '../../../schema/account'

export interface CraterAccount {
  id: string
  name: string
  type?: string        // ASSET, LIABILITY, EQUITY, INCOME, EXPENSE
  sub_type?: string
  status?: string      // ACTIVE | ARCHIVED
  currency?: string
  [key: string]: unknown
}

function mapType(raw: string | undefined): AccountType | undefined {
  if (!raw) return undefined
  switch (raw.toUpperCase()) {
    case 'ASSET':     return 'ASSET'
    case 'LIABILITY': return 'LIABILITY'
    case 'EQUITY':    return 'EQUITY'
    case 'INCOME':    return 'INCOME'
    case 'EXPENSE':   return 'EXPENSE'
    default:          return 'OTHER'
  }
}

function mapStatus(raw: string | undefined): AccountStatus | undefined {
  if (!raw) return undefined
  return raw.toUpperCase() === 'ARCHIVED' ? 'ARCHIVED' : 'ACTIVE'
}

export function transformAccount(raw: CraterAccount): Account {
  return {
    id: String(raw.id),
    name: raw.name || undefined,
    type: mapType(raw.type),
    status: mapStatus(raw.status),
    currency: raw.currency || undefined,
    metadata: raw as Record<string, unknown>,
  }
}
