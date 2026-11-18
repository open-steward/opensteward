import type { Organization } from '../../../schema/organization'

// ── Puzzle wire types ─────────────────────────────────────────────────────────

export interface PuzzleCompany {
  id: string
  name: string
  connectedAt?: string
  status?: string    // Ready | Syncing | NoData
  financialYearStartDate?: string
  reportingCurrency?: string
  [key: string]: unknown
}

// ── Transform ─────────────────────────────────────────────────────────────────

export function transformOrganization(raw: PuzzleCompany): Organization {
  // Derive fiscalYearEndMonth from financialYearStartDate (e.g. "2024-01-01" → start month 1 → end month 12)
  let fiscalYearEndMonth: number | undefined
  if (raw.financialYearStartDate) {
    const startMonth = new Date(raw.financialYearStartDate).getUTCMonth() + 1 // 1-12
    // End month = month before start month (wrapping)
    fiscalYearEndMonth = startMonth === 1 ? 12 : startMonth - 1
  }

  return {
    id: raw.id,
    name: raw.name || undefined,
    currency: raw.reportingCurrency || undefined,
    fiscalYearEndMonth,
    metadata: raw as Record<string, unknown>,
  }
}
