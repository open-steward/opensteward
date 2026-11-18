import type { Account, AccountStatus, AccountType } from '../../../schema/account'

export interface FinancioAccount {
  id: string | number
  code: string
  name: string
  type: string
  description: string
  is_active: boolean
  [key: string]: unknown
}

function mapAccountType(type: string): AccountType {
  switch (type) {
    case 'asset':
      return 'ASSET'
    case 'liability':
      return 'LIABILITY'
    case 'equity':
      return 'EQUITY'
    case 'income':
      return 'INCOME'
    case 'expense':
      return 'EXPENSE'
    default:
      return 'OTHER'
  }
}

export function transformAccount(raw: FinancioAccount): Account {
  const status: AccountStatus = raw.is_active ? 'ACTIVE' : 'ARCHIVED'
  return {
    id: String(raw.id),
    name: raw.name || undefined,
    customerDefinedCode: raw.code || undefined,
    type: mapAccountType(raw.type),
    description: raw.description || undefined,
    status,
    metadata: raw as Record<string, unknown>,
  }
}
