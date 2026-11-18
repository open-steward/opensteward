import type { Account, AccountStatus } from '../../../schema/account'

export interface SistemiAccount {
  id: string
  code: string
  description: string
  is_active: boolean
  balance: number
  [key: string]: unknown
}

export function transformAccount(raw: SistemiAccount): Account {
  const status: AccountStatus = raw.is_active ? 'ACTIVE' : 'ARCHIVED'
  return {
    id: String(raw.id),
    name: raw.description || undefined,
    customerDefinedCode: raw.code || undefined,
    status,
    balance: raw.balance,
    metadata: raw as Record<string, unknown>,
  }
}
