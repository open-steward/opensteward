import type { Account, AccountType } from '../../../schema/account'

export interface QBOAccount {
  Id: string
  Name: string
  FullyQualifiedName: string
  Description: string
  AccountType: string
  AccountSubType: string
  Active: boolean
  CurrentBalance: number
  CurrencyRef?: { value: string }
  [key: string]: unknown
}

const QBO_TYPE_MAP: Record<string, AccountType> = {
  Bank: 'ASSET',
  'Other Current Asset': 'ASSET',
  'Fixed Asset': 'ASSET',
  'Other Asset': 'ASSET',
  'Accounts Receivable': 'ASSET',
  'Accounts Payable': 'LIABILITY',
  'Credit Card': 'LIABILITY',
  'Long Term Liability': 'LIABILITY',
  'Other Current Liability': 'LIABILITY',
  Equity: 'EQUITY',
  Income: 'INCOME',
  'Other Income': 'INCOME',
  'Cost of Goods Sold': 'EXPENSE',
  Expense: 'EXPENSE',
  'Other Expense': 'EXPENSE',
}

export function transformAccount(raw: QBOAccount): Account {
  return {
    id: raw.Id,
    name: raw.Name || undefined,
    description: raw.Description || undefined,
    type: QBO_TYPE_MAP[raw.AccountType] ?? 'OTHER',
    status: raw.Active ? 'ACTIVE' : 'ARCHIVED',
    balance: raw.CurrentBalance,
    currency: raw.CurrencyRef?.value || undefined,
    metadata: raw as Record<string, unknown>,
  }
}
