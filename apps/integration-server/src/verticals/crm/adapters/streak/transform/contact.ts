import type { Contact } from '../../../schema/contact'

export interface RawStreakContact {
  key: string
  givenName?: string
  familyName?: string
  emailAddresses?: string[]
  phoneNumbers?: string[]
  title?: string
  companies?: Array<{ name?: string; primary?: boolean }>
  createdDate?: number
  lastUpdatedDate?: number
  [key: string]: unknown
}

export function transformContact(raw: RawStreakContact): Contact {
  return {
    id: raw.key,
    first_name: raw.givenName,
    last_name: raw.familyName,
    name: [raw.givenName, raw.familyName].filter(Boolean).join(' ') || undefined,
    email: raw.emailAddresses?.[0],
    phone: raw.phoneNumbers?.[0],
    title: raw.title,
    // Streak contacts embed company name rather than a linked company_id
    company_id: undefined,
    created_at: raw.createdDate != null ? new Date(raw.createdDate).toISOString() : undefined,
    updated_at: raw.lastUpdatedDate != null ? new Date(raw.lastUpdatedDate).toISOString() : undefined,
    metadata: raw,
  }
}

export function untransformContact(data: Partial<Contact>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.first_name !== undefined) out.givenName = data.first_name
  if (data.last_name !== undefined) out.familyName = data.last_name
  if (data.email !== undefined) out.emailAddresses = [data.email]
  if (data.phone !== undefined) out.phoneNumbers = [data.phone]
  if (data.title !== undefined) out.title = data.title
  return out
}
