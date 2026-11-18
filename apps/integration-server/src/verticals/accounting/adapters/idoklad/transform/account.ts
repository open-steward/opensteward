import type { Account } from '../../../schema/account'

export interface IdokladAccount {
  Id: string | number
  AccountNumber?: string
  Name?: string
  AccountType?: string
  CurrencyId?: string
  Balance?: number
  [key: string]: unknown
}

export function transformAccount(raw: IdokladAccount): Account {
  return {
    id: String(raw.Id),
    name: raw.Name || undefined,
    customerDefinedCode: raw.AccountNumber || undefined,
    currency: raw.CurrencyId || undefined,
    balance: raw.Balance,
    metadata: raw as Record<string, unknown>,
  }
}
