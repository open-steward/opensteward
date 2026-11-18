import type { Account, AccountType } from '../../../schema/account'

export interface TorgsoftAccount {
  id: string
  account_no: string
  name: string
  type?: string
  currency?: string
  [key: string]: unknown
}

function mapAccountType(type?: string): AccountType | undefined {
  switch (type) {
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
      return 'OTHER'
  }
}

export function transformAccount(raw: TorgsoftAccount): Account {
  return {
    id: String(raw.id),
    name: raw.name || undefined,
    customerDefinedCode: raw.account_no || undefined,
    type: mapAccountType(raw.type),
    status: 'ACTIVE',
    currency: raw.currency || undefined,
    metadata: raw as Record<string, unknown>,
  }
}
