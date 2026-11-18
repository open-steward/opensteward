import type { Account, AccountStatus } from '../../../schema/account'

export interface UnimicroAccount {
  ID?: number
  AccountNumber?: string
  AccountName?: string
  AccountGroupID?: number
  Active?: boolean
  [key: string]: unknown
}

export function transformAccount(raw: UnimicroAccount): Account {
  const status: AccountStatus = raw.Active === false ? 'ARCHIVED' : 'ACTIVE'
  return {
    id: String(raw.ID ?? ''),
    name: raw.AccountName || undefined,
    customerDefinedCode: raw.AccountNumber || undefined,
    status,
    metadata: raw as Record<string, unknown>,
  }
}
