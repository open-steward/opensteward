import type { Account, AccountStatus, AccountType } from '../../../schema/account'

// ── Mezan wire types ──────────────────────────────────────────────────────────

export interface MezanAccount {
  id: string
  name: string
  description?: string
  code: string
  type?: string            // 'asset' | 'liability' | 'equity' | 'revenue' | 'expense'
  parent_id?: string
  accepts_transactions?: boolean
  is_archived?: boolean
  balance?: number
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

// ── Mapping helpers ───────────────────────────────────────────────────────────

function mapType(raw?: string): AccountType | undefined {
  if (!raw) return undefined
  const t = raw.toLowerCase()
  if (t === 'asset') return 'ASSET'
  if (t === 'liability') return 'LIABILITY'
  if (t === 'equity') return 'EQUITY'
  if (t === 'revenue') return 'INCOME'
  if (t === 'expense') return 'EXPENSE'
  return 'OTHER'
}

// ── Transform ─────────────────────────────────────────────────────────────────

export function transformAccount(raw: MezanAccount): Account {
  const status: AccountStatus = raw.is_archived ? 'ARCHIVED' : 'ACTIVE'
  return {
    id: String(raw.id),
    name: raw.name || undefined,
    description: raw.description || undefined,
    customerDefinedCode: raw.code || undefined,
    type: mapType(raw.type),
    status,
    parentId: raw.parent_id ? String(raw.parent_id) : undefined,
    balance: raw.balance,
    createdAt: raw.created_at ? new Date(raw.created_at) : undefined,
    updatedAt: raw.updated_at ? new Date(raw.updated_at) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
