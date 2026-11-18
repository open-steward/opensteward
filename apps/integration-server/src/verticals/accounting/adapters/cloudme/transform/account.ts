import type { Account, AccountStatus } from '../../../schema/account'

export interface CloudMeAccount {
  id: string | number
  account_code: string
  account_name: string
  account_type: string
  active: boolean
  [key: string]: unknown
}

export function transformAccount(raw: CloudMeAccount): Account {
  const status: AccountStatus = raw.active ? 'ACTIVE' : 'ARCHIVED'
  return {
    id: String(raw.id),
    name: raw.account_name || undefined,
    customerDefinedCode: raw.account_code || undefined,
    group: raw.account_type || undefined,
    status,
    metadata: raw as Record<string, unknown>,
  }
}
