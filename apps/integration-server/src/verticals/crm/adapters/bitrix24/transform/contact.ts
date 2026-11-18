import type { Contact } from '../../../schema/contact'

export interface RawBitrix24Contact {
  ID: string
  NAME?: string
  LAST_NAME?: string
  POST?: string
  EMAIL?: Array<{ VALUE: string; VALUE_TYPE?: string; TYPE?: string }>
  PHONE?: Array<{ VALUE: string; VALUE_TYPE?: string; TYPE?: string }>
  COMPANY_ID?: string | null
  ASSIGNED_BY_ID?: string | null
  DATE_CREATE?: string
  DATE_MODIFY?: string
  [key: string]: unknown
}

export function transformContact(raw: RawBitrix24Contact): Contact {
  return {
    id: String(raw.ID),
    first_name: raw.NAME,
    last_name: raw.LAST_NAME,
    title: raw.POST,
    email: raw.EMAIL?.[0]?.VALUE,
    phone: raw.PHONE?.[0]?.VALUE,
    company_id: raw.COMPANY_ID ? String(raw.COMPANY_ID) : undefined,
    owner_id: raw.ASSIGNED_BY_ID ? String(raw.ASSIGNED_BY_ID) : undefined,
    created_at: raw.DATE_CREATE,
    updated_at: raw.DATE_MODIFY,
    metadata: raw,
  }
}

export function untransformContact(data: Partial<Contact>): Record<string, unknown> {
  const fields: Record<string, unknown> = {}
  if (data.first_name !== undefined) fields.NAME = data.first_name
  if (data.last_name !== undefined) fields.LAST_NAME = data.last_name
  if (data.title !== undefined) fields.POST = data.title
  if (data.email !== undefined) {
    fields.EMAIL = [{ VALUE: data.email, VALUE_TYPE: 'WORK' }]
  }
  if (data.phone !== undefined) {
    fields.PHONE = [{ VALUE: data.phone, VALUE_TYPE: 'WORK' }]
  }
  if (data.company_id !== undefined) fields.COMPANY_ID = data.company_id
  if (data.owner_id !== undefined) fields.ASSIGNED_BY_ID = data.owner_id
  return fields
}
