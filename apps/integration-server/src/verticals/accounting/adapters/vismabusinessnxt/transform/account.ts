import type { Account, AccountStatus, AccountType } from '../../../schema/account'

export interface VismaBusinessNxtAccount {
  id: string
  accountNumber?: string
  name?: string
  type?: string
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

export function transformAccount(raw: VismaBusinessNxtAccount): Account {
  const status: AccountStatus = (raw.isActive ?? true) === false ? 'ARCHIVED' : 'ACTIVE'
  return {
    id: raw.id,
    name: raw.name || undefined,
    customerDefinedCode: raw.accountNumber || undefined,
    type: mapAccountType(raw.type),
    status,
    metadata: raw as Record<string, unknown>,
  }
}
