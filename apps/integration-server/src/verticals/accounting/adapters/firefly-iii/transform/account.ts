/**
 * Transforms a Firefly III AccountProperties (v1 API) into the canonical Account type.
 *
 * Firefly III account types:
 *   asset     → ASSET
 *   liability / liabilities → LIABILITY
 *   expense   → EXPENSE
 *   revenue   → INCOME
 *   cash      → ASSET
 *   reconciliation / initial-balance / import → OTHER
 */

import type { Account, AccountType } from '../../../schema/account'

// ── Firefly III raw type ────────────────────────────────────────────────────────

export interface FireflyAccountAttributes {
  created_at: string
  updated_at: string
  active: boolean
  order: number | null
  name: string
  type: string          // ShortAccountTypeProperty
  account_role: string | null
  currency_id: string
  currency_code: string
  currency_name: string
  current_balance: string
  current_balance_date: string | null
  iban: string | null
  bic: string | null
  account_number: string | null
  opening_balance: string
  opening_balance_date: string | null
  virtual_balance: string
  include_net_worth: boolean
  notes: string | null
  object_group_title: string | null
  [key: string]: unknown
}

export type FireflyAccountResource = {
  type: string
  id: string
  attributes: FireflyAccountAttributes
}

// ── Type map ───────────────────────────────────────────────────────────────────

const FIREFLY_TYPE_MAP: Record<string, AccountType> = {
  asset: 'ASSET',
  cash: 'ASSET',
  liability: 'LIABILITY',
  liabilities: 'LIABILITY',
  expense: 'EXPENSE',
  revenue: 'INCOME',
  'initial-balance': 'OTHER',
  reconciliation: 'OTHER',
  import: 'OTHER',
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Convert a Firefly III decimal string (e.g. '12.50') to integer minor units (e.g. 1250). */
function toMinorUnits(raw: unknown): number | undefined {
  if (typeof raw !== 'string' && typeof raw !== 'number') return undefined
  const parsed = parseFloat(String(raw))
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : undefined
}

// ── Transform ─────────────────────────────────────────────────────────────────

export function transformAccount(raw: FireflyAccountResource): Account {
  const attrs = raw.attributes

  return {
    id: raw.id,
    name: attrs.name || undefined,
    description: attrs.notes || undefined,
    customerDefinedCode: attrs.account_number || attrs.iban || undefined,
    type: FIREFLY_TYPE_MAP[attrs.type] ?? 'OTHER',
    status: attrs.active ? 'ACTIVE' : 'ARCHIVED',
    currency: attrs.currency_code || undefined,
    balance: toMinorUnits(attrs.current_balance),
    createdAt: attrs.created_at ? new Date(attrs.created_at) : undefined,
    updatedAt: attrs.updated_at ? new Date(attrs.updated_at) : undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}
