import type { Account, AccountStatus, AccountType } from '../../../schema/account'

// ── Tyms wire type ─────────────────────────────────────────────────────────────

export interface TymsAccount {
  uuid: string
  name?: string
  code?: string
  description?: string
  type?: string      // e.g. "Asset", "Liability", "Equity", "Income", "Expense"
  sub_type?: string
  balance?: number
  currency?: string
  is_active?: boolean
  active?: boolean
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

// ── Type mapping ───────────────────────────────────────────────────────────────

function mapAccountType(raw: string | undefined): AccountType | undefined {
  if (!raw) return undefined
  const t = raw.toLowerCase()
  if (t === 'asset' || t === 'assets') return 'ASSET'
  if (t === 'liability' || t === 'liabilities') return 'LIABILITY'
  if (t === 'equity') return 'EQUITY'
  if (t === 'income' || t === 'revenue') return 'INCOME'
  if (t === 'expense' || t === 'expenses') return 'EXPENSE'
  return 'OTHER'
}

// ── Public transform ───────────────────────────────────────────────────────────

export function transformAccount(raw: TymsAccount): Account {
  const isActive = raw.is_active ?? raw.active ?? true
  const status: AccountStatus = isActive ? 'ACTIVE' : 'ARCHIVED'

  return {
    id: raw.uuid,
    name: raw.name || undefined,
    description: raw.description || undefined,
    customerDefinedCode: raw.code || undefined,
    type: mapAccountType(raw.type),
    status,
    group: raw.sub_type || undefined,
    balance: raw.balance ?? undefined,
    createdAt: raw.created_at ? new Date(raw.created_at) : undefined,
    updatedAt: raw.updated_at ? new Date(raw.updated_at) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
