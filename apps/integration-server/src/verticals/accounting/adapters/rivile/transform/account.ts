import type { Account, AccountStatus } from '../../../schema/account'

export interface RivileAccount {
  id: string | number
  code?: string
  name?: string
  active?: boolean
  balance?: number
  [key: string]: unknown
}

export function transformAccount(raw: RivileAccount): Account {
  const status: AccountStatus = raw.active === false ? 'ARCHIVED' : 'ACTIVE'
  return {
    id: String(raw.id),
    name: raw.name || undefined,
    customerDefinedCode: raw.code || String(raw.id),
    status,
    balance: raw.balance,
    metadata: raw as Record<string, unknown>,
  }
}
