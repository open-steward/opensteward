/**
 * KLARA account (Konto) transform.
 *
 * KLARA uses the Swiss KMU chart-of-accounts with numeric codes.
 * account_type values: "asset" | "liability" | "equity" | "income" | "expense"
 */

import type { Account, AccountType } from '../../../schema/account'

export interface KlaraAccount {
  id: string
  account_number?: string
  name?: string
  description?: string
  account_type?: string   // asset | liability | equity | income | expense
  is_active?: boolean
  balance?: number
  currency?: string
  parent_id?: string
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

function mapAccountType(raw: string | undefined): AccountType {
  switch ((raw ?? '').toLowerCase()) {
    case 'asset':
    case 'assets':
      return 'ASSET'
    case 'liability':
    case 'liabilities':
      return 'LIABILITY'
    case 'equity':
      return 'EQUITY'
    case 'income':
    case 'revenue':
      return 'INCOME'
    case 'expense':
    case 'expenses':
      return 'EXPENSE'
    default:
      return 'OTHER'
  }
}

export function transformAccount(raw: KlaraAccount): Account {
  return {
    id: raw.id || undefined,
    name: raw.name || undefined,
    description: raw.description || undefined,
    customerDefinedCode: raw.account_number || undefined,
    type: mapAccountType(raw.account_type),
    status: raw.is_active === false ? 'ARCHIVED' : 'ACTIVE',
    balance: raw.balance,
    currency: raw.currency || undefined,
    parentId: raw.parent_id || undefined,
    createdAt: raw.created_at ? new Date(raw.created_at) : undefined,
    updatedAt: raw.updated_at ? new Date(raw.updated_at) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
