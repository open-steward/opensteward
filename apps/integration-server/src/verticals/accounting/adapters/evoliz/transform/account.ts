import type { Account, AccountStatus } from '../../../schema/account'

export interface EvolizAccount {
  id: string
  account_code: string
  label: string
  active: boolean
  balance: number
  [key: string]: unknown
}

export function transformAccount(raw: EvolizAccount): Account {
  const status: AccountStatus = raw.active ? 'ACTIVE' : 'ARCHIVED'
  return {
    id: String(raw.id),
    name: raw.label || undefined,
    customerDefinedCode: raw.account_code || undefined,
    status,
    balance: raw.balance,
    metadata: raw as Record<string, unknown>,
  }
}
