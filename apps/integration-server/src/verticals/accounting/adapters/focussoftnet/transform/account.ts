import type { Account, AccountType, AccountStatus } from '../../../schema/account'

export interface FocusSoftnetAccount {
  AccCode: string
  AccName: string
  AccType: string
  IsActive: boolean
  [key: string]: unknown
}

function mapAccountType(accType: string): AccountType {
  switch (accType) {
    case 'I': return 'INCOME'
    case 'E': return 'EXPENSE'
    case 'A': return 'ASSET'
    case 'L': return 'LIABILITY'
    case 'Q': return 'EQUITY'
    default: return 'OTHER'
  }
}

export function transformAccount(raw: FocusSoftnetAccount): Account {
  const status: AccountStatus = raw.IsActive ? 'ACTIVE' : 'ARCHIVED'
  return {
    id: String(raw.AccCode),
    name: raw.AccName || undefined,
    customerDefinedCode: String(raw.AccCode),
    type: mapAccountType(raw.AccType),
    status,
    metadata: raw as Record<string, unknown>,
  }
}
