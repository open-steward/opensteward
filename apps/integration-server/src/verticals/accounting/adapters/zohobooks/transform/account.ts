import type { Account, AccountType } from '../../../schema/account'

export interface ZohoBooksAccount {
  account_id: string
  account_name: string
  account_code: string
  account_type: string
  description: string
  is_active: boolean
  current_balance: number
  currency_code: string
  [key: string]: unknown
}

const ZOHO_TYPE_MAP: Record<string, AccountType> = {
  cash: 'ASSET',
  bank: 'ASSET',
  'other_current_asset': 'ASSET',
  'fixed_asset': 'ASSET',
  'other_asset': 'ASSET',
  'accounts_receivable': 'ASSET',
  'credit_card': 'LIABILITY',
  'other_current_liability': 'LIABILITY',
  'long_term_liability': 'LIABILITY',
  'accounts_payable': 'LIABILITY',
  'equity': 'EQUITY',
  'income': 'INCOME',
  'other_income': 'INCOME',
  'expense': 'EXPENSE',
  'cost_of_goods_sold': 'EXPENSE',
  'other_expense': 'EXPENSE',
}

export function transformAccount(raw: ZohoBooksAccount): Account {
  return {
    id: raw.account_id,
    name: raw.account_name || undefined,
    description: raw.description || undefined,
    customerDefinedCode: raw.account_code || undefined,
    type: ZOHO_TYPE_MAP[raw.account_type.toLowerCase()] ?? 'OTHER',
    status: raw.is_active ? 'ACTIVE' : 'ARCHIVED',
    balance: raw.current_balance,
    currency: raw.currency_code || undefined,
    metadata: raw as Record<string, unknown>,
  }
}
