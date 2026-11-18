import type { Account, AccountStatus } from '../../../schema/account'

export interface FacturamaAccount {
  Id: string
  Name: string
  Code: string
  IsActive: boolean
  Balance: number
  Type: string
  [key: string]: unknown
}

export function transformAccount(raw: FacturamaAccount): Account {
  const status: AccountStatus = raw.IsActive ? 'ACTIVE' : 'ARCHIVED'
  return {
    id: String(raw.Id),
    name: raw.Name || undefined,
    customerDefinedCode: String(raw.Code),
    status,
    balance: raw.Balance,
    metadata: raw as Record<string, unknown>,
  }
}
