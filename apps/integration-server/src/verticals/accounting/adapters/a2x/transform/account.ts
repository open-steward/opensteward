/**
 * A2X Account → canonical Account transform.
 *
 * A2X exposes the chart-of-accounts codes used in a merchant's connected
 * accounting system (Xero, QuickBooks, etc.) as "accounts". These are the
 * mappings A2X uses to post settlement lines.
 *
 * A2X REST account shape:
 * {
 *   id:          number
 *   code:        string   (account code, e.g. "4000")
 *   name:        string
 *   type:        string   (e.g. "income", "expense", "asset", "liability", "equity")
 *   active:      boolean
 *   currency?:   string
 *   description?: string
 * }
 */

import type { Account, AccountType } from '../../../schema/account'

export interface A2xAccount {
  id: number
  code: string
  name: string
  type: string
  active: boolean
  currency?: string
  description?: string
  [key: string]: unknown
}

const A2X_TYPE_MAP: Record<string, AccountType> = {
  asset: 'ASSET',
  bank: 'ASSET',
  liability: 'LIABILITY',
  equity: 'EQUITY',
  income: 'INCOME',
  revenue: 'INCOME',
  expense: 'EXPENSE',
  cogs: 'EXPENSE',
}

export function transformAccount(raw: A2xAccount): Account {
  return {
    id: String(raw.id),
    name: raw.name || undefined,
    description: raw.description || undefined,
    customerDefinedCode: raw.code || undefined,
    type: A2X_TYPE_MAP[raw.type?.toLowerCase()] ?? 'OTHER',
    status: raw.active ? 'ACTIVE' : 'ARCHIVED',
    currency: raw.currency || undefined,
    metadata: raw as Record<string, unknown>,
  }
}
