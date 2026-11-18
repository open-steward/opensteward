import type { Account, AccountStatus } from '../../../schema/account'

export interface MazeedOneAccount {
  id: string | number
  account_code: string
  account_name: string
  account_type: string
  is_active: boolean
  [key: string]: unknown
}

export function transformAccount(raw: MazeedOneAccount): Account {
  const status: AccountStatus = raw.is_active ? 'ACTIVE' : 'ARCHIVED'
  return {
    id: String(raw.id),
    name: raw.account_name || undefined,
    customerDefinedCode: raw.account_code || undefined,
    group: raw.account_type || undefined,
    status,
    metadata: raw as Record<string, unknown>,
  }
}
