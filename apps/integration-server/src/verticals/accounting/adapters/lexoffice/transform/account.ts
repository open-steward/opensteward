import type { Account, AccountType } from '../../../schema/account'

export interface LexofficeAccount {
  id: string
  name: string
  number: string
  type: string
  description: string
  [key: string]: unknown
}

function mapType(type: string): AccountType {
  switch (type) {
    case 'revenue': return 'INCOME'
    case 'expenditure': return 'EXPENSE'
    case 'asset': return 'ASSET'
    case 'liability': return 'LIABILITY'
    case 'equity': return 'EQUITY'
    default: return 'OTHER'
  }
}

export function transformAccount(raw: LexofficeAccount): Account {
  return {
    id: raw.id,
    name: raw.name || undefined,
    customerDefinedCode: raw.number || undefined,
    description: raw.description || undefined,
    type: mapType(raw.type),
    metadata: raw as Record<string, unknown>,
  }
}
