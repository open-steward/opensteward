/**
 * MRI Software — Ledger Account transform.
 *
 * MRI refers to chart-of-accounts entries as "Ledger Accounts".
 * The `accountType` field uses MRI's own vocabulary which is mapped
 * to the canonical AccountType.
 */

import type { Account, AccountType } from '../../../schema/account'

export interface MriAccount {
  id: string
  code?: string
  name?: string
  description?: string
  accountType?: string
  subType?: string
  currencyCode?: string
  isActive?: boolean
  parentId?: string
  balance?: number
  createdAt?: string
  updatedAt?: string
  [key: string]: unknown
}

const MRI_ACCOUNT_TYPE_MAP: Record<string, AccountType> = {
  // Asset variants
  asset: 'ASSET',
  'current asset': 'ASSET',
  'fixed asset': 'ASSET',
  'other asset': 'ASSET',
  cash: 'ASSET',
  'accounts receivable': 'ASSET',
  'bank': 'ASSET',
  // Liability variants
  liability: 'LIABILITY',
  'current liability': 'LIABILITY',
  'long-term liability': 'LIABILITY',
  'accounts payable': 'LIABILITY',
  'credit card': 'LIABILITY',
  // Equity
  equity: 'EQUITY',
  'retained earnings': 'EQUITY',
  // Income / Revenue
  income: 'INCOME',
  revenue: 'INCOME',
  'other income': 'INCOME',
  // Expense
  expense: 'EXPENSE',
  'cost of goods sold': 'EXPENSE',
  'other expense': 'EXPENSE',
}

function mapAccountType(raw?: string): AccountType {
  if (!raw) return 'OTHER'
  return MRI_ACCOUNT_TYPE_MAP[raw.toLowerCase()] ?? 'OTHER'
}

export function transformAccount(raw: MriAccount): Account {
  return {
    id: raw.id,
    customerDefinedCode: raw.code || undefined,
    name: raw.name || undefined,
    description: raw.description || undefined,
    type: mapAccountType(raw.accountType),
    status: raw.isActive === false ? 'ARCHIVED' : 'ACTIVE',
    currency: raw.currencyCode || undefined,
    parentId: raw.parentId || undefined,
    balance: raw.balance,
    createdAt: raw.createdAt ? new Date(raw.createdAt) : undefined,
    updatedAt: raw.updatedAt ? new Date(raw.updatedAt) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
