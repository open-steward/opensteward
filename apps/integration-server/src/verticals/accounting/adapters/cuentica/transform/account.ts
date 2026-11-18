import type { Account, AccountStatus } from '../../../schema/account'

export interface CuenticaAccount {
  id: string
  code: string
  name: string
  active: boolean
  balance: number
  type: string
  [key: string]: unknown
}

export function transformAccount(raw: CuenticaAccount): Account {
  const status: AccountStatus = raw.active ? 'ACTIVE' : 'ARCHIVED'
  return {
    id: raw.id,
    name: raw.name || undefined,
    customerDefinedCode: raw.code || undefined,
    status,
    balance: raw.balance,
    metadata: raw as Record<string, unknown>,
  }
}
