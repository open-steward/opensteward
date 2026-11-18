import type { Account, AccountStatus } from '../../../schema/account'

export interface NiboAccount {
  accountId: number
  name: string
  code: string
  isActive: boolean
  balance: number
  type: string
  [key: string]: unknown
}

export function transformAccount(raw: NiboAccount): Account {
  const status: AccountStatus = raw.isActive ? 'ACTIVE' : 'ARCHIVED'
  return {
    id: String(raw.accountId),
    name: raw.name || undefined,
    customerDefinedCode: raw.code || String(raw.accountId),
    status,
    balance: raw.balance,
    metadata: raw as Record<string, unknown>,
  }
}
