import type { Account } from '../../../schema/account'

export interface AccounteerAccount {
  id: string
  code?: string
  name?: string
  type?: string
  class?: string
  is_active?: boolean
  balance?: number
  currency?: string
  [key: string]: unknown
}

function mapType(raw?: string): Account['type'] {
  switch (raw?.toLowerCase()) {
    case 'asset': return 'ASSET'
    case 'liability': return 'LIABILITY'
    case 'equity': return 'EQUITY'
    case 'revenue':
    case 'income': return 'INCOME'
    case 'expense': return 'EXPENSE'
    default: return 'unknown'
  }
}

export function transformAccount(raw: AccounteerAccount): Account {
  return {
    id: String(raw.id),
    customerDefinedCode: raw.code || undefined,
    name: raw.name || undefined,
    type: mapType(raw.type),
    status: (raw.is_active ?? true) ? 'ACTIVE' : 'ARCHIVED',
    balance: typeof raw.balance === 'number' ? raw.balance : undefined,
    currency: raw.currency || undefined,
    metadata: raw as Record<string, unknown>,
  }
}
