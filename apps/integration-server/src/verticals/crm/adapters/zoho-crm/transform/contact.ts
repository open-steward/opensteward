import type { Contact } from '../../../schema/contact'

export interface RawZohoContact {
  id: string
  First_Name?: string
  Last_Name?: string
  Email?: string
  Phone?: string
  Title?: string
  Account_Name?: { id: string; name?: string } | null
  Owner?: { id: string; name?: string } | null
  Created_Time?: string
  Modified_Time?: string
  [key: string]: unknown
}

export function transformContact(raw: RawZohoContact): Contact {
  return {
    id: String(raw.id),
    first_name: raw.First_Name ?? undefined,
    last_name: raw.Last_Name ?? undefined,
    name: [raw.First_Name, raw.Last_Name].filter(Boolean).join(' ') || undefined,
    email: raw.Email ?? undefined,
    phone: raw.Phone ?? undefined,
    title: raw.Title ?? undefined,
    company_id: raw.Account_Name?.id != null ? String(raw.Account_Name.id) : undefined,
    owner_id: raw.Owner?.id != null ? String(raw.Owner.id) : undefined,
    created_at: raw.Created_Time,
    updated_at: raw.Modified_Time,
    metadata: raw,
  }
}

export function untransformContact(data: Partial<Contact>): Record<string, unknown> {
  const record: Record<string, unknown> = {}
  if (data.first_name !== undefined) record.First_Name = data.first_name
  if (data.last_name !== undefined) record.Last_Name = data.last_name
  if (data.email !== undefined) record.Email = data.email
  if (data.phone !== undefined) record.Phone = data.phone
  if (data.title !== undefined) record.Title = data.title
  return record
}
