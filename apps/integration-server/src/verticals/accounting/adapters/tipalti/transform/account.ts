/**
 * Tipalti GL account → canonical Account transform.
 *
 * Tipalti exposes chart-of-accounts / GL accounts for invoice line coding.
 * REST endpoint: GET /v1/gl-accounts
 *
 * Wire fields (snake_case):
 *   id, name, description, code, type, status, currency, externalId
 */

import type { Account, AccountType } from '../../../schema/account'

// ── Wire types ────────────────────────────────────────────────────────────────

export interface TipaltiGlAccount {
  id: string
  name?: string
  description?: string
  code?: string
  /** 'ASSET' | 'LIABILITY' | 'EQUITY' | 'REVENUE' | 'EXPENSE' */
  type?: string
  /** 'ACTIVE' | 'INACTIVE' */
  status?: string
  currency?: string
  externalId?: string
  createdAt?: string
  updatedAt?: string
  [key: string]: unknown
}

// ── Type mapping ──────────────────────────────────────────────────────────────

const TIPALTI_ACCOUNT_TYPE_MAP: Record<string, AccountType> = {
  ASSET: 'ASSET',
  LIABILITY: 'LIABILITY',
  EQUITY: 'EQUITY',
  REVENUE: 'INCOME',
  INCOME: 'INCOME',
  EXPENSE: 'EXPENSE',
  COST_OF_GOODS_SOLD: 'EXPENSE',
}

// ── Transform ─────────────────────────────────────────────────────────────────

export function transformAccount(raw: TipaltiGlAccount): Account {
  return {
    id: raw.id,
    name: raw.name || undefined,
    description: raw.description || undefined,
    customerDefinedCode: raw.code || undefined,
    type: raw.type ? (TIPALTI_ACCOUNT_TYPE_MAP[raw.type.toUpperCase()] ?? 'OTHER') : undefined,
    status: raw.status?.toUpperCase() === 'ACTIVE' ? 'ACTIVE' : 'ARCHIVED',
    currency: raw.currency || undefined,
    createdAt: raw.createdAt ? new Date(raw.createdAt) : undefined,
    updatedAt: raw.updatedAt ? new Date(raw.updatedAt) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
