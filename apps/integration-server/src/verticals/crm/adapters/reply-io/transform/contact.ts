import { toIsoDatetime } from '@opensteward/shared'
import type { Contact } from '../../../schema/contact'

export interface RawReplyIoContact {
  id: number
  email?: string | null
  domain?: string | null
  firstName?: string | null
  lastName?: string | null
  phone?: string | null
  title?: string | null
  company?: string | null
  companySize?: string | null
  industry?: string | null
  city?: string | null
  state?: string | null
  country?: string | null
  timeZoneId?: string | null
  linkedInUrl?: string | null
  notes?: string | null
  ownerUserId?: number | null
  accountId?: number | null
  isOptedOut?: boolean
  callStatus?: string | null
  meetingStatus?: string | null
  addingDate?: string | null
  createdAt?: string | null
  lastModifiedAt?: string | null
  customFields?: Array<{ key: string; value?: string | null }>
  sequences?: Array<{ sequenceId: number; sequenceName: string; status: string; currentStep: number }>
  lists?: Array<{ listId: number; listName: string; isShared: boolean }>
  [key: string]: unknown
}

export function transformContact(raw: RawReplyIoContact): Contact {
  const nameParts = [raw.firstName, raw.lastName].filter(Boolean)
  return {
    id: String(raw.id),
    first_name: raw.firstName ?? undefined,
    last_name: raw.lastName ?? undefined,
    name: nameParts.length > 0 ? nameParts.join(' ') : undefined,
    email: raw.email ?? undefined,
    phone: raw.phone ?? undefined,
    title: raw.title ?? undefined,
    company_id: raw.accountId != null ? String(raw.accountId) : undefined,
    owner_id: raw.ownerUserId != null ? String(raw.ownerUserId) : undefined,
    address: (raw.city || raw.state || raw.country)
      ? {
          city: raw.city ?? undefined,
          region: raw.state ?? undefined,
          country: raw.country ?? undefined,
        }
      : undefined,
    created_at: toIsoDatetime(raw.createdAt ?? raw.addingDate),
    updated_at: toIsoDatetime(raw.lastModifiedAt),
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformContact(data: Partial<Contact>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.email !== undefined) out.email = data.email
  if (data.first_name !== undefined) out.firstName = data.first_name
  if (data.last_name !== undefined) out.lastName = data.last_name
  if (data.phone !== undefined) out.phone = data.phone
  if (data.title !== undefined) out.title = data.title
  if (data.company_id !== undefined) out.accountId = data.company_id !== null ? Number(data.company_id) : null
  if (data.owner_id !== undefined) out.ownerUserId = data.owner_id !== null ? Number(data.owner_id) : null
  if (data.address?.city !== undefined) out.city = data.address.city
  if (data.address?.region !== undefined) out.state = data.address.region
  if (data.address?.country !== undefined) out.country = data.address.country
  return out
}
