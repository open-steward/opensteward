import type { Account, AccountType, AccountStatus } from '../../../schema/account'

export interface ExactAccount {
  ID?: string
  Code?: string
  Description?: string
  Type?: number
  TypeDescription?: string
  IsBlocked?: boolean
  Balance?: number
  Currency?: string
  [key: string]: unknown
}

function mapType(typeDesc: string | undefined): AccountType {
  const t = (typeDesc ?? '').toLowerCase()
  if (t.includes('asset') || t.includes('balance')) return 'ASSET'
  if (t.includes('liabilit')) return 'LIABILITY'
  if (t.includes('equity')) return 'EQUITY'
  if (t.includes('revenue') || t.includes('income') || t.includes('profit')) return 'INCOME'
  if (t.includes('expense') || t.includes('cost')) return 'EXPENSE'
  return 'OTHER'
}

export function transformAccount(raw: ExactAccount): Account {
  return {
    id: raw.ID || undefined,
    customerDefinedCode: raw.Code || undefined,
    name: raw.Description || undefined,
    type: mapType(raw.TypeDescription),
    status: (raw.IsBlocked ? 'ARCHIVED' : 'ACTIVE') as AccountStatus,
    balance: raw.Balance,
    currency: raw.Currency || undefined,
    metadata: raw as Record<string, unknown>,
  }
}
