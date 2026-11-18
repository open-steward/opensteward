import type { Company } from '../../../schema/company'

export interface RawInsightlyCompany {
  ORGANISATION_ID: number
  ORGANISATION_NAME: string
  WEBSITE?: string
  PHONE?: string
  OWNER_USER_ID?: number | null
  DATE_CREATED_UTC?: string
  DATE_UPDATED_UTC?: string
  [key: string]: unknown
}

function isoUtc(date?: string): string | undefined {
  if (!date) return undefined
  return date.endsWith('Z') ? date : `${date}Z`
}

export function transformCompany(raw: RawInsightlyCompany): Company {
  return {
    id: String(raw.ORGANISATION_ID),
    name: raw.ORGANISATION_NAME,
    domain: raw.WEBSITE,
    phone: raw.PHONE,
    owner_id: raw.OWNER_USER_ID != null ? String(raw.OWNER_USER_ID) : undefined,
    created_at: isoUtc(raw.DATE_CREATED_UTC),
    updated_at: isoUtc(raw.DATE_UPDATED_UTC),
    metadata: raw,
  }
}

export function untransformCompany(data: Partial<Company>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.name !== undefined) out.ORGANISATION_NAME = data.name
  if (data.domain !== undefined) out.WEBSITE = data.domain
  if (data.phone !== undefined) out.PHONE = data.phone
  if (data.owner_id !== undefined) out.OWNER_USER_ID = Number(data.owner_id)
  return out
}
