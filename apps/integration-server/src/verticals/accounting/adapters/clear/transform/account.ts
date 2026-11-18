import type { Account, AccountStatus, AccountType } from '../../../schema/account'

export interface ClearAccount {
  id: string
  account_code: string
  account_name: string
  account_type: string
  is_active: boolean
  balance: number
  [key: string]: unknown
}

function mapAccountType(accountType: string): AccountType | undefined {
  switch (accountType.toLowerCase()) {
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
      return undefined
  }
}

export function transformAccount(raw: ClearAccount): Account {
  const status: AccountStatus = raw.is_active ? 'ACTIVE' : 'ARCHIVED'
  return {
    id: raw.id,
    name: raw.account_name || undefined,
    customerDefinedCode: raw.account_code || undefined,
    type: mapAccountType(raw.account_type),
    status,
    balance: raw.balance,
    metadata: raw as Record<string, unknown>,
  }
}
