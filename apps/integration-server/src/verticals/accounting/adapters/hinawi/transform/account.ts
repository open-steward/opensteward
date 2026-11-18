import type { Account, AccountStatus } from '../../../schema/account'

export interface HinawiAccount {
  id: string | number
  AccountCode: string
  AccountName: string
  AccountType: string
  IsActive: boolean
  [key: string]: unknown
}

export function transformAccount(raw: HinawiAccount): Account {
  const status: AccountStatus = raw.IsActive ? 'ACTIVE' : 'ARCHIVED'
  return {
    id: String(raw.id),
    name: raw.AccountName || undefined,
    customerDefinedCode: raw.AccountCode || undefined,
    group: raw.AccountType || undefined,
    status,
    metadata: raw as Record<string, unknown>,
  }
}
