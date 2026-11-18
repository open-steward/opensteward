import type { Contact } from '../../../schema/contact'

export interface RawInsightlyContact {
  CONTACT_ID: number
  FIRST_NAME?: string
  LAST_NAME?: string
  EMAIL_ADDRESS?: string
  PHONE?: string
  TITLE?: string
  ORGANISATION_ID?: number | null
  OWNER_USER_ID?: number | null
  DATE_CREATED_UTC?: string
  DATE_UPDATED_UTC?: string
  [key: string]: unknown
}

function isoUtc(date?: string): string | undefined {
  if (!date) return undefined
  // Insightly returns UTC timestamps without timezone suffix
  return date.endsWith('Z') ? date : `${date}Z`
}

export function transformContact(raw: RawInsightlyContact): Contact {
  return {
    id: String(raw.CONTACT_ID),
    first_name: raw.FIRST_NAME,
    last_name: raw.LAST_NAME,
    email: raw.EMAIL_ADDRESS,
    phone: raw.PHONE,
    title: raw.TITLE,
    company_id: raw.ORGANISATION_ID != null ? String(raw.ORGANISATION_ID) : undefined,
    owner_id: raw.OWNER_USER_ID != null ? String(raw.OWNER_USER_ID) : undefined,
    created_at: isoUtc(raw.DATE_CREATED_UTC),
    updated_at: isoUtc(raw.DATE_UPDATED_UTC),
    metadata: raw,
  }
}

export function untransformContact(data: Partial<Contact>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.first_name !== undefined) out.FIRST_NAME = data.first_name
  if (data.last_name !== undefined) out.LAST_NAME = data.last_name
  if (data.email !== undefined) out.EMAIL_ADDRESS = data.email
  if (data.phone !== undefined) out.PHONE = data.phone
  if (data.title !== undefined) out.TITLE = data.title
  if (data.company_id !== undefined) out.ORGANISATION_ID = Number(data.company_id)
  if (data.owner_id !== undefined) out.OWNER_USER_ID = Number(data.owner_id)
  return out
}
