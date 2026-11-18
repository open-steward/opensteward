import type { Contact } from '../../../schema/contact'
import { isoDate, refId, requireId, text, type SalesmateRef } from '../fields'

/**
 * A Salesmate v4 contact, as documented by the "Get a Contact" example
 * response (`GET /apis/contact/v4/{id}` → `Data`). Only the fields this
 * transform reads are typed; the rest stay in `metadata`.
 */
export interface RawSalesmateContact {
  id?: number | string
  name?: string
  firstName?: string
  lastName?: string
  email?: string
  phone?: string
  mobile?: string
  designation?: string
  company?: SalesmateRef | null
  owner?: SalesmateRef | null
  createdAt?: string
  lastModifiedAt?: string
  [key: string]: unknown
}

export function transformContact(raw: RawSalesmateContact): Contact {
  return {
    id: requireId(raw.id, 'contact'),
    first_name: text(raw.firstName),
    last_name: text(raw.lastName),
    name: text(raw.name),
    email: text(raw.email),
    phone: text(raw.phone),
    mobile: text(raw.mobile),
    title: text(raw.designation),
    company_id: refId(raw.company),
    owner_id: refId(raw.owner),
    created_at: isoDate(raw.createdAt),
    updated_at: isoDate(raw.lastModifiedAt),
    metadata: raw,
  }
}

export function untransformContact(data: Partial<Contact>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.first_name !== undefined) out.firstName = data.first_name
  if (data.last_name !== undefined) out.lastName = data.last_name
  if (data.email !== undefined) out.email = data.email
  if (data.phone !== undefined) out.phone = data.phone
  if (data.mobile !== undefined) out.mobile = data.mobile
  if (data.company_id !== undefined) out.company = data.company_id
  return out
}
