/**
 * Access Financials nominal account transform.
 *
 * Queried from: financials > masterRecords > accounts
 *
 * Key response fields (details sub-object):
 *   primaryKey, accountCode, accountName, accountType, majorHeadingCode,
 *   compulsoryCosting
 * Summary data:
 *   balance, turnoverYtd, currencyBalance
 */
import type { Account, AccountType } from '../../../schema/account'

export interface AFAccountDetails {
  primaryKey: number
  accountCode: string
  accountName: string
  /** e.g. "A" (Asset), "L" (Liability), "I" (Income), "E" (Expense), "C" (Capital/Equity) */
  accountType?: string
  majorHeadingCode?: string
  compulsoryCosting?: boolean
  [key: string]: unknown
}

export interface AFAccountSummary {
  balance?: number
  turnoverYtd?: number
  currencyBalance?: number
  [key: string]: unknown
}

export interface AFAccount {
  details: AFAccountDetails
  summaryData?: AFAccountSummary
  [key: string]: unknown
}

/**
 * Access Financials uses single-character account type codes.
 * Map to canonical AccountType values.
 */
const AF_TYPE_MAP: Record<string, AccountType> = {
  A: 'ASSET',
  L: 'LIABILITY',
  C: 'EQUITY',
  I: 'INCOME',
  E: 'EXPENSE',
  // Some systems use full words
  Asset: 'ASSET',
  Liability: 'LIABILITY',
  Capital: 'EQUITY',
  Equity: 'EQUITY',
  Income: 'INCOME',
  Expense: 'EXPENSE',
}

export function transformAccount(raw: AFAccount): Account {
  const d = raw.details
  return {
    id: String(d.primaryKey),
    name: d.accountName || undefined,
    customerDefinedCode: d.accountCode || undefined,
    type: (d.accountType ? (AF_TYPE_MAP[d.accountType] ?? 'OTHER') : 'OTHER') as AccountType,
    status: 'ACTIVE',
    balance:
      raw.summaryData?.balance !== undefined
        ? Math.round(raw.summaryData.balance * 100)
        : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
