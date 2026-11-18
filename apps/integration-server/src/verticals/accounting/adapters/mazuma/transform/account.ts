import type { Account } from '../../../schema/account'

export interface MazumaAccount {
  id: string
  code?: string
  name?: string
  type?: string
  is_active?: boolean
  balance?: number
  [key: string]: unknown
}

function mapType(raw?: string): Account['type'] {
  switch (raw?.toLowerCase()) {
    case 'asset': return 'ASSET'
    case 'liability': return 'LIABILITY'
    case 'equity': return 'EQUITY'
    case 'income':
    case 'revenue': return 'INCOME'
    case 'expense': return 'EXPENSE'
    default: return 'OTHER'
  }
}

export function transformAccount(raw: MazumaAccount): Account {
  return {
    id: String(raw.id),
    customerDefinedCode: raw.code || undefined,
    name: raw.name || undefined,
    type: mapType(raw.type),
    status: (raw.is_active ?? true) ? 'ACTIVE' : 'ARCHIVED',
    balance: typeof raw.balance === 'number' ? raw.balance : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
