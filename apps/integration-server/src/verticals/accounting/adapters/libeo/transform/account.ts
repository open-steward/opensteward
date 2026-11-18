import type { Account, AccountStatus } from '../../../schema/account'

export interface LibeoAccount {
  id: string
  code: string
  label: string
  is_active: boolean
  balance: number
  [key: string]: unknown
}

export function transformAccount(raw: LibeoAccount): Account {
  const status: AccountStatus = raw.is_active ? 'ACTIVE' : 'ARCHIVED'
  return {
    id: String(raw.id),
    name: raw.label || undefined,
    customerDefinedCode: raw.code || undefined,
    status,
    balance: raw.balance,
    metadata: raw as Record<string, unknown>,
  }
}
