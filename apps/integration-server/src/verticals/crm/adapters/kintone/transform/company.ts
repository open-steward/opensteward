import type { Company } from '../../../schema/company'
import type { KintoneRecord } from '../client'

// NOTE: Kintone field codes are user-configured per app.
// The field codes below are common defaults — they must match
// the actual field codes in the user's Kintone companies app.
const FIELD_CODES = {
  name: 'company_name',      // Text field for company name
  domain: 'website',         // Text field for website/domain
  phone: 'phone',            // Text field for phone
  industry: 'industry',      // Text field for industry
  ownerId: 'owner_id',       // Text/Number field for owner
  createdAt: '作成日時',      // Kintone built-in creation datetime
  updatedAt: '更新日時',      // Kintone built-in update datetime
} as const

function fieldValue(raw: KintoneRecord, code: string): string | undefined {
  const v = raw[code]?.value
  if (v == null || v === '') return undefined
  return String(v)
}

export function transformCompany(raw: KintoneRecord): Company {
  return {
    id: raw.$id?.value,
    name: fieldValue(raw, FIELD_CODES.name) ?? '',
    domain: fieldValue(raw, FIELD_CODES.domain),
    phone: fieldValue(raw, FIELD_CODES.phone),
    industry: fieldValue(raw, FIELD_CODES.industry),
    owner_id: fieldValue(raw, FIELD_CODES.ownerId),
    created_at: fieldValue(raw, FIELD_CODES.createdAt),
    updated_at: fieldValue(raw, FIELD_CODES.updatedAt),
    metadata: raw,
  }
}

export function untransformCompany(data: Partial<Company>): Record<string, { value: unknown }> {
  const out: Record<string, { value: unknown }> = {}
  // TODO: field codes must match the user's Kintone companies app configuration
  if (data.name !== undefined) out[FIELD_CODES.name] = { value: data.name }
  if (data.domain !== undefined) out[FIELD_CODES.domain] = { value: data.domain }
  if (data.phone !== undefined) out[FIELD_CODES.phone] = { value: data.phone }
  if (data.industry !== undefined) out[FIELD_CODES.industry] = { value: data.industry }
  if (data.owner_id !== undefined) out[FIELD_CODES.ownerId] = { value: data.owner_id }
  return out
}
