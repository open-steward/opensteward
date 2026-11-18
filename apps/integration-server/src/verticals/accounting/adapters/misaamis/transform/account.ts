import type { Account, AccountStatus, AccountType } from '../../../schema/account'

export interface MisaAmisAccount {
  id: string
  account_number: string
  account_name: string
  account_type: string
  is_active: boolean
  description: string
  balance: number
  [key: string]: unknown
}

function mapAccountType(type: string): AccountType {
  switch (type.toLowerCase()) {
    case 'asset':
      return 'ASSET'
    case 'liability':
      return 'LIABILITY'
    case 'equity':
      return 'EQUITY'
    case 'income':
      return 'INCOME'
    case 'expense':
    case 'cost':
      return 'EXPENSE'
    default:
      return 'OTHER'
  }
}

export function transformAccount(raw: MisaAmisAccount): Account {
  const status: AccountStatus = raw.is_active ? 'ACTIVE' : 'ARCHIVED'
  return {
    id: raw.id,
    name: raw.account_name || undefined,
    description: raw.description || undefined,
    customerDefinedCode: raw.account_number || undefined,
    type: mapAccountType(raw.account_type),
    status,
    balance: raw.balance,
    metadata: raw as Record<string, unknown>,
  }
}
