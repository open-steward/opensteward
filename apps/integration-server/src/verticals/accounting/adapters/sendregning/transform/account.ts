import type { Account, AccountStatus, AccountType } from '../../../schema/account'

export interface SendRegningAccount {
  id: string
  accountNo?: string
  name?: string
  type?: string
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

export function transformAccount(raw: SendRegningAccount): Account {
  const status: AccountStatus = raw.active === false ? 'ARCHIVED' : 'ACTIVE'
  return {
    id: raw.id,
    name: raw.name || undefined,
    customerDefinedCode: raw.accountNo || undefined,
    type: mapAccountType(raw.type),
    status,
    metadata: raw as Record<string, unknown>,
  }
}
