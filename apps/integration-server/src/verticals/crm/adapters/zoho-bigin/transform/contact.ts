import type { Contact } from '../../../schema/contact'

export interface RawBiginContact {
  id: string
  First_Name?: string
  Last_Name?: string
  Email?: string
  Phone?: string
  Mobile?: string
  Account_Name?: { id: string; name?: string } | null
  Owner?: { id: string; name?: string } | null
  Created_Time?: string
  Modified_Time?: string
  [key: string]: unknown
}

export function transformContact(raw: RawBiginContact): Contact {
  return {
    id: String(raw.id),
    first_name: raw.First_Name ?? undefined,
    last_name: raw.Last_Name ?? undefined,
    name: [raw.First_Name, raw.Last_Name].filter(Boolean).join(' ') || undefined,
    email: raw.Email ?? undefined,
    phone: raw.Phone ?? undefined,
    mobile: raw.Mobile ?? undefined,
    company_id: raw.Account_Name?.id != null ? String(raw.Account_Name.id) : undefined,
    owner_id: raw.Owner?.id != null ? String(raw.Owner.id) : undefined,
    created_at: raw.Created_Time,
    updated_at: raw.Modified_Time,
    metadata: raw,
  }
}

export function untransformContact(data: Partial<Contact>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.first_name !== undefined) out.First_Name = data.first_name
  if (data.last_name !== undefined) out.Last_Name = data.last_name
  if (data.email !== undefined) out.Email = data.email
  if (data.phone !== undefined) out.Phone = data.phone
  if (data.mobile !== undefined) out.Mobile = data.mobile
  return out
}
