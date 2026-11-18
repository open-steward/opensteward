import type { Company } from '../../../schema/company'
import type { RagicRecord } from '../client'

// NOTE: Ragic field names are user-configured per sheet.
// The field names below are common defaults for a companies sheet.
const FIELDS = {
  name: 'Company Name',
  domain: 'Website',
  phone: 'Phone',
  industry: 'Industry',
  ownerId: 'Owner ID',
  createdAt: 'Created Date',
  updatedAt: 'Updated Date',
} as const

function fieldValue(raw: RagicRecord, field: string): string | undefined {
  const v = raw[field]
  if (v == null || v === '') return undefined
  return String(v)
}

export function transformCompany(raw: RagicRecord): Company {
  return {
    id: raw._ragic_id != null ? String(raw._ragic_id) : '',
    name: fieldValue(raw, FIELDS.name) ?? '',
    domain: fieldValue(raw, FIELDS.domain),
    phone: fieldValue(raw, FIELDS.phone),
    industry: fieldValue(raw, FIELDS.industry),
    owner_id: fieldValue(raw, FIELDS.ownerId),
    created_at: fieldValue(raw, FIELDS.createdAt),
    updated_at: fieldValue(raw, FIELDS.updatedAt),
    metadata: raw,
  }
}

export function untransformCompany(data: Partial<Company>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  // TODO: field names must match the user's Ragic companies sheet configuration
  if (data.name !== undefined) out[FIELDS.name] = data.name
  if (data.domain !== undefined) out[FIELDS.domain] = data.domain
  if (data.phone !== undefined) out[FIELDS.phone] = data.phone
  if (data.industry !== undefined) out[FIELDS.industry] = data.industry
  if (data.owner_id !== undefined) out[FIELDS.ownerId] = data.owner_id
  return out
}
