import type { Account, AccountStatus, AccountType } from '../../../schema/account'

export interface GiddhAccountRecord {
  uniqueName: string
  name: string
  type: string
  isActive: boolean
  openingBalance: number
  currency: string
  [key: string]: unknown
}

function mapAccountType(type: string): AccountType {
  switch (type?.toUpperCase()) {
    case 'NONCURRENTASSETS':
    case 'CURRENTASSETS':
    case 'FIXEDASSETS':
      return 'ASSET'
    case 'CURRENTLIABILITIES':
    case 'NONCURRENTLIABILITIES':
      return 'LIABILITY'
    case 'SHAREHOLDER':
      return 'EQUITY'
    case 'REVENUEFROMOPERATIONS':
    case 'OTHERINCOME':
      return 'INCOME'
    case 'OPERATINGCOST':
    case 'INDIRECTEXPENSES':
      return 'EXPENSE'
    default:
      return 'OTHER'
  }
}

export function transformAccount(raw: GiddhAccountRecord): Account {
  const status: AccountStatus = raw.isActive ? 'ACTIVE' : 'ARCHIVED'
  return {
    id: raw.uniqueName,
    name: raw.name || undefined,
    type: mapAccountType(raw.type),
    status,
    currency: raw.currency || undefined,
    balance: raw.openingBalance,
    metadata: raw as Record<string, unknown>,
  }
}
