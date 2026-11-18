import type { Account, AccountStatus, AccountType } from '../../../schema/account'

export interface FreeeAccountItem {
  id: number
  name: string
  account_category: string
  available: boolean
  shortcut: string | null
  shortcut_num: string | null
  [key: string]: unknown
}

function mapType(category: string): AccountType | undefined {
  switch (category) {
    case 'income':
      return 'INCOME'
    case 'expense':
      return 'EXPENSE'
    case 'asset':
      return 'ASSET'
    case 'liability':
      return 'LIABILITY'
    case 'equity':
      return 'EQUITY'
    default:
      return undefined
  }
}

export function transformAccount(raw: FreeeAccountItem): Account {
  const status: AccountStatus = raw.available ? 'ACTIVE' : 'ARCHIVED'
  return {
    id: String(raw.id),
    name: raw.name || undefined,
    customerDefinedCode: raw.shortcut_num || raw.shortcut || undefined,
    status,
    type: mapType(raw.account_category),
    metadata: raw as Record<string, unknown>,
  }
}
