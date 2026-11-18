import type { Account, AccountStatus } from '../../../schema/account'

export interface MeritaktivaAccount {
  Id: string | number
  Code?: string
  Name?: string
  Active?: boolean
  Balance?: number
  [key: string]: unknown
}

export function transformAccount(raw: MeritaktivaAccount): Account {
  const status: AccountStatus = raw.Active === false ? 'ARCHIVED' : 'ACTIVE'
  return {
    id: String(raw.Id),
    name: raw.Name || undefined,
    customerDefinedCode: raw.Code || String(raw.Id),
    status,
    balance: raw.Balance,
    metadata: raw as Record<string, unknown>,
  }
}
