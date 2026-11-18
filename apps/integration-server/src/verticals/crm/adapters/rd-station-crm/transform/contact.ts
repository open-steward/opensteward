import type { Contact } from '../../../schema/contact'

export interface RawRdStationContact {
  _id: string
  name?: string
  email?: string
  phones?: Array<{ phone: string }>
  organization?: { _id: string } | null
  user?: { _id: string } | null
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

export function transformContact(raw: RawRdStationContact): Contact {
  const primaryPhone = raw.phones?.[0]?.phone

  return {
    id: raw._id,
    name: raw.name,
    email: raw.email,
    phone: primaryPhone,
    company_id: raw.organization?._id ?? undefined,
    owner_id: raw.user?._id ?? undefined,
    created_at: raw.created_at,
    updated_at: raw.updated_at,
    metadata: raw,
  }
}

export function untransformContact(data: Partial<Contact>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.name !== undefined) out.name = data.name
  if (data.email !== undefined) out.email = data.email
  if (data.phone !== undefined) out.phones = [{ phone: data.phone }]
  if (data.company_id !== undefined) out.organization = { _id: data.company_id }
  if (data.owner_id !== undefined) out.user = { _id: data.owner_id }
  return out
}
