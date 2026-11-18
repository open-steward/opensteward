import type { Account, AccountStatus } from '../../../schema/account'

export interface RegateAccount {
  id: string
  code: string
  name: string
  is_active: boolean
  balance: number
  [key: string]: unknown
}

export function transformAccount(raw: RegateAccount): Account {
  const status: AccountStatus = raw.is_active ? 'ACTIVE' : 'ARCHIVED'
  return {
    id: String(raw.id),
    name: raw.name || undefined,
    customerDefinedCode: raw.code || undefined,
    status,
    balance: raw.balance,
    metadata: raw as Record<string, unknown>,
  }
}
