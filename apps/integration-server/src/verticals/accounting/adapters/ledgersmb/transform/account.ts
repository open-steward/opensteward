/**
 * LedgerSMB chart-of-accounts transform.
 *
 * API resource: GET /accounts/
 *
 * LedgerSMB account response shape (v0 REST API):
 *   accno       — account number string (e.g. "1200")
 *   description — account description
 *   label       — formatted as "accno--description"
 *   obsolete    — boolean; obsolete accounts are excluded from the list response
 *   (additional fields may be present from the underlying chart node)
 *
 * GET /accounts/{id} is a stub (not yet implemented in LedgerSMB v0 API).
 * Accounts are fetched via the list endpoint and matched by accno.
 */

import type { Account, AccountStatus } from '../../../schema/account'

export interface LedgerSMBAccount {
  accno?: string
  description?: string
  label?: string
  obsolete?: boolean
  category?: string
  [key: string]: unknown
}

/**
 * Map LedgerSMB account category to canonical AccountType.
 * LedgerSMB uses single-char category codes in its internal chart:
 *   A = Asset, L = Liability, Q = Equity, I = Income, E = Expense
 */
function mapAccountType(category?: string): Account['type'] {
  if (!category) return undefined
  const c = category.toUpperCase()
  if (c === 'A') return 'ASSET'
  if (c === 'L') return 'LIABILITY'
  if (c === 'Q') return 'EQUITY'
  if (c === 'I') return 'INCOME'
  if (c === 'E') return 'EXPENSE'
  return 'OTHER'
}

export function transformAccount(raw: LedgerSMBAccount): Account {
  const status: AccountStatus = raw.obsolete ? 'ARCHIVED' : 'ACTIVE'
  return {
    id: raw.accno || undefined,
    name: raw.description || undefined,
    customerDefinedCode: raw.accno || undefined,
    type: mapAccountType(raw.category),
    status,
    metadata: raw as Record<string, unknown>,
  }
}
