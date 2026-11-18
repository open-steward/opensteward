import type { Contact } from '../../../schema/contact'

export interface RawWorkbooksContact {
  id: string | number
  name?: string
  person_first_name?: string
  person_last_name?: string
  person_job_title?: string
  'main_location[email]'?: string
  'main_location[telephone]'?: string
  'main_location[mobile]'?: string
  assigned_to_id?: string | number
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

export function transformContact(raw: RawWorkbooksContact): Contact {
  const firstName = raw.person_first_name
  const lastName = raw.person_last_name
  const displayName = raw.name ?? (
    [firstName, lastName].filter(Boolean).join(' ') || undefined
  )
  return {
    id: String(raw.id),
    first_name: firstName,
    last_name: lastName,
    name: displayName,
    email: raw['main_location[email]'],
    phone: raw['main_location[telephone]'],
    mobile: raw['main_location[mobile]'],
    title: raw.person_job_title,
    owner_id: raw.assigned_to_id !== undefined ? String(raw.assigned_to_id) : undefined,
    created_at: raw.created_at,
    updated_at: raw.updated_at,
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformContact(data: Partial<Contact>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.first_name !== undefined) out['person_first_name'] = data.first_name
  if (data.last_name !== undefined) out['person_last_name'] = data.last_name
  if (data.email !== undefined) out['main_location[email]'] = data.email
  if (data.phone !== undefined) out['main_location[telephone]'] = data.phone
  if (data.mobile !== undefined) out['main_location[mobile]'] = data.mobile
  if (data.title !== undefined) out['person_job_title'] = data.title
  return out
}
