import type { Account, AccountType } from '../../../schema/account'

export interface MorningAccount {
  id: string
  name: string
  type?: string
  balance?: number
  currency?: string
  [key: string]: unknown
}

function mapAccountType(type?: string): AccountType | undefined {
  switch (type?.toLowerCase()) {
    case 'asset': return 'ASSET'
    case 'liability': return 'LIABILITY'
    case 'equity': return 'EQUITY'
    case 'income': return 'INCOME'
    case 'expense': return 'EXPENSE'
    default: return 'OTHER'
  }
}

export function transformAccount(raw: MorningAccount): Account {
  return {
    id: raw.id,
    name: raw.name || undefined,
    type: mapAccountType(raw.type),
    balance: raw.balance,
    currency: raw.currency || undefined,
    status: 'ACTIVE',
    metadata: raw as Record<string, unknown>,
  }
}
