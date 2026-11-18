import type { Account, AccountStatus, AccountType } from '../../../schema/account'

export interface SpeedLedgerAccount {
  id: number | string
  accountNumber?: string | number
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

export function transformAccount(raw: SpeedLedgerAccount): Account {
  const status: AccountStatus = raw.active === false ? 'ARCHIVED' : 'ACTIVE'
  const code = raw.accountNumber !== undefined ? String(raw.accountNumber) : undefined
  return {
    id: String(raw.id),
    name: raw.name || undefined,
    customerDefinedCode: code,
    type: mapAccountType(raw.type),
    status,
    metadata: raw as Record<string, unknown>,
  }
}
