import type { Contact } from '../../../schema/contact'
import type { KintoneRecord } from '../client'

// NOTE: Kintone field codes are user-configured per app.
// The field codes below are common defaults — they must match
// the actual field codes in the user's Kintone contacts app.
// Adjust FIELD_CODES to match your app configuration.
const FIELD_CODES = {
  firstName: 'first_name',   // Text field for first name
  lastName: 'last_name',     // Text field for last name
  name: 'name',              // Text field for full name (fallback)
  email: 'email',            // Text field for email
  phone: 'phone',            // Text field for phone
  mobile: 'mobile',          // Text field for mobile
  companyId: 'company_id',   // Text/Number field linking to company app record
  ownerId: 'owner_id',       // Text/Number field for owner
  title: 'title',            // Text field for job title
  createdAt: '作成日時',      // Kintone built-in creation datetime (Japanese)
  updatedAt: '更新日時',      // Kintone built-in update datetime (Japanese)
} as const

function fieldValue(raw: KintoneRecord, code: string): string | undefined {
  const v = raw[code]?.value
  if (v == null || v === '') return undefined
  return String(v)
}

export function transformContact(raw: KintoneRecord): Contact {
  const id = raw.$id?.value
  const firstName = fieldValue(raw, FIELD_CODES.firstName)
  const lastName = fieldValue(raw, FIELD_CODES.lastName)
  const fullName = fieldValue(raw, FIELD_CODES.name)
  const name = fullName ?? ([firstName, lastName].filter(Boolean).join(' ') || undefined)
  const companyIdRaw = fieldValue(raw, FIELD_CODES.companyId)

  return {
    id,
    first_name: firstName,
    last_name: lastName,
    name,
    email: fieldValue(raw, FIELD_CODES.email),
    phone: fieldValue(raw, FIELD_CODES.phone),
    mobile: fieldValue(raw, FIELD_CODES.mobile),
    title: fieldValue(raw, FIELD_CODES.title),
    company_id: companyIdRaw != null ? String(companyIdRaw) : undefined,
    owner_id: fieldValue(raw, FIELD_CODES.ownerId),
    created_at: fieldValue(raw, FIELD_CODES.createdAt),
    updated_at: fieldValue(raw, FIELD_CODES.updatedAt),
    metadata: raw,
  }
}

export function untransformContact(data: Partial<Contact>): Record<string, { value: unknown }> {
  const out: Record<string, { value: unknown }> = {}
  // TODO: field codes must match the user's Kintone contacts app configuration
  if (data.first_name !== undefined) out[FIELD_CODES.firstName] = { value: data.first_name }
  if (data.last_name !== undefined) out[FIELD_CODES.lastName] = { value: data.last_name }
  if (data.name !== undefined) out[FIELD_CODES.name] = { value: data.name }
  if (data.email !== undefined) out[FIELD_CODES.email] = { value: data.email }
  if (data.phone !== undefined) out[FIELD_CODES.phone] = { value: data.phone }
  if (data.mobile !== undefined) out[FIELD_CODES.mobile] = { value: data.mobile }
  if (data.title !== undefined) out[FIELD_CODES.title] = { value: data.title }
  if (data.company_id !== undefined) out[FIELD_CODES.companyId] = { value: data.company_id }
  if (data.owner_id !== undefined) out[FIELD_CODES.ownerId] = { value: data.owner_id }
  return out
}
