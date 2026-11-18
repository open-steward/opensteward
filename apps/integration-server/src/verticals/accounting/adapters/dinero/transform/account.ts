import type { Account, AccountStatus, AccountType } from '../../../schema/account'

export interface DineroAccount {
  AccountNumber: number
  Name: string
  AccountType: 'Asset' | 'Liability' | 'Equity' | 'Revenue' | 'Expense'
  IsActive: boolean
  [key: string]: unknown
}

function mapAccountType(type: DineroAccount['AccountType']): AccountType {
  switch (type) {
    case 'Asset':
      return 'ASSET'
    case 'Liability':
      return 'LIABILITY'
    case 'Equity':
      return 'EQUITY'
    case 'Revenue':
      return 'INCOME'
    case 'Expense':
      return 'EXPENSE'
    default:
      return 'OTHER'
  }
}

export function transformAccount(raw: DineroAccount): Account {
  const status: AccountStatus = raw.IsActive ? 'ACTIVE' : 'ARCHIVED'
  return {
    id: String(raw.AccountNumber),
    name: raw.Name || undefined,
    customerDefinedCode: String(raw.AccountNumber),
    type: mapAccountType(raw.AccountType),
    status,
    metadata: raw as Record<string, unknown>,
  }
}
