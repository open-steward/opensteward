import type { Account, AccountStatus } from '../../../schema/account'

export interface AlegraAccount {
  id: number
  name: string
  code: string
  description: string
  status: string
  balance: number
  type: string
  parentId: number
  [key: string]: unknown
}

export function transformAccount(raw: AlegraAccount): Account {
  const status: AccountStatus = raw.status === 'inactive' ? 'ARCHIVED' : 'ACTIVE'
  return {
    id: String(raw.id),
    name: raw.name || undefined,
    description: raw.description || undefined,
    customerDefinedCode: raw.code || String(raw.id),
    status,
    balance: raw.balance,
    parentId: raw.parentId ? String(raw.parentId) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
