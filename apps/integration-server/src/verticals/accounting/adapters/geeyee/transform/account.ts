import type { Account, AccountType } from '../../../schema/account'

export interface GeeyeeAccount {
  accountId?: string
  accountName?: string
  accountCode?: string
  accountType?: string
  currency?: string
  [key: string]: unknown
}

function mapType(t?: string): AccountType | undefined {
  switch (t) {
    case 'asset': return 'ASSET'
    case 'liability': return 'LIABILITY'
    case 'equity': return 'EQUITY'
    case 'revenue': return 'INCOME'
    case 'expense': return 'EXPENSE'
    default: return 'unknown'
  }
}

export function transformAccount(raw: GeeyeeAccount): Account {
  return {
    id: raw.accountId ? String(raw.accountId) : '',
    name: raw.accountName || undefined,
    customerDefinedCode: raw.accountCode || undefined,
    type: mapType(raw.accountType),
    currency: raw.currency || undefined,
    metadata: raw as Record<string, unknown>,
  }
}
