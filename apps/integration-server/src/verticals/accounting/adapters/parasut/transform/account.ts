import type { Account, AccountStatus } from '../../../schema/account'

export interface ParasutAccount {
  id: string
  type: string
  attributes: {
    name?: string
    currency?: string
    balance?: number
    account_type?: string
    archived?: boolean
  }
  [key: string]: unknown
}

export function transformAccount(raw: ParasutAccount): Account {
  const attrs = raw.attributes ?? {}
  const status: AccountStatus = attrs.archived ? 'ARCHIVED' : 'ACTIVE'
  return {
    id: raw.id,
    name: attrs.name || undefined,
    currency: attrs.currency || undefined,
    balance: attrs.balance,
    status,
    metadata: raw as Record<string, unknown>,
  }
}
