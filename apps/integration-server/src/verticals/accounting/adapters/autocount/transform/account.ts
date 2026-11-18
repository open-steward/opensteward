import type { Account, AccountStatus, AccountType } from '../../../schema/account'

export interface AutocountAccount {
  AccNo: string
  Description: string
  AccType: string
  IsActive: boolean
  Balance: number
  [key: string]: unknown
}

function mapAccType(accType: string): AccountType | undefined {
  switch (accType.toLowerCase()) {
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

export function transformAccount(raw: AutocountAccount): Account {
  const status: AccountStatus = raw.IsActive ? 'ACTIVE' : 'ARCHIVED'
  return {
    id: raw.AccNo,
    name: raw.Description || undefined,
    customerDefinedCode: raw.AccNo || undefined,
    type: mapAccType(raw.AccType),
    status,
    balance: raw.Balance,
    metadata: raw as Record<string, unknown>,
  }
}
