import type { Contact } from '../../../schema/contact'

export interface RawActiveCampaignContact {
  id: string | number
  firstName?: string
  lastName?: string
  email?: string
  phone?: string
  orgid?: string | number | null
  owner?: string | number | null
  cdate?: string
  udate?: string
  [key: string]: unknown
}

export function transformContact(raw: RawActiveCampaignContact): Contact {
  return {
    id: String(raw.id),
    first_name: raw.firstName ?? undefined,
    last_name: raw.lastName ?? undefined,
    name: [raw.firstName, raw.lastName].filter(Boolean).join(' ') || undefined,
    email: raw.email ?? undefined,
    phone: raw.phone ?? undefined,
    company_id: raw.orgid != null && raw.orgid !== '' && raw.orgid !== '0' && raw.orgid !== 0
      ? String(raw.orgid)
      : undefined,
    owner_id: raw.owner != null && raw.owner !== '' ? String(raw.owner) : undefined,
    created_at: raw.cdate ?? undefined,
    updated_at: raw.udate ?? undefined,
    metadata: raw,
  }
}

export function untransformContact(data: Partial<Contact>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.email !== undefined) out.email = data.email
  if (data.first_name !== undefined) out.firstName = data.first_name
  if (data.last_name !== undefined) out.lastName = data.last_name
  if (data.phone !== undefined) out.phone = data.phone
  if (data.owner_id !== undefined) out.owner = data.owner_id
  if (data.company_id !== undefined) out.orgid = data.company_id
  return out
}
