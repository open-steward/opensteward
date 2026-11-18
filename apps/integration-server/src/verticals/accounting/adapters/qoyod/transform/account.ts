import type { Account, AccountStatus, AccountType } from '../../../schema/account'

export interface QoyodAccount {
  id: number
  name?: string | null
  name_ar?: string | null
  code?: string | null
  account_type?: string | null
  parent_id?: number | null
  is_active?: boolean | null
  [key: string]: unknown
}

function mapAccountType(raw: string | null | undefined): AccountType {
  const t = (raw ?? '').toLowerCase()
  if (t.includes('asset')) return 'ASSET'
  if (t.includes('liabilit')) return 'LIABILITY'
  if (t.includes('equity')) return 'EQUITY'
  if (t.includes('income') || t.includes('revenue')) return 'INCOME'
  if (t.includes('expense')) return 'EXPENSE'
  return 'OTHER'
}

export function transformAccount(raw: QoyodAccount): Account {
  const status: AccountStatus = raw.is_active === false ? 'ARCHIVED' : 'ACTIVE'
  return {
    id: String(raw.id),
    name: raw.name || undefined,
    customerDefinedCode: raw.code || String(raw.id),
    type: mapAccountType(raw.account_type),
    status,
    parentId: raw.parent_id != null ? String(raw.parent_id) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
