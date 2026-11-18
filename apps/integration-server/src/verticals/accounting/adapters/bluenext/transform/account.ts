import type { Account, AccountStatus } from '../../../schema/account'

export interface BluenextAccount {
  id: string
  code: string
  description: string
  isActive: boolean
  balance: number
  [key: string]: unknown
}

export function transformAccount(raw: BluenextAccount): Account {
  const status: AccountStatus = raw.isActive ? 'ACTIVE' : 'ARCHIVED'
  return {
    id: String(raw.id),
    name: raw.description || undefined,
    customerDefinedCode: raw.code || undefined,
    status,
    balance: raw.balance,
    metadata: raw as Record<string, unknown>,
  }
}
