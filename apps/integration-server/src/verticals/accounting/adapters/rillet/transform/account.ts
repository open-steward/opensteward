import type { Account, AccountType } from '../../../schema/account'

// ── Rillet API types ───────────────────────────────────────────────────────────

export interface RilletAccount {
  id: string
  code: string
  name: string
  type: string
  subtype: string
  status: string
  intercompany: boolean
  updated_at: string
  [key: string]: unknown
}

// ── Type mapping ───────────────────────────────────────────────────────────────

// Rillet uses the same canonical names as the AccountType schema:
// ASSET, LIABILITY, EQUITY, EXPENSE, INCOME
const RILLET_TYPE_MAP: Record<string, AccountType> = {
  ASSET: 'ASSET',
  LIABILITY: 'LIABILITY',
  EQUITY: 'EQUITY',
  EXPENSE: 'EXPENSE',
  INCOME: 'INCOME',
}

// ── Transform ──────────────────────────────────────────────────────────────────

export function transformAccount(raw: RilletAccount): Account {
  return {
    id: raw.id,
    name: raw.name || undefined,
    customerDefinedCode: raw.code || undefined,
    type: RILLET_TYPE_MAP[raw.type] ?? 'OTHER',
    subgroup: raw.subtype || undefined,
    status: raw.status === 'ACTIVE' ? 'ACTIVE' : 'ARCHIVED',
    updatedAt: raw.updated_at ? new Date(raw.updated_at) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
