import type { Account, AccountStatus, AccountType } from '../../../schema/account'
import { toMinorUnits } from '../../shared/transform'

// ── Built Accounting raw type ─────────────────────────────────────────────────
// Account objects appear nested in bank-transfer responses and the chart-of-
// accounts list endpoint (/api/v3/accounts).

export interface BuiltAfricaAccount {
  id: number
  account_name?: string
  description?: string
  code?: string
  type_id?: number
  subtype_id?: number
  currency?: string
  archived?: boolean
  live_balance?: number
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

// ── Type mapping (type_id heuristic) ─────────────────────────────────────────
// Built uses numeric type_ids. Common mapping (not officially documented):
//   1 = Asset, 2 = Liability, 3 = Equity, 4 = Income, 5 = Expense

function mapType(typeId?: number): AccountType | undefined {
  switch (typeId) {
    case 1: return 'ASSET'
    case 2: return 'LIABILITY'
    case 3: return 'EQUITY'
    case 4: return 'INCOME'
    case 5: return 'EXPENSE'
    default: return undefined
  }
}

// ── Transform ─────────────────────────────────────────────────────────────────

export function transformAccount(raw: BuiltAfricaAccount): Account {
  const status: AccountStatus = raw.archived ? 'ARCHIVED' : 'ACTIVE'
  return {
    id: String(raw.id),
    name: raw.account_name || undefined,
    description: raw.description || undefined,
    customerDefinedCode: raw.code || undefined,
    type: mapType(raw.type_id),
    status,
    currency: raw.currency || undefined,
    // Built returns decimal amounts; canonical balance is integer minor units
    balance: toMinorUnits(raw.live_balance),
    createdAt: raw.created_at ? new Date(raw.created_at) : undefined,
    updatedAt: raw.updated_at ? new Date(raw.updated_at) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
