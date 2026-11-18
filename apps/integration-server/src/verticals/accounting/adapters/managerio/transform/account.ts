import type { Account, AccountStatus } from '../../../schema/account'

export interface ManagerioAccount {
  Key: string
  Code: string
  Name: string
  ControlAccount: string
  Active: boolean
  [key: string]: unknown
}

export function transformAccount(raw: ManagerioAccount): Account {
  const status: AccountStatus = raw.Active ? 'ACTIVE' : 'ARCHIVED'
  return {
    id: String(raw.Key),
    name: raw.Name || undefined,
    customerDefinedCode: raw.Code || undefined,
    status,
    group: raw.ControlAccount || undefined,
    metadata: raw as Record<string, unknown>,
  }
}
