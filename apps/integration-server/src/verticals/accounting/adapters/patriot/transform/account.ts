import type { Account, AccountStatus, AccountType } from '../../../schema/account'

export interface PatriotAccount {
  id: string
  name: string
  description: string
  number: string
  type: string
  is_active: boolean
  currency: string
  group: string
  [key: string]: unknown
}

function mapType(acc: PatriotAccount): AccountType {
  const t = acc.type?.toLowerCase() ?? ''
  if (t.includes('asset')) return 'ASSET'
  if (t.includes('liabilit')) return 'LIABILITY'
  if (t.includes('equity') || t.includes('capital')) return 'EQUITY'
  if (t.includes('revenue') || t.includes('income')) return 'INCOME'
  if (t.includes('expense')) return 'EXPENSE'
  return 'OTHER'
}

export function transformAccount(raw: PatriotAccount): Account {
  const status: AccountStatus = raw.is_active ? 'ACTIVE' : 'ARCHIVED'
  return {
    id: raw.id,
    name: raw.name || undefined,
    description: raw.description || undefined,
    customerDefinedCode: raw.number || undefined,
    type: mapType(raw),
    status,
    group: raw.group || undefined,
    currency: raw.currency || undefined,
    metadata: raw as Record<string, unknown>,
  }
}
