import type { Account, AccountStatus, AccountType } from '../../../schema/account'

export interface FikenAccount {
  code: string
  name: string
  type: string
  active: boolean
  [key: string]: unknown
}

function mapType(acc: FikenAccount): AccountType {
  const t = acc.type?.toLowerCase() ?? ''
  if (t.includes('asset')) return 'ASSET'
  if (t.includes('liabilit')) return 'LIABILITY'
  if (t.includes('equity')) return 'EQUITY'
  if (t.includes('revenue') || t.includes('income')) return 'INCOME'
  if (t.includes('expense') || t.includes('cost')) return 'EXPENSE'
  return 'OTHER'
}

export function transformAccount(raw: FikenAccount): Account {
  const status: AccountStatus = raw.active ? 'ACTIVE' : 'ARCHIVED'
  return {
    id: raw.code,
    name: raw.name || undefined,
    customerDefinedCode: raw.code || undefined,
    type: mapType(raw),
    status,
    metadata: raw as Record<string, unknown>,
  }
}
