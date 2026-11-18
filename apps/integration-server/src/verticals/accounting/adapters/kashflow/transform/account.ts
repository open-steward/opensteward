import type { Account, AccountStatus } from '../../../schema/account'
import { toMinorUnits } from '../../shared/transform'

// KashFlow REST API v2 — Bank Accounts
// Docs: https://www.kashflow.com/developers/rest-api/bank-accounts/
// KashFlow exposes bank accounts via /bankaccounts; nominal (ledger) codes are
// referenced by number on line items but do not have a standalone REST endpoint.

export interface KashflowBankAccount {
  Id?: number
  Code?: number
  AccountName?: string
  IsDefaultAccount?: boolean
  IsArchived?: boolean
  BankBalance?: number
  StartingAmount?: number
  StartingDate?: string
  ReconcileDate?: string
  Note?: string
  [key: string]: unknown
}

export function transformAccount(raw: KashflowBankAccount): Account {
  const status: AccountStatus = raw.IsArchived ? 'ARCHIVED' : 'ACTIVE'
  const code = raw.Code !== undefined ? String(raw.Code) : raw.Id !== undefined ? String(raw.Id) : undefined

  return {
    id: code ?? (raw.Id !== undefined ? String(raw.Id) : undefined),
    name: raw.AccountName || undefined,
    customerDefinedCode: code,
    status,
    // KashFlow returns BankBalance as decimal pounds (e.g. 20310.00); convert to minor units (pence).
    balance: toMinorUnits(raw.BankBalance),
    metadata: raw as Record<string, unknown>,
  }
}
