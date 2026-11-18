import type { Contact } from '../../../schema/contact'

export interface RawSalesforceContact {
  Id: string
  FirstName?: string
  LastName?: string
  Email?: string
  Phone?: string
  Title?: string
  AccountId?: string | null
  OwnerId?: string | null
  CreatedDate?: string
  LastModifiedDate?: string
  [key: string]: unknown
}

export function transformContact(raw: RawSalesforceContact): Contact {
  return {
    id: String(raw.Id),
    first_name: raw.FirstName ?? undefined,
    last_name: raw.LastName ?? undefined,
    name: [raw.FirstName, raw.LastName].filter(Boolean).join(' ') || undefined,
    email: raw.Email ?? undefined,
    phone: raw.Phone ?? undefined,
    title: raw.Title ?? undefined,
    company_id: raw.AccountId ?? undefined,
    owner_id: raw.OwnerId ?? undefined,
    created_at: raw.CreatedDate ?? undefined,
    updated_at: raw.LastModifiedDate ?? undefined,
    metadata: raw,
  }
}

export function untransformContact(data: Partial<Contact>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.first_name !== undefined) out.FirstName = data.first_name
  if (data.last_name !== undefined) out.LastName = data.last_name
  if (data.email !== undefined) out.Email = data.email
  if (data.phone !== undefined) out.Phone = data.phone
  if (data.title !== undefined) out.Title = data.title
  if (data.company_id !== undefined) out.AccountId = data.company_id
  return out
}
