import type { Account, AccountStatus, AccountType } from '../../../schema/account'

export interface CampfireChartAccount {
  id: number
  account_id?: string | null
  number?: string | null
  name?: string | null
  nickname?: string | null
  description?: string | null
  account_type?: string | null
  account_subtype?: string | null
  status?: string | null
  currency?: string | null
  current_balance?: number | null
  balance_ytd?: number | null
  parent?: number | null
  parent_name_and_number?: string | null
  created_at?: string | null
  last_modified_at?: string | null
  [key: string]: unknown
}

// Map Campfire account_type to canonical AccountType
function mapAccountType(raw: string | null | undefined): AccountType | undefined {
  const t = (raw ?? '').toUpperCase()
  if (t === 'ASSET') return 'ASSET'
  if (t === 'LIABILITY') return 'LIABILITY'
  if (t === 'EQUITY') return 'EQUITY'
  if (t === 'REVENUE') return 'INCOME'
  if (t === 'COGS' || t === 'OPERATING_EXPENSES' || t === 'OTHER_EXPENSE') return 'EXPENSE'
  if (t === 'OTHER_INCOME') return 'INCOME'
  return undefined
}

export function transformAccount(raw: CampfireChartAccount): Account {
  const status: AccountStatus = (raw.status ?? '').toUpperCase() === 'INACTIVE' ? 'ARCHIVED' : 'ACTIVE'
  return {
    id: raw.account_id ?? String(raw.id),
    name: raw.name || undefined,
    description: raw.description || undefined,
    customerDefinedCode: raw.number || undefined,
    type: mapAccountType(raw.account_type),
    status,
    currency: raw.currency || undefined,
    balance: raw.current_balance ?? undefined,
    parentId: raw.parent != null ? String(raw.parent) : undefined,
    createdAt: raw.created_at ? new Date(raw.created_at) : undefined,
    updatedAt: raw.last_modified_at ? new Date(raw.last_modified_at) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
