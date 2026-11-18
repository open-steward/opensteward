import type { Organization } from '../../../schema/organization'

// ── Rillet API types ───────────────────────────────────────────────────────────

export interface RilletOrganization {
  id: string
  currency: string
  timezone: string
  trade_name: string
  [key: string]: unknown
}

// ── Transform ──────────────────────────────────────────────────────────────────

export function transformOrganization(raw: RilletOrganization): Organization {
  return {
    id: raw.id,
    name: raw.trade_name || undefined,
    currency: raw.currency || undefined,
    timezone: raw.timezone || undefined,
    metadata: raw as Record<string, unknown>,
  }
}
