import type { Account, AccountStatus } from '../../../schema/account'

export interface BusyAccount {
  AccCode: string
  AccName: string
  GroupName: string
  IsActive: boolean
  [key: string]: unknown
}

export function transformAccount(raw: BusyAccount): Account {
  const status: AccountStatus = raw.IsActive ? 'ACTIVE' : 'ARCHIVED'
  return {
    id: String(raw.AccCode),
    name: raw.AccName || undefined,
    customerDefinedCode: String(raw.AccCode),
    group: raw.GroupName || undefined,
    status,
    metadata: raw as Record<string, unknown>,
  }
}
