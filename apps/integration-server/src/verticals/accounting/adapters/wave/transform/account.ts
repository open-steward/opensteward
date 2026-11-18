import type { Account, AccountStatus, AccountType } from '../../../schema/account'

export interface WaveAccount {
  id: string
  name: string
  description: string
  type: { value: string } | null
  subtype: { value: string } | null
  currency: { code: string } | null
  isArchived: boolean
  [key: string]: unknown
}

function mapType(acc: WaveAccount): AccountType {
  const t = acc.type?.value?.toLowerCase() ?? ''
  if (t.includes('asset')) return 'ASSET'
  if (t.includes('liabilit')) return 'LIABILITY'
  if (t.includes('equity')) return 'EQUITY'
  if (t.includes('income') || t.includes('revenue')) return 'INCOME'
  if (t.includes('expense')) return 'EXPENSE'
  return 'OTHER'
}

export function transformAccount(raw: WaveAccount): Account {
  const status: AccountStatus = raw.isArchived ? 'ARCHIVED' : 'ACTIVE'
  return {
    id: raw.id,
    name: raw.name || undefined,
    description: raw.description || undefined,
    type: mapType(raw),
    status,
    currency: raw.currency?.code || undefined,
    metadata: raw as Record<string, unknown>,
  }
}
