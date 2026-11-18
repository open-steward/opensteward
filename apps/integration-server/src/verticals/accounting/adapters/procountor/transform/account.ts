import type { Account, AccountStatus, AccountType } from '../../../schema/account'

export interface ProcountorAccount {
  id: number
  number: number
  name: string
  accountType: string
  active: boolean
  [key: string]: unknown
}

function mapAccountType(type: string): AccountType {
  switch (type) {
    case 'ASSETS':
      return 'ASSET'
    case 'LIABILITIES':
      return 'LIABILITY'
    case 'EXPENSES':
      return 'EXPENSE'
    case 'REVENUE':
      return 'INCOME'
    case 'EQUITY':
      return 'EQUITY'
    default:
      return 'OTHER'
  }
}

export function transformAccount(raw: ProcountorAccount): Account {
  const status: AccountStatus = raw.active ? 'ACTIVE' : 'ARCHIVED'
  return {
    id: String(raw.id),
    name: raw.name || undefined,
    customerDefinedCode: String(raw.number),
    type: mapAccountType(raw.accountType),
    status,
    metadata: raw as Record<string, unknown>,
  }
}
