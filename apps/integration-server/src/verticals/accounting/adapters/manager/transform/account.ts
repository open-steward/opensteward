/**
 * Manager chart-of-accounts → canonical Account transform.
 *
 * API endpoint: GET /api2/chart-of-accounts
 */
import type { Account, AccountStatus, AccountType } from '../../../schema/account'

export interface ManagerAccount {
  key?: string
  code?: string
  name?: string
  /** e.g. "Assets", "Liabilities", "Equity", "Income", "Expenses" */
  accountType?: string
  /** Whether the account is currently in use / active */
  inactive?: boolean
  [key: string]: unknown
}

function mapType(raw?: string): AccountType | undefined {
  if (!raw) return undefined
  const t = raw.toLowerCase()
  if (t.includes('asset')) return 'ASSET'
  if (t.includes('liabilit')) return 'LIABILITY'
  if (t.includes('equity') || t.includes('capital')) return 'EQUITY'
  if (t.includes('income') || t.includes('revenue')) return 'INCOME'
  if (t.includes('expense') || t.includes('cost')) return 'EXPENSE'
  return 'OTHER'
}

export function transformAccount(raw: ManagerAccount): Account {
  const status: AccountStatus = raw.inactive ? 'ARCHIVED' : 'ACTIVE'
  return {
    id: raw.key,
    name: raw.name || undefined,
    customerDefinedCode: raw.code || undefined,
    type: mapType(raw.accountType),
    status,
    metadata: raw as Record<string, unknown>,
  }
}
