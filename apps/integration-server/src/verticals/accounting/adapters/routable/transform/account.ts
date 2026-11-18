/**
 * Transform Routable Account → canonical Account.
 *
 * In Routable, an "account" is a funding source (bank account or balance
 * account) used to send and receive money. These are not a chart of accounts;
 * they map to the canonical Account type as ASSET funding accounts.
 *
 * Endpoint: GET /v1/settings/accounts
 * Endpoint: GET /v1/settings/accounts/{id}
 *
 * Docs: https://developers.routable.com/docs/accounts
 */
import type { Account, AccountType } from '../../../schema/account'

// ── Routable types ────────────────────────────────────────────────────────────

export interface RoutableAccount {
  id: string
  name?: string
  type?: string          // bank | balance
  status?: string        // active | archived
  currency?: string
  type_details?: {
    available_amount?: string | number
    [key: string]: unknown
  }
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function mapType(_type?: string): AccountType {
  // All Routable accounts are funding sources — they are assets
  return 'ASSET'
}

function mapStatus(status?: string): 'ACTIVE' | 'ARCHIVED' {
  return status === 'archived' ? 'ARCHIVED' : 'ACTIVE'
}

function parseAmount(val?: string | number | null): number | undefined {
  if (val === undefined || val === null) return undefined
  const n = typeof val === 'number' ? val : parseFloat(val as string)
  return isNaN(n) ? undefined : Math.round(n * 100)
}

// ── Transform ─────────────────────────────────────────────────────────────────

export function transformAccount(raw: RoutableAccount): Account {
  return {
    id: raw.id,
    name: raw.name || undefined,
    type: mapType(raw.type),
    status: mapStatus(raw.status),
    currency: raw.currency || undefined,
    balance: parseAmount(raw.type_details?.available_amount),
    createdAt: raw.created_at ? new Date(raw.created_at) : undefined,
    updatedAt: raw.updated_at ? new Date(raw.updated_at) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
