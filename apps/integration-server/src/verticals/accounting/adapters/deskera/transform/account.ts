import type { Account, AccountStatus, AccountType } from '../../../schema/account'

export interface DeskeraAccount {
  id: string
  code?: string
  name?: string
  accountGroup?: string
  status?: string
  description?: string
  openingBalance?: number
  [key: string]: unknown
}

function mapAccountType(accountGroup?: string): AccountType | undefined {
  switch (accountGroup) {
    case 'ASSET':
      return 'ASSET'
    case 'LIABILITY':
      return 'LIABILITY'
    case 'EQUITY':
      return 'EQUITY'
    case 'INCOME':
      return 'INCOME'
    case 'EXPENSES':
      return 'EXPENSE'
    case 'EXPENSE':
      return 'EXPENSE'
    default:
      return undefined
  }
}

export function transformAccount(raw: DeskeraAccount): Account {
  const status: AccountStatus = raw.status === 'ACTIVE' ? 'ACTIVE' : 'ARCHIVED'
  return {
    id: raw.id,
    name: raw.name || undefined,
    customerDefinedCode: raw.code || undefined,
    description: raw.description || undefined,
    type: mapAccountType(raw.accountGroup),
    status,
    balance: raw.openingBalance,
    metadata: raw as Record<string, unknown>,
  }
}
