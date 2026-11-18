import type { Account, AccountType } from '../../../schema/account'

export interface WafeqAccount {
  id: string
  code?: string
  name?: string
  type?: string
  is_active?: boolean
  [key: string]: unknown
}

function mapAccountType(type?: string): AccountType | undefined {
  switch (type) {
    case 'income':
      return 'INCOME'
    case 'expense':
      return 'EXPENSE'
    case 'asset':
      return 'ASSET'
    case 'liability':
      return 'LIABILITY'
    case 'equity':
      return 'EQUITY'
    default:
      return undefined
  }
}

export function transformAccount(raw: WafeqAccount): Account {
  return {
    id: String(raw.id),
    name: raw.name || undefined,
    customerDefinedCode: raw.code || undefined,
    type: mapAccountType(raw.type),
    status: raw.is_active === false ? 'ARCHIVED' : 'ACTIVE',
    metadata: raw as Record<string, unknown>,
  }
}
