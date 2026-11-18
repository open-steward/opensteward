import type { Account, AccountType, AccountStatus } from '../../../schema/account'

export interface HorizonErpAccount {
  id: string
  code: string
  name: string
  group: string
  active: boolean
  [key: string]: unknown
}

function mapAccountType(group: string): AccountType {
  switch (group) {
    case 'Sales': return 'INCOME'
    case 'Purchase':
    case 'Expense': return 'EXPENSE'
    case 'Asset': return 'ASSET'
    case 'Liability': return 'LIABILITY'
    case 'Capital': return 'EQUITY'
    default: return 'OTHER'
  }
}

export function transformAccount(raw: HorizonErpAccount): Account {
  const status: AccountStatus = raw.active ? 'ACTIVE' : 'ARCHIVED'
  return {
    id: String(raw.id),
    name: raw.name || undefined,
    customerDefinedCode: raw.code || undefined,
    type: mapAccountType(raw.group),
    group: raw.group || undefined,
    status,
    metadata: raw as Record<string, unknown>,
  }
}
