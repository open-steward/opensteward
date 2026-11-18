import type { Account, AccountType } from '../../../schema/account'

export interface KingdeeAccount {
  acctId?: string
  acctName?: string
  acctCode?: string
  acctType?: string
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

export function transformAccount(raw: KingdeeAccount): Account {
  return {
    id: raw.acctId ? String(raw.acctId) : '',
    name: raw.acctName || undefined,
    customerDefinedCode: raw.acctCode || undefined,
    type: mapType(raw.acctType),
    currency: raw.currency || undefined,
    metadata: raw as Record<string, unknown>,
  }
}
