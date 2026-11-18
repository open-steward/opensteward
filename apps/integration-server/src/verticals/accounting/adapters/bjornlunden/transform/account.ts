import type { Account, AccountStatus, AccountType } from '../../../schema/account'

export interface BlAccount {
  AccountNumber: number
  Name: string
  Description: string
  Type: string
  IsActive: boolean
  Currency: string
  [key: string]: unknown
}

function mapAccountType(type: string): AccountType | undefined {
  switch (type) {
    case 'Asset':
      return 'ASSET'
    case 'Liability':
      return 'LIABILITY'
    case 'Equity':
      return 'EQUITY'
    case 'Income':
      return 'INCOME'
    case 'Expense':
      return 'EXPENSE'
    default:
      return 'OTHER'
  }
}

export function transformAccount(raw: BlAccount): Account {
  const status: AccountStatus = raw.IsActive ? 'ACTIVE' : 'ARCHIVED'
  return {
    id: String(raw.AccountNumber),
    name: raw.Name || undefined,
    description: raw.Description || undefined,
    customerDefinedCode: String(raw.AccountNumber),
    type: mapAccountType(raw.Type),
    status,
    currency: raw.Currency || undefined,
    metadata: raw as Record<string, unknown>,
  }
}
