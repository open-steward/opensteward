import type { Account, AccountType } from '../../../schema/account'

export interface AccurateAccount {
  id: number
  no: string
  name: string
  type: string
  balance: number
  [key: string]: unknown
}

function mapAccountType(type: string): AccountType {
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

export function transformAccount(raw: AccurateAccount): Account {
  return {
    id: String(raw.id),
    name: raw.name || undefined,
    customerDefinedCode: raw.no || undefined,
    type: mapAccountType(raw.type),
    balance: raw.balance,
    metadata: raw as Record<string, unknown>,
  }
}
