import { toIsoDatetime } from '@opensteward/shared'
import type { Contact } from '../../../schema/contact'

/**
 * Raw Manatal candidate object from GET /candidates/ or GET /candidates/{id}/.
 * Manatal represents CRM contacts as "candidates" (applicants/prospects).
 */
export interface RawManatalCandidate {
  id: number
  full_name?: string
  email?: string
  phone_number?: string
  current_company?: string
  current_position?: string
  current_department?: string
  gender?: string
  birth_date?: string
  address?: string
  description?: string
  external_id?: string
  owner?: number | null
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

export function transformContact(raw: RawManatalCandidate): Contact {
  const fullName = raw.full_name?.trim() || undefined
  // Manatal stores a single full_name field — split on first space for first/last.
  let firstName: string | undefined
  let lastName: string | undefined
  if (fullName) {
    const idx = fullName.indexOf(' ')
    if (idx === -1) {
      firstName = fullName
    } else {
      firstName = fullName.slice(0, idx)
      lastName = fullName.slice(idx + 1)
    }
  }

  return {
    id: String(raw.id),
    first_name: firstName,
    last_name: lastName,
    name: fullName,
    email: raw.email ?? undefined,
    phone: raw.phone_number ?? undefined,
    title: raw.current_position ?? undefined,
    owner_id: raw.owner != null ? String(raw.owner) : undefined,
    created_at: toIsoDatetime(raw.created_at),
    updated_at: toIsoDatetime(raw.updated_at),
    metadata: raw as unknown as Record<string, unknown>,
  }
}

export function untransformContact(data: Partial<Contact>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  // Manatal expects full_name as a single string
  if (data.name !== undefined) {
    out.full_name = data.name
  } else if (data.first_name !== undefined || data.last_name !== undefined) {
    out.full_name = [data.first_name, data.last_name].filter(Boolean).join(' ')
  }
  if (data.email !== undefined) out.email = data.email
  if (data.phone !== undefined) out.phone_number = data.phone
  if (data.title !== undefined) out.current_position = data.title
  if (data.owner_id !== undefined) out.owner = data.owner_id ? Number(data.owner_id) : null
  return out
}
