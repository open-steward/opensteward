/**
 * Transform Carerix CRCompany records to/from the canonical Company type.
 *
 * Carerix CRCompany field names (JSON API):
 *   companyID, id, name, phoneNumber, website, toVisitProvinceNode,
 *   numberOfEmployees, dateCreated, dateModified
 */

import type { Company } from '../../../schema/company'
import { toIsoDatetime } from '@opensteward/shared'

export interface RawCarerixCompany {
  /** Platform-assigned record ID. */
  companyID?: string | number
  /** May also appear as `id`. */
  id?: string | number
  /** Company display name. */
  name?: string
  /** Primary phone. */
  phoneNumber?: string
  /** Website URL (may include https://). Carerix does not always expose a bare domain. */
  website?: string
  /** Industry label — Carerix uses a DataNode (list value). */
  industry?: string | { name?: string; [key: string]: unknown } | null
  /** Number of employees (integer or string). */
  numberOfEmployees?: number | string
  /** ISO-8601 or Carerix date-string of record creation. */
  dateCreated?: string
  /** ISO-8601 or Carerix date-string of last modification. */
  dateModified?: string
  [key: string]: unknown
}

/** Extract bare domain from a URL string, e.g. "https://acme.example" -> "acme.example". */
function extractDomain(website: string | undefined): string | undefined {
  if (!website) return undefined
  try {
    const url = new URL(website.startsWith('http') ? website : `https://${website}`)
    return url.hostname || undefined
  } catch {
    return website
  }
}

function extractIndustry(
  raw: RawCarerixCompany['industry'],
): string | undefined {
  if (!raw) return undefined
  if (typeof raw === 'string') return raw || undefined
  return raw.name ?? undefined
}

export function transformCompany(raw: RawCarerixCompany): Company {
  const id = raw.companyID ?? raw.id
  const sizeRaw = raw.numberOfEmployees
  const size = sizeRaw != null ? parseInt(String(sizeRaw), 10) : undefined

  return {
    id: String(id ?? ''),
    name: raw.name ?? '',
    domain: extractDomain(raw.website),
    phone: raw.phoneNumber ?? undefined,
    industry: extractIndustry(raw.industry),
    size: size != null && !isNaN(size) ? size : undefined,
    created_at: toIsoDatetime(raw.dateCreated),
    updated_at: toIsoDatetime(raw.dateModified),
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformCompany(data: Partial<Company>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.name !== undefined) out.name = data.name
  if (data.domain !== undefined) out.website = data.domain
  if (data.phone !== undefined) out.phoneNumber = data.phone
  if (data.industry !== undefined) out.industry = data.industry
  if (data.size !== undefined) out.numberOfEmployees = data.size
  return out
}
