import type { Account, AccountType } from '../../../schema/account'

export interface FinmapAccount {
  id: string
  name: string
  type?: string
  currency?: string
  balance?: number
  [key: string]: unknown
}

function mapAccountType(type?: string): AccountType | undefined {
  switch (type) {
    case 'cash':
    case 'bank':
      return 'ASSET'
    case 'credit':
      return 'LIABILITY'
    case 'income':
      return 'INCOME'
    case 'expense':
      return 'EXPENSE'
    default:
      return 'OTHER'
  }
}

export function transformAccount(raw: FinmapAccount): Account {
  return {
    id: String(raw.id),
    name: raw.name || undefined,
    type: mapAccountType(raw.type),
    status: 'ACTIVE',
    currency: raw.currency || undefined,
    balance: raw.balance,
    metadata: raw as Record<string, unknown>,
  }
}
