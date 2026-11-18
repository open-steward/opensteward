import type { Account, AccountStatus } from '../../../schema/account'

export interface SinaoAccount {
  id: string
  number: string
  name: string
  is_active: boolean
  balance: number
  [key: string]: unknown
}

export function transformAccount(raw: SinaoAccount): Account {
  const status: AccountStatus = raw.is_active ? 'ACTIVE' : 'ARCHIVED'
  return {
    id: String(raw.id),
    name: raw.name || undefined,
    customerDefinedCode: raw.number || undefined,
    status,
    balance: raw.balance,
    metadata: raw as Record<string, unknown>,
  }
}
