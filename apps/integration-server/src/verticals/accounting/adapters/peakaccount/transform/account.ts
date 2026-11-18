import type { Account, AccountType } from '../../../schema/account'

export interface PeakAccountAccount {
  id: string | number
  code: string
  name: string
  accountType: string
  balance: number
  currency: string
  [key: string]: unknown
}

function mapAccountType(type: string): AccountType {
  switch (type?.toLowerCase()) {
    case 'asset':
      return 'ASSET'
    case 'liability':
      return 'LIABILITY'
    case 'equity':
      return 'EQUITY'
    case 'income':
    case 'revenue':
      return 'INCOME'
    case 'expense':
      return 'EXPENSE'
    default:
      return 'OTHER'
  }
}

export function transformAccount(raw: PeakAccountAccount): Account {
  return {
    id: String(raw.id),
    name: raw.name || undefined,
    customerDefinedCode: raw.code || undefined,
    type: mapAccountType(raw.accountType),
    balance: raw.balance,
    currency: raw.currency || undefined,
    status: 'ACTIVE',
    metadata: raw as Record<string, unknown>,
  }
}
