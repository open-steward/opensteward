/**
 * JobDiva client company → canonical Company transform.
 *
 * In JobDiva, "clients" are the companies that hire through the staffing
 * agency. These map directly to canonical Company records.
 *
 * Wire field names come from the JobDiva /getClientDetails and
 * /getNewClientRecords endpoints.
 */
import { toIsoDatetime } from '@opensteward/shared'
import type { Company } from '../../../schema/company'

export interface RawJobdivaClient {
  /** Internal JobDiva client/company ID. */
  clientid?: string | number
  companyid?: string | number
  id?: string | number
  /** Company name. */
  companyname?: string
  name?: string
  /** Primary web domain. */
  website?: string
  domain?: string
  /** Main phone number. */
  phone?: string
  /** Industry / sector. */
  industry?: string
  /** Number of employees. */
  numberofemployees?: number
  /** Record owner ID. */
  ownerid?: string | number
  createdat?: string
  modifiedat?: string
  [key: string]: unknown
}

/** Convert a raw JobDiva client company record to a canonical Company. Never throws. */
export function transformCompany(raw: RawJobdivaClient): Company {
  const id = raw.clientid ?? raw.companyid ?? raw.id
  return {
    id: String(id ?? ''),
    name: raw.companyname ?? raw.name ?? '',
    domain: raw.website ?? raw.domain ?? undefined,
    phone: raw.phone ?? undefined,
    industry: raw.industry ?? undefined,
    size: raw.numberofemployees ?? undefined,
    owner_id: raw.ownerid != null ? String(raw.ownerid) : undefined,
    created_at: toIsoDatetime(raw.createdat),
    updated_at: toIsoDatetime(raw.modifiedat),
    metadata: raw,
  }
}

/** Convert a partial canonical Company to a JobDiva client creation request body. */
export function untransformCompany(data: Partial<Company>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.name !== undefined) out.companyname = data.name
  if (data.domain !== undefined) out.website = data.domain
  if (data.phone !== undefined) out.phone = data.phone
  if (data.industry !== undefined) out.industry = data.industry
  if (data.size !== undefined) out.numberofemployees = data.size
  return out
}
