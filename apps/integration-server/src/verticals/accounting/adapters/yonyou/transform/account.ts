import type { Account, AccountType } from '../../../schema/account'

export interface YonyouAccount {
  id?: string
  name?: string
  acctype?: number | string
  currency?: string
  [key: string]: unknown
}

function mapType(t?: number | string): AccountType | undefined {
  switch (String(t)) {
    case '1': return 'ASSET'
    case '2': return 'LIABILITY'
    case '3': return 'EQUITY'
    case '4': return 'INCOME'
    case '5': return 'EXPENSE'
    default: return 'unknown'
  }
}

export function transformAccount(raw: YonyouAccount): Account {
  return {
    id: raw.id ? String(raw.id) : '',
    name: raw.name || undefined,
    type: mapType(raw.acctype),
    currency: raw.currency || undefined,
    metadata: raw as Record<string, unknown>,
  }
}
