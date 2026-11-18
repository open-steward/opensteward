import type { Account, AccountType } from '../../../schema/account'

export interface MasteraccountingAccount {
  id: string
  code: string
  name: string
  type?: string
  currency?: string
  [key: string]: unknown
}

function mapAccountType(type?: string): AccountType | undefined {
  switch (type) {
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

export function transformAccount(raw: MasteraccountingAccount): Account {
  return {
    id: String(raw.id),
    name: raw.name || undefined,
    customerDefinedCode: raw.code || undefined,
    type: mapAccountType(raw.type),
    status: 'ACTIVE',
    currency: raw.currency || undefined,
    metadata: raw as Record<string, unknown>,
  }
}
