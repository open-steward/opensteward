import type { Account, AccountStatus, AccountType } from '../../../schema/account'

export interface NetvisorAccount {
  NetvisorKey: number
  Number: number
  Name: string
  AccountType: string
  IsActive: number
  Currency: string
  [key: string]: unknown
}

function mapType(raw: NetvisorAccount): AccountType {
  switch (raw.AccountType) {
    case 'Revenue':
      return 'INCOME'
    case 'Cost':
      return 'EXPENSE'
    case 'Asset':
      return 'ASSET'
    case 'Liability':
      return 'LIABILITY'
    case 'Equity':
      return 'EQUITY'
    default:
      return 'OTHER'
  }
}

export function transformAccount(raw: NetvisorAccount): Account {
  const status: AccountStatus = raw.IsActive === 1 ? 'ACTIVE' : 'ARCHIVED'
  return {
    id: String(raw.NetvisorKey),
    name: raw.Name || undefined,
    customerDefinedCode: raw.Number ? String(raw.Number) : undefined,
    type: mapType(raw),
    status,
    currency: raw.Currency || undefined,
    metadata: raw as Record<string, unknown>,
  }
}
