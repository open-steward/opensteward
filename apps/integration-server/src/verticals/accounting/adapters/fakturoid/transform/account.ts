import type { Account, AccountStatus, AccountType } from '../../../schema/account'

export interface FakturoidAccount {
  id: number
  name: string
  number: string
  type: string
  currency: string
  is_active: boolean
  [key: string]: unknown
}

function mapType(acc: FakturoidAccount): AccountType {
  const t = acc.type?.toLowerCase() ?? ''
  if (t.includes('asset')) return 'ASSET'
  if (t.includes('liabilit')) return 'LIABILITY'
  if (t.includes('equity')) return 'EQUITY'
  if (t.includes('revenue') || t.includes('income')) return 'INCOME'
  if (t.includes('expense')) return 'EXPENSE'
  return 'OTHER'
}

export function transformAccount(raw: FakturoidAccount): Account {
  const status: AccountStatus = raw.is_active === false ? 'ARCHIVED' : 'ACTIVE'
  return {
    id: String(raw.id),
    name: raw.name || undefined,
    customerDefinedCode: raw.number || undefined,
    type: mapType(raw),
    status,
    currency: raw.currency || undefined,
    metadata: raw as Record<string, unknown>,
  }
}
