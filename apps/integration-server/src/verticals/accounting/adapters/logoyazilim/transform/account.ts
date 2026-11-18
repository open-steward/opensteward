import type { Account, AccountType } from '../../../schema/account'

export interface LogoAccount {
  id: string
  Code?: string
  Name?: string
  Type?: string  // 'Asset' | 'Liability' | 'Equity' | 'Income' | 'Expense'
  Balance?: number
  [key: string]: unknown
}

function mapAccountType(type?: string): AccountType | undefined {
  switch (type?.toLowerCase()) {
    case 'asset': return 'ASSET'
    case 'liability': return 'LIABILITY'
    case 'equity': return 'EQUITY'
    case 'income': return 'INCOME'
    case 'expense': return 'EXPENSE'
    default: return undefined
  }
}

export function transformAccount(raw: LogoAccount): Account {
  return {
    id: String(raw.id),
    name: raw.Name || undefined,
    customerDefinedCode: raw.Code || undefined,
    type: mapAccountType(raw.Type),
    balance: raw.Balance,
    metadata: raw as Record<string, unknown>,
  }
}
