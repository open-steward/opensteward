import type { Account, AccountType } from '../../../schema/account'

export interface FlowAccountAccount {
  id: string | number
  code: string
  name: string
  accountCategory: string
  balance: number
  [key: string]: unknown
}

function mapAccountType(category: string): AccountType {
  switch (category?.toLowerCase()) {
    case 'asset':
      return 'ASSET'
    case 'liability':
      return 'LIABILITY'
    case 'equity':
      return 'EQUITY'
    case 'income':
    case 'revenue':
      return 'INCOME'
    case 'expense':
      return 'EXPENSE'
    default:
      return 'OTHER'
  }
}

export function transformAccount(raw: FlowAccountAccount): Account {
  return {
    id: String(raw.id),
    name: raw.name || undefined,
    customerDefinedCode: raw.code || undefined,
    type: mapAccountType(raw.accountCategory),
    balance: raw.balance,
    status: 'ACTIVE',
    metadata: raw as Record<string, unknown>,
  }
}
