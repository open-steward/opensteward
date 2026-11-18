import type { Account, AccountStatus } from '../../../schema/account'

export interface ContaAzulAccount {
  id: string
  code: string
  name: string
  description: string
  active: boolean
  balance: number
  type: string
  parent_id: string
  [key: string]: unknown
}

export function transformAccount(raw: ContaAzulAccount): Account {
  const status: AccountStatus = raw.active ? 'ACTIVE' : 'ARCHIVED'
  return {
    id: String(raw.id),
    name: raw.name || undefined,
    description: raw.description || undefined,
    customerDefinedCode: raw.code || String(raw.id),
    status,
    balance: raw.balance,
    parentId: raw.parent_id || undefined,
    metadata: raw as Record<string, unknown>,
  }
}
