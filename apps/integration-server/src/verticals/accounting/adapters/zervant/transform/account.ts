import type { Account, AccountStatus, AccountType } from '../../../schema/account'

export interface ZervantAccount {
  id: string
  accountCode?: string
  name?: string
  type?: string
  active?: boolean
  [key: string]: unknown
}

function mapAccountType(type: string | undefined): AccountType {
  switch (type?.toLowerCase()) {
    case 'asset': return 'ASSET'
    case 'liability': return 'LIABILITY'
    case 'equity': return 'EQUITY'
    case 'income': return 'INCOME'
    case 'expense': return 'EXPENSE'
    default: return 'OTHER'
  }
}

export function transformAccount(raw: ZervantAccount): Account {
  const status: AccountStatus = raw.active === false ? 'ARCHIVED' : 'ACTIVE'
  return {
    id: raw.id,
    name: raw.name || undefined,
    customerDefinedCode: raw.accountCode || undefined,
    type: mapAccountType(raw.type),
    status,
    metadata: raw as Record<string, unknown>,
  }
}
