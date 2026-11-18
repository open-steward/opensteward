/**
 * Directo chart-of-accounts transform.
 *
 * Endpoint: GET /v1/accounts
 * Fields follow Directo snake_case convention.
 */
import type { Account, AccountStatus, AccountType } from '../../../schema/account'

// ── Directo wire type ─────────────────────────────────────────────────────────

export interface DirectoAccount {
  code?: string         // GL account code (e.g. "1000")
  name?: string         // account description / name
  type?: string         // account type code (A=asset, L=liability, E=expense, I=income, Q=equity)
  closed?: boolean | number  // 0/false=active, 1/true=closed
  vatcode?: string      // default VAT code
  class?: string        // account class grouping
  [key: string]: unknown
}

// ── Type mapping ──────────────────────────────────────────────────────────────

function mapAccountType(type?: string): AccountType | undefined {
  if (!type) return undefined
  switch (type.toUpperCase()) {
    case 'A': return 'ASSET'
    case 'L': return 'LIABILITY'
    case 'Q':
    case 'OE': return 'EQUITY'
    case 'I': return 'INCOME'
    case 'E': return 'EXPENSE'
    default: return 'OTHER'
  }
}

// ── Public transform ──────────────────────────────────────────────────────────

export function transformAccount(raw: DirectoAccount): Account {
  const status: AccountStatus = raw.closed ? 'ARCHIVED' : 'ACTIVE'
  return {
    id: raw.code || undefined,
    name: raw.name || undefined,
    customerDefinedCode: raw.code || undefined,
    type: mapAccountType(raw.type),
    status,
    group: raw.class || undefined,
    metadata: raw as Record<string, unknown>,
  }
}
