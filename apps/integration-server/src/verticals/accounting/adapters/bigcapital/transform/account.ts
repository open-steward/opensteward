import type { Account, AccountStatus, AccountType } from '../../../schema/account'

/**
 * Convert a Bigcapital float major-unit amount to integer minor units (cents).
 * Returns undefined when the value is not a finite number.
 */
function toMinor(value: number | null | undefined): number | undefined {
  if (typeof value !== 'number' || !isFinite(value)) return undefined
  return Math.round(value * 100)
}

export interface BigcapitalAccount {
  id: number
  name: string
  code?: string
  slug?: string
  accountType?: string
  accountTypeLabel?: string
  parentAccountId?: number
  active?: boolean
  amount?: number
  currencyCode?: string
  createdAt?: string
  updatedAt?: string
  [key: string]: unknown
}

function mapAccountType(accountType?: string): AccountType | undefined {
  if (!accountType) return undefined
  const t = accountType.toLowerCase()
  if (t.includes('asset') || t === 'bank' || t === 'current_asset') return 'ASSET'
  if (t.includes('liabilit') || t === 'current_liability' || t === 'long_term_liability') return 'LIABILITY'
  if (t.includes('equity')) return 'EQUITY'
  if (t.includes('income') || t.includes('revenue') || t === 'other_income') return 'INCOME'
  if (t.includes('expense') || t === 'cost_of_goods_sold') return 'EXPENSE'
  return 'OTHER'
}

export function transformAccount(raw: BigcapitalAccount): Account {
  const status: AccountStatus = (raw.active ?? true) ? 'ACTIVE' : 'ARCHIVED'
  return {
    id: String(raw.id),
    name: raw.name || undefined,
    customerDefinedCode: raw.code || undefined,
    type: mapAccountType(raw.accountType),
    status,
    parentId: raw.parentAccountId != null ? String(raw.parentAccountId) : undefined,
    currency: raw.currencyCode || undefined,
    balance: toMinor(raw.amount),
    createdAt: raw.createdAt ? new Date(raw.createdAt) : undefined,
    updatedAt: raw.updatedAt ? new Date(raw.updatedAt) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
