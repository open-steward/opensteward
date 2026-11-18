/**
 * LEDGERS.Cloud chart-of-accounts transform.
 *
 * Endpoint: GET /v3/list-chart-of-accounts
 *
 * LEDGERS uses standard accounting account type names.
 * Wire fields: id, name, account_type, account_code, description,
 *              balance, currency, is_active / status
 */

import type { Account, AccountType } from '../../../schema/account'

export interface LedgersAccount {
  id?: string | number
  name?: string
  account_name?: string
  account_type?: string         // "Asset" | "Liability" | "Equity" | "Income" | "Expense"
  account_code?: string
  code?: string
  description?: string
  balance?: number
  current_balance?: number
  currency?: string
  is_active?: boolean
  status?: string               // "active" | "inactive"
  parent_id?: string | number
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

const LEDGERS_TYPE_MAP: Record<string, AccountType> = {
  asset: 'ASSET',
  assets: 'ASSET',
  bank: 'ASSET',
  liability: 'LIABILITY',
  liabilities: 'LIABILITY',
  equity: 'EQUITY',
  capital: 'EQUITY',
  income: 'INCOME',
  revenue: 'INCOME',
  sales: 'INCOME',
  expense: 'EXPENSE',
  expenses: 'EXPENSE',
  cost: 'EXPENSE',
}

function mapAccountType(raw: string | undefined): AccountType {
  if (!raw) return 'OTHER'
  return LEDGERS_TYPE_MAP[raw.toLowerCase()] ?? 'OTHER'
}

export function transformAccount(raw: LedgersAccount): Account {
  const isActive =
    raw.is_active ?? (raw.status ? raw.status.toLowerCase() === 'active' : undefined)
  return {
    id: raw.id != null ? String(raw.id) : undefined,
    name: raw.name || raw.account_name || undefined,
    description: raw.description || undefined,
    customerDefinedCode: raw.account_code || raw.code || undefined,
    type: mapAccountType(raw.account_type),
    status: isActive === false ? 'ARCHIVED' : 'ACTIVE',
    balance: raw.balance ?? raw.current_balance,
    currency: raw.currency || undefined,
    parentId: raw.parent_id != null ? String(raw.parent_id) : undefined,
    createdAt: raw.created_at ? new Date(raw.created_at) : undefined,
    updatedAt: raw.updated_at ? new Date(raw.updated_at) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
