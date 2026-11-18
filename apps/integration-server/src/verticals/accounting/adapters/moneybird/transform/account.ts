import type { Account, AccountType } from '../../../schema/account'

export interface MoneybirdAccount {
  id?: number | string
  name?: string
  account_type?: string
  parent_id?: number | string
  [key: string]: unknown
}

function mapType(accountType: string | undefined): AccountType {
  const t = (accountType ?? '').toLowerCase()
  if (t === 'expense') return 'EXPENSE'
  if (t === 'revenue' || t === 'income') return 'INCOME'
  if (t === 'asset') return 'ASSET'
  if (t === 'liability') return 'LIABILITY'
  if (t === 'equity') return 'EQUITY'
  return 'OTHER'
}

export function transformAccount(raw: MoneybirdAccount): Account {
  return {
    id: raw.id !== undefined ? String(raw.id) : undefined,
    name: raw.name || undefined,
    type: mapType(raw.account_type),
    status: 'ACTIVE',
    metadata: raw as Record<string, unknown>,
  }
}
