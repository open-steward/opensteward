import type { Account, AccountStatus, AccountType } from '../../../schema/account'

export interface AmanoteAccount {
  id: string | number
  name?: string
  code?: string
  type?: string
  active?: boolean
  [key: string]: unknown
}

function mapAccountType(type: string | undefined): AccountType {
  switch (type) {
    case 'asset': return 'ASSET'
    case 'liability': return 'LIABILITY'
    case 'equity': return 'EQUITY'
    case 'income': return 'INCOME'
    case 'expense': return 'EXPENSE'
    default: return 'OTHER'
  }
}

export function transformAccount(raw: AmanoteAccount): Account {
  const status: AccountStatus = raw.active !== false ? 'ACTIVE' : 'ARCHIVED'
  return {
    id: String(raw.id),
    name: raw.name,
    customerDefinedCode: raw.code,
    type: mapAccountType(raw.type),
    status,
    metadata: raw as Record<string, unknown>,
  }
}
