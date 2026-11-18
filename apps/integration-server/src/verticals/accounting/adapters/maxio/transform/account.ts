import type { Account, AccountType } from '../../../schema/account'

export interface MaxioAccount {
  id: number
  name: string
  type: string
  balance_in_cents: number
  is_active: boolean
  [key: string]: unknown
}

function mapAccountType(type: string): AccountType {
  const t = (type ?? '').toLowerCase()
  if (t.includes('asset')) return 'ASSET'
  if (t.includes('liabilit')) return 'LIABILITY'
  if (t.includes('equity') || t.includes('capital')) return 'EQUITY'
  if (t.includes('income') || t.includes('revenue')) return 'INCOME'
  if (t.includes('expense')) return 'EXPENSE'
  return 'OTHER'
}

export function transformAccount(raw: MaxioAccount): Account {
  return {
    id: String(raw.id),
    name: raw.name || undefined,
    type: mapAccountType(raw.type),
    // Maxio stores amounts in cents — divide by 100
    balance: typeof raw.balance_in_cents === 'number' ? raw.balance_in_cents / 100 : undefined,
    status: raw.is_active === false ? 'ARCHIVED' : 'ACTIVE',
    metadata: raw as Record<string, unknown>,
  }
}
