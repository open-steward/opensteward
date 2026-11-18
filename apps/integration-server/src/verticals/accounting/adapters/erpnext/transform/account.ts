import type { Account, AccountType, AccountStatus } from '../../../schema/account'

export interface ErpNextAccount {
  name: string
  account_name: string
  account_number: string
  account_type: string
  disabled: number | boolean
  [key: string]: unknown
}

function mapAccountType(type: string): AccountType {
  switch (type) {
    case 'Asset':
    case 'Receivable':
      return 'ASSET'
    case 'Liability':
    case 'Payable':
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

export function transformAccount(raw: ErpNextAccount): Account {
  const status: AccountStatus = raw.disabled ? 'ARCHIVED' : 'ACTIVE'
  return {
    id: raw.name,
    name: raw.account_name || undefined,
    customerDefinedCode: raw.account_number || raw.name || undefined,
    type: mapAccountType(raw.account_type),
    status,
    metadata: raw as Record<string, unknown>,
  }
}
