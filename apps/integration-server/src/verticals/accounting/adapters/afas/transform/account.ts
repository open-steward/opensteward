/**
 * AFAS Profit_FinancialAccounts GetConnector → canonical Account transform.
 *
 * Fields returned by Profit_FinancialAccounts:
 *   AccountNr        — general ledger account number
 *   AccountDesc      — account description / name
 *   AccountType      — account type code (B = balance, R = result/P&L)
 *   IsActive         — whether the account is still in use
 *   Balance          — current account balance
 *   CurrencyId       — currency code
 */
import type { Account, AccountStatus } from '../../../schema/account'
import { toMinorUnits } from '../../shared/transform'

export interface AfasFinancialAccount {
  AccountNr: string
  AccountDesc: string
  AccountType: string
  IsActive: boolean
  Balance: number
  CurrencyId: string
  [key: string]: unknown
}

export function transformAccount(raw: AfasFinancialAccount): Account {
  const status: AccountStatus = raw.IsActive ? 'ACTIVE' : 'ARCHIVED'
  return {
    id: raw.AccountNr,
    name: raw.AccountDesc || undefined,
    customerDefinedCode: raw.AccountNr || undefined,
    status,
    balance: toMinorUnits(raw.Balance),
    metadata: raw as Record<string, unknown>,
  }
}
