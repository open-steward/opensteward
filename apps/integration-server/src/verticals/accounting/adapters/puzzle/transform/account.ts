import type { Account, AccountType } from '../../../schema/account'
import type { PuzzleMoney } from './invoice'

// ── Puzzle wire types ─────────────────────────────────────────────────────────

export interface PuzzleAccountBalances {
  currentBalance?: PuzzleMoney
  currentBalanceWithoutSubAccounts?: PuzzleMoney
}

export interface PuzzleAccount {
  id: string
  displayId?: string
  displayName?: string
  description?: string
  type: string    // asset | liability | equity | revenue | expense | contra_asset | contra_liability | contra_equity | contra_revenue | contra_expense | gain_or_loss
  category?: string
  subCategory?: string
  parentDisplayId?: string
  hidden?: boolean
  systemOwned?: boolean
  balances?: PuzzleAccountBalances
  isBankAccount?: boolean
  permaId?: string
  [key: string]: unknown
}

// ── Type mapping ──────────────────────────────────────────────────────────────

const PUZZLE_TYPE_MAP: Record<string, AccountType> = {
  asset: 'ASSET',
  contra_asset: 'ASSET',
  liability: 'LIABILITY',
  contra_liability: 'LIABILITY',
  equity: 'EQUITY',
  contra_equity: 'EQUITY',
  revenue: 'INCOME',
  contra_revenue: 'INCOME',
  expense: 'EXPENSE',
  contra_expense: 'EXPENSE',
  gain_or_loss: 'OTHER',
}

// ── Transform ─────────────────────────────────────────────────────────────────

export function transformAccount(raw: PuzzleAccount): Account {
  const balanceStr = raw.balances?.currentBalance?.amount
  const balanceCents =
    balanceStr != null ? Math.round(parseFloat(balanceStr) * 100) : undefined

  return {
    id: raw.id,
    name: raw.displayName || undefined,
    description: raw.description || undefined,
    customerDefinedCode: raw.displayId || undefined,
    type: PUZZLE_TYPE_MAP[raw.type] ?? 'OTHER',
    status: raw.hidden ? 'ARCHIVED' : 'ACTIVE',
    parentId: raw.parentDisplayId || undefined,
    currency: raw.balances?.currentBalance?.currency || undefined,
    balance: balanceCents,
    metadata: raw as Record<string, unknown>,
  }
}
