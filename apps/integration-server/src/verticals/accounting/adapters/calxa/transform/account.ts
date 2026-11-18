import type { Account, AccountStatus, AccountType } from '../../../schema/account'

/**
 * Calxa chart-of-accounts entry as returned by GET /accounts.
 *
 * Calxa syncs the chart of accounts from the connected accounting system
 * (Xero, QuickBooks, MYOB, etc.) and exposes it read-only via this resource.
 */
export interface CalxaAccount {
  /** Platform-assigned identifier for this account. */
  id: string
  /** Account code / number (e.g. "4000"). */
  code?: string
  /** Account display name. */
  name?: string
  /** Account description or longer label. */
  description?: string
  /**
   * Calxa account type. Maps to the type vocabulary of the connected
   * accounting system (e.g. "Revenue", "Expense", "Asset", "Liability").
   */
  type?: string
  /** Whether the account is currently active in the connected system. */
  isActive?: boolean
  /** ISO 4217 currency when the account is currency-specific. */
  currency?: string
  /** Current balance in the account's currency (where available). */
  balance?: number
  createdAt?: string
  updatedAt?: string
  [key: string]: unknown
}

function mapAccountType(type?: string): AccountType | undefined {
  if (!type) return undefined
  const t = type.toUpperCase()
  if (t.includes('ASSET') || t.includes('BANK') || t.includes('CURRENT')) return 'ASSET'
  if (t.includes('LIAB') || t.includes('CREDIT')) return 'LIABILITY'
  if (t.includes('EQUITY') || t.includes('OWNER')) return 'EQUITY'
  if (t.includes('REVENUE') || t.includes('INCOME') || t.includes('SALES')) return 'INCOME'
  if (t.includes('EXPENSE') || t.includes('COST') || t.includes('OVERHEAD')) return 'EXPENSE'
  return 'OTHER'
}

export function transformAccount(raw: CalxaAccount): Account {
  const status: AccountStatus = raw.isActive === false ? 'ARCHIVED' : 'ACTIVE'
  return {
    id: raw.id,
    name: raw.name || undefined,
    description: raw.description || undefined,
    customerDefinedCode: raw.code || undefined,
    type: mapAccountType(raw.type),
    status,
    currency: raw.currency || undefined,
    balance: raw.balance ?? undefined,
    createdAt: raw.createdAt ? new Date(raw.createdAt) : undefined,
    updatedAt: raw.updatedAt ? new Date(raw.updatedAt) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
