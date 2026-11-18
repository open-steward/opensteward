import type { Account, AccountType, AccountStatus } from '../../../schema/account'

export interface BCAccount {
  id: string
  number: string
  displayName: string
  category: string
  subCategory?: string
  blocked: boolean
  accountType?: string
  directPosting?: boolean
  netChange?: number
  consolidationTranslationMethod?: string
  consolidationDebitAccount?: string
  consolidationCreditAccount?: string
  excludeFromConsolidation?: boolean
  lastModifiedDateTime?: string
  [key: string]: unknown
}

function mapType(category: string): AccountType {
  const c = (category ?? '').toLowerCase()
  if (c.includes('asset')) return 'ASSET'
  if (c.includes('liabilit')) return 'LIABILITY'
  if (c.includes('equity') || c.includes('capital')) return 'EQUITY'
  if (c.includes('income') || c.includes('revenue') || c.includes('sales')) return 'INCOME'
  if (c.includes('expense') || c.includes('cost')) return 'EXPENSE'
  return 'OTHER'
}

export function transformAccount(raw: BCAccount): Account {
  return {
    id: raw.id,
    customerDefinedCode: raw.number || undefined,
    name: raw.displayName || undefined,
    type: mapType(raw.category),
    status: (raw.blocked ? 'ARCHIVED' : 'ACTIVE') as AccountStatus,
    metadata: raw as Record<string, unknown>,
  }
}
