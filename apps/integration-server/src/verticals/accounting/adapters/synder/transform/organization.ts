/**
 * Transform Synder account/company responses to the canonical Organization type.
 *
 * Synder exposes two relevant resources:
 *   GET /account        — the Synder user account (subscription owner)
 *   GET /companies      — connected accounting systems (QuickBooks / Xero tenants)
 *
 * `transformAccount` maps the /account response (the Synder user profile) to
 * Organization — the Synder account is the top-level org that owns all connected
 * companies.
 *
 * `transformCompany` maps a single connected company entry to Organization, which
 * is useful when the caller wants the connected accounting-system org rather than
 * the Synder account itself.
 */

import type { Organization } from '../../../schema/organization'

// ── /account response ─────────────────────────────────────────────────────────

export interface SynderAccount {
  id: string
  email: string
  firstName: string
  lastName: string
  status: string
  companiesAmount: number
  successfulImports: number
  subscription: {
    plan: string | null
    active: boolean
  }
  [key: string]: unknown
}

// ── /companies list item ──────────────────────────────────────────────────────

export interface SynderCompany {
  id: string
  companyName: string
  provider: string        // 'intuit' | 'xero'
  status: string          // 'ACTIVE' | 'INACTIVE' | 'DISCONNECTED'
  companyAddress: string | null
  settings?: {
    dateFormat: string
    incrementDocNumber: boolean
    sendDocNumberToProvider: boolean
    createProducts: boolean
  }
  [key: string]: unknown
}

// ── Transforms ────────────────────────────────────────────────────────────────

/**
 * Map a Synder /account payload to Organization.
 * The account email is used as the organizational identifier.
 */
export function transformSynderAccount(raw: SynderAccount): Organization {
  return {
    id: raw.id || undefined,
    name: [raw.firstName, raw.lastName].filter(Boolean).join(' ') || undefined,
    metadata: raw as Record<string, unknown>,
  }
}

/**
 * Map a single Synder connected-company entry to Organization.
 * This represents the downstream accounting system (QuickBooks / Xero tenant).
 */
export function transformSynderCompany(raw: SynderCompany): Organization {
  return {
    id: raw.id || undefined,
    name: raw.companyName || undefined,
    metadata: raw as Record<string, unknown>,
  }
}
