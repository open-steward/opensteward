import type { Account, AccountStatus } from '../../../schema/account'

export interface GiobbyAccount {
  id: string
  code: string
  name: string
  active: boolean
  balance: number
  [key: string]: unknown
}

export function transformAccount(raw: GiobbyAccount): Account {
  const status: AccountStatus = raw.active ? 'ACTIVE' : 'ARCHIVED'
  return {
    id: String(raw.id),
    name: raw.name || undefined,
    customerDefinedCode: raw.code || undefined,
    status,
    balance: raw.balance,
    metadata: raw as Record<string, unknown>,
  }
}
