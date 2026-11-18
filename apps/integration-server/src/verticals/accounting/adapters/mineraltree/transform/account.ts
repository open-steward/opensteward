/**
 * MineralTree GL account → canonical Account transform.
 *
 * Endpoint: GET /mtapi/base/services/glaccount/{companyId}
 */

import type { Account, AccountStatus, AccountType } from '../../../schema/account'

export interface MtGlAccount {
  id?: string
  externalId?: string
  name?: string
  code?: string
  /**
   * MineralTree GL account category string.
   * Standard values: ASSET | LIABILITY | EQUITY | INCOME | EXPENSE
   * AP-specific values returned by the API: AP_ACCOUNT | EXPENSE_ACCOUNT | ACCOUNT
   */
  type?: string
  active?: boolean
  description?: string
  [key: string]: unknown
}

/**
 * Map the MineralTree GL account type string to the canonical AccountType.
 * MineralTree may return standard balance-sheet categories (ASSET, LIABILITY,
 * EQUITY, INCOME, EXPENSE) or AP-specific categories (AP_ACCOUNT,
 * EXPENSE_ACCOUNT, ACCOUNT).  Unknown values fall back to 'unknown' which is
 * accepted by AccountTypeSchema (via withUnknown).
 *
 * Guards against non-string input so the function never throws.
 */
function mapAccountType(raw: unknown): AccountType | undefined {
  if (typeof raw !== 'string' || !raw) return undefined
  const upper = raw.toUpperCase()
  switch (upper) {
    case 'ASSET':          return 'ASSET'
    case 'LIABILITY':      return 'LIABILITY'
    case 'EQUITY':         return 'EQUITY'
    case 'INCOME':         return 'INCOME'
    case 'EXPENSE':
    case 'EXPENSE_ACCOUNT':
      return 'EXPENSE'
    // AP_ACCOUNT is a payable — closest canonical match is LIABILITY
    case 'AP_ACCOUNT':     return 'LIABILITY'
    default:               return 'unknown'
  }
}

export function transformAccount(raw: MtGlAccount): Account {
  const status: AccountStatus = raw.active !== false ? 'ACTIVE' : 'ARCHIVED'
  return {
    id: raw.id || raw.externalId || undefined,
    name: raw.name || raw.description || undefined,
    description: raw.description || undefined,
    customerDefinedCode: raw.code || raw.externalId || undefined,
    type: mapAccountType(raw.type),
    status,
    metadata: raw as Record<string, unknown>,
  }
}
