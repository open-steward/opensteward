import type { Account, AccountType } from '../../../schema/account'

export interface KonturelbaAccount {
  id?: string
  name?: string
  code?: string
  type?: string
  currency?: string
  [key: string]: unknown
}

function mapType(t?: string): AccountType | undefined {
  switch (t) {
    case 'asset': return 'ASSET'
    case 'liability': return 'LIABILITY'
    case 'equity': return 'EQUITY'
    case 'income': return 'INCOME'
    case 'expense': return 'EXPENSE'
    case 'checking': return 'ASSET'
    case 'cash': return 'ASSET'
    default: return 'unknown'
  }
}

export function transformAccount(raw: KonturelbaAccount): Account {
  return {
    id: raw.id ? String(raw.id) : '',
    name: raw.name || undefined,
    customerDefinedCode: raw.code || undefined,
    type: mapType(raw.type),
    currency: raw.currency || undefined,
    metadata: raw as Record<string, unknown>,
  }
}
