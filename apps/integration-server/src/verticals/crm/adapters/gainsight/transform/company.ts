/**
 * Transform Gainsight Company object <-> canonical Company.
 *
 * Gainsight Company fields (PascalCase, snake__gc for custom):
 *   Gsid, Name (required), Industry, Stage, Status, ARR, Employees,
 *   OriginalContractDate, RenewalDate, ExternalRecordID__gc
 *
 * Docs: https://support.gainsight.com/gainsight_nxt/API_and_Developer_Docs/Company_and_Relationship_API/Company_API_Documentation
 */
import { toIsoDatetime } from '@opensteward/shared'
import type { Company } from '../../../schema/company'

export interface RawGainsightCompany {
  Gsid?: string
  Name?: string
  Industry?: string
  Stage?: string
  Status?: string
  Employees?: number
  Website?: string
  Phone?: string
  ExternalRecordID__gc?: string
  /** ISO date strings */
  CreatedDate?: string
  ModifiedDate?: string
  [key: string]: unknown
}

export function transformCompany(raw: RawGainsightCompany): Company {
  return {
    id: String(raw.Gsid ?? raw.ExternalRecordID__gc ?? raw.Name ?? ''),
    name: raw.Name ?? '',
    industry: raw.Industry ?? undefined,
    size: typeof raw.Employees === 'number' ? raw.Employees : undefined,
    phone: raw.Phone ?? undefined,
    created_at: toIsoDatetime(raw.CreatedDate),
    updated_at: toIsoDatetime(raw.ModifiedDate),
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformCompany(
  data: Partial<Company>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.name !== undefined) out.Name = data.name
  if (data.industry !== undefined) out.Industry = data.industry
  if (data.size !== undefined) out.Employees = data.size
  if (data.phone !== undefined) out.Phone = data.phone
  return out
}
