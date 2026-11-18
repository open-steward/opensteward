import type { Account, AccountStatus, AccountType } from '../../../schema/account'

export interface DualentryAccount {
  id: number
  name: string
  number: number
  description: string | null
  is_active: boolean
  is_system: boolean
  company_id: number | null
  parent_account_id: number | null
  account_type: string | null
  currency_iso_4217_code: string | null
  [key: string]: unknown
}

function mapAccountType(raw: string | null): AccountType | undefined {
  if (!raw) return undefined
  const upper = raw.toUpperCase()
  if (upper.includes('ASSET')) return 'ASSET'
  if (upper.includes('LIAB')) return 'LIABILITY'
  if (upper.includes('EQUITY')) return 'EQUITY'
  if (upper.includes('INCOME') || upper.includes('REVENUE')) return 'INCOME'
  if (upper.includes('EXPENSE')) return 'EXPENSE'
  return 'OTHER'
}

export function transformAccount(raw: DualentryAccount): Account {
  const status: AccountStatus = raw.is_active ? 'ACTIVE' : 'ARCHIVED'
  return {
    id: String(raw.id),
    name: raw.name || undefined,
    description: raw.description || undefined,
    customerDefinedCode: raw.number != null ? String(raw.number) : undefined,
    type: mapAccountType(raw.account_type),
    status,
    currency: raw.currency_iso_4217_code || undefined,
    parentId: raw.parent_account_id != null ? String(raw.parent_account_id) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
