/**
 * AUDIT: No public REST API documentation available for this platform.
 * Field names in this interface are best-effort approximations.
 * Manual verification against a live API connection is required.
 * Reason: On-premise / no public REST API.
 */

import type { Account, AccountType } from '../../../schema/account'
import { parseDecimal } from '../../shared/transform'

export interface Unit4Account {
  accountId: string | number
  accountCode: string
  name: string
  accountType: string
  balance?: number | string
  isActive?: boolean
  companyId?: string | number
  [key: string]: unknown
}

function mapAccountType(type: string): AccountType {
  const t = (type ?? '').toLowerCase()
  if (t.includes('asset') || t.includes('fund')) return 'ASSET'
  if (t.includes('liabilit')) return 'LIABILITY'
  if (t.includes('equity') || t.includes('capital')) return 'EQUITY'
  if (t.includes('income') || t.includes('revenue')) return 'INCOME'
  if (t.includes('expense') || t.includes('cost')) return 'EXPENSE'
  return 'OTHER'
}

export function transformAccount(raw: Unit4Account): Account {
  return {
    id: String(raw.accountId),
    name: raw.name || undefined,
    customerDefinedCode: raw.accountCode || undefined,
    type: mapAccountType(raw.accountType),
    balance: parseDecimal(raw.balance),
    status: raw.isActive === false ? 'ARCHIVED' : 'ACTIVE',
    metadata: raw as Record<string, unknown>,
  }
}
