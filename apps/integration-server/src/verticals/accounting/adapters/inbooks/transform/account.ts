import type { Account, AccountStatus, AccountType } from '../../../schema/account'

export interface InbooksAccount {
  id: number | string
  account_code?: string
  account_name?: string
  account_type?: string
  active?: boolean
  [key: string]: unknown
}

function mapAccountType(type?: string): AccountType | undefined {
  switch (type?.toLowerCase()) {
    case 'asset': return 'ASSET'
    case 'liability': return 'LIABILITY'
    case 'equity': return 'EQUITY'
    case 'income':
    case 'revenue': return 'INCOME'
    case 'expense':
    case 'cost': return 'EXPENSE'
    default: return type ? 'OTHER' : undefined
  }
}

export function transformAccount(raw: InbooksAccount): Account {
  const status: AccountStatus = raw.active === false ? 'ARCHIVED' : 'ACTIVE'
  return {
    id: String(raw.id),
    name: raw.account_name || undefined,
    customerDefinedCode: raw.account_code || undefined,
    type: mapAccountType(raw.account_type),
    status,
    metadata: raw as Record<string, unknown>,
  }
}
