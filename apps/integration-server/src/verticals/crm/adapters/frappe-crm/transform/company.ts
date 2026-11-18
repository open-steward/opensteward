/**
 * Transform Frappe CRM Organization → canonical Company.
 *
 * Frappe CRM stores companies as "CRM Organization" documents:
 *   name               — Frappe doc name
 *   organization_name  — display name
 *   website            — primary website
 *   no_of_employees    — Select: "1-10" | "11-50" | … (string band)
 *   annual_revenue     — currency
 *   industry           — linked CRM Industry
 *   territory          — linked CRM Territory
 *   currency           — linked Currency
 *   creation           — ISO datetime
 *   modified           — ISO datetime
 */

import { toIsoDatetime } from '@opensteward/shared'
import type { Company } from '../../../schema/company'

export interface RawFrappeOrganization {
  name: string
  organization_name?: string
  website?: string
  no_of_employees?: string
  annual_revenue?: number | string
  industry?: string
  territory?: string
  currency?: string
  creation?: string
  modified?: string
  [key: string]: unknown
}

/** Parse the lower bound from a band like "51-200" → 51. */
function parseSizeBand(band?: string): number | undefined {
  if (!band) return undefined
  const match = /^(\d+)/.exec(band)
  if (!match) return undefined
  const n = parseInt(match[1], 10)
  return isNaN(n) ? undefined : n
}

export function transformCompany(raw: RawFrappeOrganization): Company {
  return {
    id: String(raw.name),
    name: raw.organization_name ?? String(raw.name),
    domain: raw.website ?? undefined,
    industry: raw.industry ?? undefined,
    size: parseSizeBand(raw.no_of_employees),
    created_at: toIsoDatetime(raw.creation),
    updated_at: toIsoDatetime(raw.modified),
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformCompany(data: Partial<Company>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.name !== undefined) out.organization_name = data.name
  if (data.domain !== undefined) out.website = data.domain
  if (data.industry !== undefined) out.industry = data.industry
  return out
}
