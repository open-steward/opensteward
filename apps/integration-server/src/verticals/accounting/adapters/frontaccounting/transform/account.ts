import type { Account, AccountType } from '../../../schema/account'

export interface FAAccount {
  account_code: string
  account_name?: string
  account_type?: number | string
  inactive?: number | string
  [key: string]: unknown
}

function mapAccountType(type?: number | string): AccountType | undefined {
  const t = Number(type)
  // FrontAccounting account classes: 1=Assets, 2=Liabilities, 3=Equity, 4=Income, 5=Expense
  switch (t) {
    case 1:
      return 'ASSET'
    case 2:
      return 'LIABILITY'
    case 3:
      return 'EQUITY'
    case 4:
      return 'INCOME'
    case 5:
      return 'EXPENSE'
    default:
      return undefined
  }
}

export function transformAccount(raw: FAAccount): Account {
  return {
    id: raw.account_code,
    name: raw.account_name || undefined,
    customerDefinedCode: raw.account_code,
    type: mapAccountType(raw.account_type),
    status: raw.inactive === 1 ? 'ARCHIVED' : 'ACTIVE',
    metadata: raw as Record<string, unknown>,
  }
}
