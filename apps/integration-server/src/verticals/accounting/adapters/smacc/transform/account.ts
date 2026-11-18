import type { Account } from '../../../schema/account'

export interface SmaccAccount {
  id: string
  code?: string
  name?: string
  type?: string
  currency?: string
  description?: string
  is_active?: boolean
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
    default: return 'unknown'
  }
}

export function transformAccount(raw: SmaccAccount): Account {
  return {
    id: String(raw.id),
    customerDefinedCode: raw.code || undefined,
    name: raw.name || undefined,
    type: mapType(raw.type),
    currency: raw.currency || undefined,
    description: raw.description || undefined,
    status: raw.is_active === false ? 'ARCHIVED' : 'ACTIVE',
    metadata: raw as Record<string, unknown>,
  }
}
