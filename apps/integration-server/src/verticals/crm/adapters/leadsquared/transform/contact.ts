import type { Contact } from '../../../schema/contact'

export interface RawLeadsquaredContact {
  ProspectId: string
  FirstName?: string
  LastName?: string
  EmailAddress?: string
  Phone?: string
  CreatedOn?: string
  ModifiedOn?: string
  [key: string]: unknown
}

export function transformContact(raw: RawLeadsquaredContact): Contact {
  const nameParts = [raw.FirstName, raw.LastName].filter(Boolean)
  return {
    id: String(raw.ProspectId),
    first_name: raw.FirstName,
    last_name: raw.LastName,
    name: nameParts.length > 0 ? nameParts.join(' ') : undefined,
    email: raw.EmailAddress,
    phone: raw.Phone,
    created_at: raw.CreatedOn,
    updated_at: raw.ModifiedOn,
    metadata: raw,
  }
}

export function untransformContact(data: Partial<Contact>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.first_name !== undefined) out.FirstName = data.first_name
  if (data.last_name !== undefined) out.LastName = data.last_name
  if (data.email !== undefined) out.EmailAddress = data.email
  if (data.phone !== undefined) out.Phone = data.phone
  return out
}
