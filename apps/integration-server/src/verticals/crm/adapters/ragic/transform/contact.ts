import type { Contact } from '../../../schema/contact'
import type { RagicRecord } from '../client'

// NOTE: Ragic field names are user-configured per sheet.
// The field names below are common defaults for a contacts sheet.
// They must match the actual column names in the user's Ragic contacts sheet.
const FIELDS = {
  firstName: 'First Name',
  lastName: 'Last Name',
  name: 'Name',
  email: 'Email',
  phone: 'Phone',
  mobile: 'Mobile',
  title: 'Title',
  companyId: 'Company ID',
  ownerId: 'Owner ID',
  createdAt: 'Created Date',
  updatedAt: 'Updated Date',
} as const

function fieldValue(raw: RagicRecord, field: string): string | undefined {
  const v = raw[field]
  if (v == null || v === '') return undefined
  return String(v)
}

export function transformContact(raw: RagicRecord): Contact {
  const id = raw._ragic_id != null ? String(raw._ragic_id) : ''
  const firstName = fieldValue(raw, FIELDS.firstName)
  const lastName = fieldValue(raw, FIELDS.lastName)
  const fullName = fieldValue(raw, FIELDS.name)
  const name = fullName ?? ([firstName, lastName].filter(Boolean).join(' ') || undefined)
  const companyIdRaw = fieldValue(raw, FIELDS.companyId)

  return {
    id,
    first_name: firstName,
    last_name: lastName,
    name,
    email: fieldValue(raw, FIELDS.email),
    phone: fieldValue(raw, FIELDS.phone),
    mobile: fieldValue(raw, FIELDS.mobile),
    title: fieldValue(raw, FIELDS.title),
    company_id: companyIdRaw != null ? String(companyIdRaw) : undefined,
    owner_id: fieldValue(raw, FIELDS.ownerId),
    created_at: fieldValue(raw, FIELDS.createdAt),
    updated_at: fieldValue(raw, FIELDS.updatedAt),
    metadata: raw,
  }
}

export function untransformContact(data: Partial<Contact>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  // TODO: field names must match the user's Ragic contacts sheet configuration
  if (data.first_name !== undefined) out[FIELDS.firstName] = data.first_name
  if (data.last_name !== undefined) out[FIELDS.lastName] = data.last_name
  if (data.name !== undefined) out[FIELDS.name] = data.name
  if (data.email !== undefined) out[FIELDS.email] = data.email
  if (data.phone !== undefined) out[FIELDS.phone] = data.phone
  if (data.mobile !== undefined) out[FIELDS.mobile] = data.mobile
  if (data.title !== undefined) out[FIELDS.title] = data.title
  if (data.company_id !== undefined) out[FIELDS.companyId] = data.company_id
  if (data.owner_id !== undefined) out[FIELDS.ownerId] = data.owner_id
  return out
}
