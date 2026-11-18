import type { Account, AccountStatus, AccountType } from '../../../schema/account'

// SimplBooks chart-of-accounts entry
export interface SimplbooksAccount {
  id: number
  code?: string | null         // account code, e.g. "4000"
  name?: string | null
  // type: 'asset' | 'liability' | 'equity' | 'income' | 'expense'
  type?: string | null
  is_active?: boolean | null
  balance?: number | null
  [key: string]: unknown
}

function mapType(raw: SimplbooksAccount): AccountType {
  const t = (raw.type ?? '').toLowerCase()
  if (t === 'asset') return 'ASSET'
  if (t === 'liability') return 'LIABILITY'
  if (t === 'equity') return 'EQUITY'
  if (t === 'income' || t === 'revenue') return 'INCOME'
  if (t === 'expense') return 'EXPENSE'
  return 'OTHER'
}

export function transformAccount(raw: SimplbooksAccount): Account {
  const status: AccountStatus = raw.is_active === false ? 'ARCHIVED' : 'ACTIVE'
  return {
    id: String(raw.id),
    name: raw.name || undefined,
    customerDefinedCode: raw.code || undefined,
    type: mapType(raw),
    status,
    balance: raw.balance ?? undefined,
    metadata: raw as Record<string, unknown>,
  }
}
