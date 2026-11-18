import type { Account, AccountType } from '../../../schema/account'

export interface MoyskladAccount {
  id?: string
  name?: string
  accountType?: string
  currency?: string
  [key: string]: unknown
}

function mapType(t?: string): AccountType | undefined {
  switch (t) {
    case 'bankAccount': return 'ASSET'
    case 'cashAccount': return 'ASSET'
    default: return 'unknown'
  }
}

export function transformAccount(raw: MoyskladAccount): Account {
  return {
    id: raw.id ? String(raw.id) : '',
    name: raw.name || undefined,
    type: mapType(raw.accountType),
    currency: raw.currency || undefined,
    metadata: raw as Record<string, unknown>,
  }
}
