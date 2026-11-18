import type { Contact } from '../../../schema/contact'

export interface RawCreatioContact {
  Id: string
  FirstName?: string
  LastName?: string
  Email?: string
  Phone?: string
  JobTitle?: string
  AccountId?: string | null
  OwnerId?: string | null
  [key: string]: unknown
}

export function transformContact(raw: RawCreatioContact): Contact {
  return {
    id: String(raw.Id),
    first_name: raw.FirstName,
    last_name: raw.LastName,
    name: [raw.FirstName, raw.LastName].filter(Boolean).join(' ') || undefined,
    email: raw.Email,
    phone: raw.Phone,
    title: raw.JobTitle,
    company_id: raw.AccountId ?? undefined,
    owner_id: raw.OwnerId ?? undefined,
    metadata: raw,
  }
}

export function untransformContact(data: Partial<Contact>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.first_name !== undefined) out.FirstName = data.first_name
  if (data.last_name !== undefined) out.LastName = data.last_name
  if (data.email !== undefined) out.Email = data.email
  if (data.phone !== undefined) out.Phone = data.phone
  if (data.title !== undefined) out.JobTitle = data.title
  if (data.company_id !== undefined) out.AccountId = data.company_id
  if (data.owner_id !== undefined) out.OwnerId = data.owner_id
  return out
}
