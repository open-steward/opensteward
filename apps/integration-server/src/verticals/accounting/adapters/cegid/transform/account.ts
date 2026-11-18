import type { Account, AccountStatus } from '../../../schema/account'

export interface CegidAccount {
  id: string
  accountNumber: string
  name: string
  isActive: boolean
  balance: number
  [key: string]: unknown
}

export function transformAccount(raw: CegidAccount): Account {
  const status: AccountStatus = raw.isActive ? 'ACTIVE' : 'ARCHIVED'
  return {
    id: String(raw.id),
    name: raw.name || undefined,
    customerDefinedCode: raw.accountNumber || undefined,
    status,
    balance: raw.balance,
    metadata: raw as Record<string, unknown>,
  }
}
