import type { Account, AccountStatus, AccountType } from '../../../schema/account'

export interface ReckonAccount {
  id: string
  number: string
  name: string
  type: string
  isActive: boolean
  description: string
  balance: number
  [key: string]: unknown
}

function mapAccountType(type: string): AccountType {
  switch (type?.toUpperCase()) {
    case 'ASSET':
      return 'ASSET'
    case 'LIABILITY':
      return 'LIABILITY'
    case 'EQUITY':
      return 'EQUITY'
    case 'INCOME':
      return 'INCOME'
    case 'EXPENSE':
      return 'EXPENSE'
    default:
      return 'OTHER'
  }
}

export function transformAccount(raw: ReckonAccount): Account {
  const status: AccountStatus = raw.isActive ? 'ACTIVE' : 'ARCHIVED'
  return {
    id: raw.id,
    name: raw.name || undefined,
    description: raw.description || undefined,
    customerDefinedCode: raw.number || undefined,
    type: mapAccountType(raw.type),
    status,
    balance: raw.balance,
    metadata: raw as Record<string, unknown>,
  }
}
