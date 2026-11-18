import type { Account, AccountStatus } from '../../../schema/account'

// ── Moss ExpenseAccount ───────────────────────────────────────────────────────

export interface MossExpenseAccount {
  id: string
  organisationId: string
  name: string
  code?: string | null
  status: string
  createTime: string
  updateTime: string
  [key: string]: unknown
}

// ── Transform ─────────────────────────────────────────────────────────────────

export function transformExpenseAccount(raw: MossExpenseAccount): Account {
  const status: AccountStatus = raw.status === 'ACTIVE' ? 'ACTIVE' : 'ARCHIVED'
  return {
    id: raw.id,
    name: raw.name || undefined,
    customerDefinedCode: raw.code || undefined,
    type: 'EXPENSE',
    status,
    createdAt: raw.createTime ? new Date(raw.createTime) : undefined,
    updatedAt: raw.updateTime ? new Date(raw.updateTime) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
