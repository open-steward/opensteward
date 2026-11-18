import type { Contact } from '../../../schema/contact'

// Mautic Contact (Lead) entity
export interface RawMauticContact {
  id?: string | number
  fields?: {
    all?: Record<string, unknown>
    core?: Record<string, unknown>
  }
  // Flattened fields when returned directly
  firstname?: string
  lastname?: string
  email?: string
  phone?: string
  mobile?: string
  company?: string
  owner?: { id?: string | number } | null
  dateAdded?: string
  dateModified?: string
  [key: string]: unknown
}

function getField(raw: RawMauticContact, key: string): string | undefined {
  // Try flattened first, then nested fields
  const flat = raw[key]
  if (flat !== undefined && flat !== null) return String(flat)
  const all = raw.fields?.all
  if (all && all[key] !== undefined && all[key] !== null) return String(all[key])
  const core = raw.fields?.core
  if (core && core[key] !== undefined && core[key] !== null) return String(core[key])
  return undefined
}

export function transformContact(raw: RawMauticContact): Contact {
  const firstName = getField(raw, 'firstname')
  const lastName = getField(raw, 'lastname')
  return {
    id: String(raw.id ?? ''),
    first_name: firstName,
    last_name: lastName,
    name: [firstName, lastName].filter(Boolean).join(' ') || undefined,
    email: getField(raw, 'email'),
    phone: getField(raw, 'phone'),
    mobile: getField(raw, 'mobile'),
    owner_id: raw.owner?.id != null ? String(raw.owner.id) : undefined,
    created_at: raw.dateAdded,
    updated_at: raw.dateModified,
    metadata: raw,
  }
}

export function untransformContact(data: Partial<Contact>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.first_name !== undefined) out.firstname = data.first_name
  if (data.last_name !== undefined) out.lastname = data.last_name
  if (data.email !== undefined) out.email = data.email
  if (data.phone !== undefined) out.phone = data.phone
  if (data.mobile !== undefined) out.mobile = data.mobile
  return out
}
