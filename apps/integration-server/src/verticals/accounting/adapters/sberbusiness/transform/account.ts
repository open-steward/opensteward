import type { Account, AccountType } from '../../../schema/account'

export interface SberbusinessAccount {
  accountId?: string
  accountName?: string
  accountType?: string
  currency?: string
  [key: string]: unknown
}

function mapType(t?: string): AccountType | undefined {
  switch (t) {
    case 'CURRENT': return 'ASSET'
    case 'CASH': return 'ASSET'
    case 'ASSET': return 'ASSET'
    case 'LIABILITY': return 'LIABILITY'
    case 'EQUITY': return 'EQUITY'
    case 'INCOME': return 'INCOME'
    case 'EXPENSE': return 'EXPENSE'
    default: return 'unknown'
  }
}

export function transformAccount(raw: SberbusinessAccount): Account {
  return {
    id: raw.accountId ? String(raw.accountId) : '',
    name: raw.accountName || undefined,
    type: mapType(raw.accountType),
    currency: raw.currency || undefined,
    metadata: raw as Record<string, unknown>,
  }
}
