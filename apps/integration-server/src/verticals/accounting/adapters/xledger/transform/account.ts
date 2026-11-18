import type { Account, AccountStatus, AccountType } from '../../../schema/account'

export interface XledgerAccount {
  dbId: string
  code?: string
  description?: string
  accountType?: string
  isActive?: boolean
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

export function transformAccount(raw: XledgerAccount): Account {
  const status: AccountStatus = (raw.isActive ?? true) === false ? 'ARCHIVED' : 'ACTIVE'
  return {
    id: String(raw.dbId),
    name: raw.description || undefined,
    customerDefinedCode: raw.code || undefined,
    type: mapAccountType(raw.accountType),
    status,
    metadata: raw as Record<string, unknown>,
  }
}
