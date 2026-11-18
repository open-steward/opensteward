import type { Contact } from '../../../schema/contact'

/**
 * Method CRM Contact table raw record shape.
 *
 * Table name : Contact
 * Key fields : RecordId, FirstName, LastName, Email, Phone, AltPhone,
 *              CreatedDate, ModifiedDate
 *
 * Note: Method CRM uses PascalCase field names.
 */
export interface RawMethodContact {
  RecordId: string | number
  FirstName?: string
  LastName?: string
  Email?: string
  Phone?: string
  AltPhone?: string
  CreatedDate?: string
  ModifiedDate?: string
  [key: string]: unknown
}

export function transformContact(raw: RawMethodContact): Contact {
  const first = typeof raw.FirstName === 'string' ? raw.FirstName : undefined
  const last = typeof raw.LastName === 'string' ? raw.LastName : undefined
  const nameParts = [first, last].filter((v): v is string => v !== undefined && v.length > 0)

  return {
    id: String(raw.RecordId),
    first_name: first,
    last_name: last,
    name: nameParts.length > 0 ? nameParts.join(' ') : undefined,
    email: typeof raw.Email === 'string' ? raw.Email : undefined,
    phone: typeof raw.Phone === 'string' ? raw.Phone : undefined,
    mobile: typeof raw.AltPhone === 'string' ? raw.AltPhone : undefined,
    created_at: typeof raw.CreatedDate === 'string' ? raw.CreatedDate : undefined,
    updated_at: typeof raw.ModifiedDate === 'string' ? raw.ModifiedDate : undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

export function untransformContact(data: Partial<Contact>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.first_name !== undefined) out.FirstName = data.first_name
  if (data.last_name !== undefined) out.LastName = data.last_name
  if (data.email !== undefined) out.Email = data.email
  if (data.phone !== undefined) out.Phone = data.phone
  if (data.mobile !== undefined) out.AltPhone = data.mobile
  return out
}
