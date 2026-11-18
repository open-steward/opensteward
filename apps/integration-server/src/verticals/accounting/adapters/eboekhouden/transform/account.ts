import type { Account, AccountType, AccountStatus } from '../../../schema/account'

export interface EBoekhoudenAccount {
  id?: number | string
  code?: string
  description?: string
  category?: string
  isActive?: boolean
  [key: string]: unknown
}

function mapType(category: string | undefined): AccountType {
  const c = (category ?? '').toLowerCase()
  if (c.includes('asset') || c.includes('activa')) return 'ASSET'
  if (c.includes('liabilit') || c.includes('passiva')) return 'LIABILITY'
  if (c.includes('equity') || c.includes('eigen vermogen')) return 'EQUITY'
  if (c.includes('income') || c.includes('opbrengst')) return 'INCOME'
  if (c.includes('expense') || c.includes('kosten')) return 'EXPENSE'
  return 'OTHER'
}

export function transformAccount(raw: EBoekhoudenAccount): Account {
  return {
    id: raw.id !== undefined ? String(raw.id) : undefined,
    customerDefinedCode: raw.code || undefined,
    name: raw.description || undefined,
    type: mapType(raw.category),
    status: (raw.isActive === false ? 'ARCHIVED' : 'ACTIVE') as AccountStatus,
    metadata: raw as Record<string, unknown>,
  }
}
