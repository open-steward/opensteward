/**
 * Bill4Time → canonical Account transform.
 *
 * Bill4Time v2 bank-account fields (from B4T API documentation):
 *   BankAccountId, AccountName, AccountNumber, RoutingNumber,
 *   BankName, Balance, Currency, IsActive
 *
 * These are the financial (bank) accounts Bill4Time exposes via the
 * /v2/bankaccounts endpoint rather than a chart-of-accounts.
 */
import type { Account, AccountStatus } from '../../../schema/account'

export interface Bill4TimeBankAccount {
  BankAccountId?: string | number
  AccountName?: string
  AccountNumber?: string
  RoutingNumber?: string
  BankName?: string
  Balance?: number
  Currency?: string
  IsActive?: boolean
  [key: string]: unknown
}

export function transformAccount(raw: Bill4TimeBankAccount): Account {
  const status: AccountStatus = raw.IsActive === false ? 'ARCHIVED' : 'ACTIVE'
  return {
    id: raw.BankAccountId != null ? String(raw.BankAccountId) : undefined,
    name: raw.AccountName || raw.BankName || undefined,
    customerDefinedCode: raw.AccountNumber || undefined,
    status,
    balance: raw.Balance,
    currency: raw.Currency || undefined,
    metadata: raw as Record<string, unknown>,
  }
}
