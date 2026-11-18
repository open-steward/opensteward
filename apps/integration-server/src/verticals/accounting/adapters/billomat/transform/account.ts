import type { Account, AccountStatus, AccountType } from '../../../schema/account'

export interface BillomatAccount {
  id: string
  name: string
  account_number: string
  type: string
  is_archived: boolean
  [key: string]: unknown
}

function mapType(acc: BillomatAccount): AccountType {
  const t = acc.type?.toLowerCase() ?? ''
  if (t.includes('asset')) return 'ASSET'
  if (t.includes('liabilit')) return 'LIABILITY'
  if (t.includes('equity')) return 'EQUITY'
  if (t.includes('revenue') || t.includes('income')) return 'INCOME'
  if (t.includes('expense')) return 'EXPENSE'
  return 'OTHER'
}

export function transformAccount(raw: BillomatAccount): Account {
  const status: AccountStatus = raw.is_archived ? 'ARCHIVED' : 'ACTIVE'
  return {
    id: raw.id,
    name: raw.name || undefined,
    customerDefinedCode: raw.account_number || undefined,
    type: mapType(raw),
    status,
    metadata: raw as Record<string, unknown>,
  }
}
