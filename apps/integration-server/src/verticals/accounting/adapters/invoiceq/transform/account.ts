import type { Account, AccountType } from '../../../schema/account'

export interface InvoiceqAccount {
  id: string
  account_code?: string
  account_name?: string
  account_type?: string
  is_active?: boolean
  [key: string]: unknown
}

function mapAccountType(type?: string): AccountType | undefined {
  if (!type) return undefined
  const t = type.toLowerCase()
  switch (t) {
    case 'income':
    case 'revenue':
      return 'INCOME'
    case 'expense':
      return 'EXPENSE'
    case 'asset':
      return 'ASSET'
    case 'liability':
      return 'LIABILITY'
    case 'equity':
      return 'EQUITY'
    default:
      return 'OTHER'
  }
}

export function transformAccount(raw: InvoiceqAccount): Account {
  return {
    id: String(raw.id),
    name: raw.account_name || undefined,
    customerDefinedCode: raw.account_code || undefined,
    type: mapAccountType(raw.account_type),
    status: raw.is_active === false ? 'ARCHIVED' : 'ACTIVE',
    metadata: raw as Record<string, unknown>,
  }
}
