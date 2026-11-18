import type { Account, AccountType } from '../../../schema/account'

export interface FreshBooksAccount {
  id: number
  name: string
  account_number: string
  type: string
  sub_type: string
  active: boolean
  balance: { amount: string; code: string }
  currency_code: string
  [key: string]: unknown
}

function mapType(type: string): AccountType {
  switch (type) {
    case 'asset': return 'ASSET'
    case 'liability': return 'LIABILITY'
    case 'equity': return 'EQUITY'
    case 'revenue': return 'INCOME'
    case 'expense': return 'EXPENSE'
    default: return 'OTHER'
  }
}

export function transformAccount(raw: FreshBooksAccount): Account {
  return {
    id: String(raw.id),
    name: raw.name || undefined,
    customerDefinedCode: raw.account_number || undefined,
    type: mapType(raw.type),
    status: raw.active ? 'ACTIVE' : 'ARCHIVED',
    currency: raw.currency_code || undefined,
    balance: raw.balance?.amount ? parseFloat(raw.balance.amount) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
