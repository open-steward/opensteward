import type { Account, AccountType, AccountStatus } from '../../../schema/account'

export interface PowerOfficeAccount {
  id: number
  code: string
  name: string
  type: number
  isActive: boolean
  currencyCode: string
  balance: number
  [key: string]: unknown
}

function mapType(type: number): AccountType {
  if (type >= 1000 && type < 2000) return 'ASSET'
  if (type >= 2000 && type < 3000) return 'LIABILITY'
  if (type >= 3000 && type < 4000) return 'EQUITY'
  if (type >= 4000 && type < 5000) return 'INCOME'
  if (type >= 5000) return 'EXPENSE'
  return 'OTHER'
}

export function transformAccount(raw: PowerOfficeAccount): Account {
  const status: AccountStatus = raw.isActive ? 'ACTIVE' : 'ARCHIVED'
  return {
    id: String(raw.id),
    name: raw.name || undefined,
    customerDefinedCode: raw.code || undefined,
    type: mapType(raw.type),
    status,
    currency: raw.currencyCode || undefined,
    balance: raw.balance,
    metadata: raw as Record<string, unknown>,
  }
}
