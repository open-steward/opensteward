import type { Account, AccountStatus } from '../../../schema/account'

/**
 * CashCtrl account record as returned by GET /account/read.json
 * and listed via GET /account/list.json.
 *
 * Docs: https://app.cashctrl.com/static/help/en/api/index.html#account
 */
export interface CashCtrlAccount {
  id: number
  /** Chart-of-accounts number (e.g. 1000). */
  number: string
  name: string
  /** Category (parent) id. */
  categoryId?: number | null
  /** ISO 4217 currency code or null for the default org currency. */
  currencyCode?: string | null
  /** Balance in the account's currency. */
  balance?: number | null
  /** When true the account is deactivated. */
  isInactive?: boolean | null
  [key: string]: unknown
}

export function transformAccount(raw: CashCtrlAccount): Account {
  const status: AccountStatus = raw.isInactive ? 'ARCHIVED' : 'ACTIVE'
  return {
    id: String(raw.id),
    name: raw.name || undefined,
    customerDefinedCode: raw.number || undefined,
    status,
    currency: (raw.currencyCode as string) || undefined,
    balance: raw.balance ?? undefined,
    parentId: raw.categoryId != null ? String(raw.categoryId) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
