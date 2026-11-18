import type { Account, AccountStatus, AccountType } from '../../../schema/account'

export interface AkauntingAccount {
  id: number
  name: string
  number: string
  type_id: number
  currency_code: string
  opening_balance: number
  bank_name: string
  bank_phone: string
  enabled: boolean
  [key: string]: unknown
}

/**
 * Akaunting type_id mapping:
 *  1 = Current Asset, 2 = Fixed Asset, 3 = Inventory
 *  4 = Non-current Asset, 5 = Prepayment
 *  6 = Current Liability, 7 = Liability, 8 = Non-current Liability
 *  9 = Equity
 * 10 = Depreciation, 11 = Direct Costs, 12 = Expense
 * 13 = Revenue, 14 = Sales, 15 = Other Income
 */
function mapType(typeId: number): AccountType {
  if (typeId >= 1 && typeId <= 5) return 'ASSET'
  if (typeId >= 6 && typeId <= 8) return 'LIABILITY'
  if (typeId === 9) return 'EQUITY'
  if (typeId >= 10 && typeId <= 12) return 'EXPENSE'
  if (typeId >= 13 && typeId <= 15) return 'INCOME'
  return 'OTHER'
}

export function transformAccount(raw: AkauntingAccount): Account {
  const status: AccountStatus = raw.enabled ? 'ACTIVE' : 'ARCHIVED'
  return {
    id: String(raw.id),
    name: raw.name || undefined,
    customerDefinedCode: raw.number || undefined,
    type: mapType(raw.type_id),
    status,
    currency: raw.currency_code || undefined,
    metadata: raw as Record<string, unknown>,
  }
}
