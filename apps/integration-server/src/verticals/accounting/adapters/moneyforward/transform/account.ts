import type { Account, AccountStatus } from '../../../schema/account'

export interface MoneyForwardAccountItem {
  id: string
  name: string
  account_category: string | null
  [key: string]: unknown
}

export function transformAccount(raw: MoneyForwardAccountItem): Account {
  const status: AccountStatus = 'ACTIVE'
  return {
    id: String(raw.id),
    name: raw.name || undefined,
    status,
    metadata: raw as Record<string, unknown>,
  }
}
