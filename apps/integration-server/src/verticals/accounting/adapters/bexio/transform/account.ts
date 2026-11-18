import type { Account, AccountStatus, AccountType } from '../../../schema/account'

export interface BexioAccount {
  id: number
  account_no: number
  name: string
  account_type: number
  is_active: boolean
  parent_id: number | null
  [key: string]: unknown
}

function mapType(accountType: number): AccountType {
  switch (accountType) {
    case 1:
      return 'ASSET'
    case 2:
      return 'LIABILITY'
    case 3:
      return 'EQUITY'
    case 4:
      return 'INCOME'
    case 5:
      return 'EXPENSE'
    default:
      return 'OTHER'
  }
}

export function transformAccount(raw: BexioAccount): Account {
  const status: AccountStatus = raw.is_active ? 'ACTIVE' : 'ARCHIVED'
  return {
    id: String(raw.id),
    name: raw.name || undefined,
    customerDefinedCode: raw.account_no ? String(raw.account_no) : undefined,
    type: mapType(raw.account_type),
    status,
    parentId: raw.parent_id ? String(raw.parent_id) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
