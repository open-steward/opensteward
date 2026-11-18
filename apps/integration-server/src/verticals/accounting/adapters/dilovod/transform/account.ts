import type { Account, AccountType } from '../../../schema/account'

export interface DilovodAccount {
  id: string
  code: string
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

export function transformAccount(raw: DilovodAccount): Account {
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
