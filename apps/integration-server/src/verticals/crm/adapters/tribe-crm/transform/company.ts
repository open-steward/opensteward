/**
 * Transform between Tribe CRM Organisation records and the canonical
 * CRM Company schema.
 *
 * Tribe CRM wire fields (PascalCase):
 *   Id           — unique identifier
 *   Name         — organisation display name
 *   Domain       — primary web domain
 *   PhoneNumber  — main phone number
 *   OwnerId      — CRM user responsible for this record
 *   CreatedOn    — ISO-8601 creation timestamp
 *   ModifiedOn   — ISO-8601 last-modified timestamp
 */
import type { Company } from '../../../schema/company'

export interface RawTribeCrmOrganisation {
  Id: string | number
  Name?: string
  Domain?: string
  PhoneNumber?: string
  OwnerId?: string | number | null
  CreatedOn?: string
  ModifiedOn?: string
  [key: string]: unknown
}

export function transformCompany(raw: RawTribeCrmOrganisation): Company {
  return {
    id: String(raw.Id),
    name: raw.Name ?? '',
    domain: raw.Domain ?? undefined,
    phone: raw.PhoneNumber ?? undefined,
    owner_id: raw.OwnerId != null ? String(raw.OwnerId) : undefined,
    created_at: raw.CreatedOn ?? undefined,
    updated_at: raw.ModifiedOn ?? undefined,
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformCompany(data: Partial<Company>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.name !== undefined) out.Name = data.name
  if (data.domain !== undefined) out.Domain = data.domain
  if (data.phone !== undefined) out.PhoneNumber = data.phone
  if (data.owner_id !== undefined) out.OwnerId = data.owner_id
  return out
}
