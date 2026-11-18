import type { Account, AccountStatus, AccountType } from '../../../schema/account'

export interface HoldedAccount {
  id: string
  name: string
  description: string
  code: string
  type: string
  isArchived: boolean
  [key: string]: unknown
}

function mapType(acc: HoldedAccount): AccountType {
  const t = acc.type?.toLowerCase() ?? ''
  if (t.includes('asset')) return 'ASSET'
  if (t.includes('liabilit')) return 'LIABILITY'
  if (t.includes('equity')) return 'EQUITY'
  if (t.includes('income') || t.includes('revenue')) return 'INCOME'
  if (t.includes('expense')) return 'EXPENSE'
  return 'OTHER'
}

export function transformAccount(raw: HoldedAccount): Account {
  const status: AccountStatus = raw.isArchived ? 'ARCHIVED' : 'ACTIVE'
  return {
    id: raw.id,
    name: raw.name || undefined,
    description: raw.description || undefined,
    customerDefinedCode: raw.code || undefined,
    type: mapType(raw),
    status,
    metadata: raw as Record<string, unknown>,
  }
}
