import type { Account, AccountStatus, AccountType } from '../../../schema/account'

export interface PEAccountingAccount {
  id: number | string
  number?: string | number
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
    case 'income': return 'INCOME'
    case 'expense': return 'EXPENSE'
    default: return type ? 'OTHER' : undefined
  }
}

export function transformAccount(raw: PEAccountingAccount): Account {
  const status: AccountStatus = raw.active === false ? 'ARCHIVED' : 'ACTIVE'
  const code = raw.number !== undefined ? String(raw.number) : undefined
  return {
    id: String(raw.id),
    name: raw.name || undefined,
    customerDefinedCode: code,
    type: mapAccountType(raw.type),
    status,
    metadata: raw as Record<string, unknown>,
  }
}
