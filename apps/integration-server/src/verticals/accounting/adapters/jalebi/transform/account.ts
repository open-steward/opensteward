import type { Account, AccountStatus } from '../../../schema/account'

// Jalebi maps menu/inventory items as accounts
export interface JalebiItem {
  id: string | number
  code: string
  name: string
  category: string
  active: boolean
  price: number
  [key: string]: unknown
}

export function transformAccount(raw: JalebiItem): Account {
  const status: AccountStatus = raw.active ? 'ACTIVE' : 'ARCHIVED'
  return {
    id: String(raw.id),
    name: raw.name || undefined,
    customerDefinedCode: raw.code || undefined,
    group: raw.category || undefined,
    status,
    metadata: raw as Record<string, unknown>,
  }
}
