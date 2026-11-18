import type { Account, AccountStatus, AccountType } from '../../../schema/account'

export interface TwentyFourSevenAccount {
  id: string
  name: string
  description: string
  accountNumber: number
  groupId: string
  type: string
  isArchived: boolean
  currency: string
  [key: string]: unknown
}

function mapType(acc: TwentyFourSevenAccount): AccountType {
  const t = acc.type?.toLowerCase() ?? ''
  if (t.includes('asset')) return 'ASSET'
  if (t.includes('liabilit')) return 'LIABILITY'
  if (t.includes('equity')) return 'EQUITY'
  if (t.includes('revenue') || t.includes('income')) return 'INCOME'
  if (t.includes('expense') || t.includes('cost')) return 'EXPENSE'
  return 'OTHER'
}

export function transformAccount(raw: TwentyFourSevenAccount): Account {
  const status: AccountStatus = raw.isArchived ? 'ARCHIVED' : 'ACTIVE'
  return {
    id: raw.id,
    name: raw.name || undefined,
    description: raw.description || undefined,
    customerDefinedCode: raw.accountNumber ? String(raw.accountNumber) : undefined,
    type: mapType(raw),
    status,
    group: raw.groupId || undefined,
    currency: raw.currency || undefined,
    metadata: raw as Record<string, unknown>,
  }
}
