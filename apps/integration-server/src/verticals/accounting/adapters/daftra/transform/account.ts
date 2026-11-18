import type { Account, AccountType } from '../../../schema/account'

export interface DaftraAccount {
  id: string | number
  code?: string
  name?: string
  account_type?: string
  active?: boolean
  [key: string]: unknown
}

function mapAccountType(type?: string): AccountType | undefined {
  if (!type) return undefined
  const t = type.toLowerCase()
  switch (t) {
    case 'income':
    case 'revenue':
      return 'INCOME'
    case 'expense':
      return 'EXPENSE'
    case 'asset':
      return 'ASSET'
    case 'liability':
      return 'LIABILITY'
    case 'equity':
      return 'EQUITY'
    default:
      return 'OTHER'
  }
}

export function transformAccount(raw: DaftraAccount): Account {
  return {
    id: String(raw.id),
    name: raw.name || undefined,
    customerDefinedCode: raw.code || undefined,
    type: mapAccountType(raw.account_type),
    status: raw.active === false ? 'ARCHIVED' : 'ACTIVE',
    metadata: raw as Record<string, unknown>,
  }
}
