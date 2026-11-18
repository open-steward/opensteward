import { toIsoDatetime } from '@opensteward/shared'
import { limeObjectId } from '../object-id'
import type { Contact } from '../../../schema/contact'

/**
 * System properties: "_id: the id of the limeobject", "_createdtime: the
 * timestamp of the creation time", "_timestamp: the timestamp of the latest
 * update" (https://platform.docs.lime-crm.com/en/latest/development/tutorials/concepts/limetypes-and-limeobjects/).
 * Other fields per the Limeobject API definitions
 * (http://static.lime-crm.com/crm-api-docs/spec/limeobject).
 */
export interface RawLimeCrmPerson {
  _id: number | string
  _createdtime?: string
  _timestamp?: string
  firstname?: string
  lastname?: string
  name?: string
  /** "title: \"Direct phone\"" */
  phone?: string
  mobilephone?: string
  email?: string
  position?: string
  /** "title: \"Company\"", "type: integer": the related company's id. */
  company?: number | null
  [key: string]: unknown
}

export function transformContact(raw: RawLimeCrmPerson): Contact {
  return {
    id: limeObjectId(raw),
    first_name: raw.firstname,
    last_name: raw.lastname,
    name: raw.name,
    email: raw.email,
    phone: raw.phone,
    mobile: raw.mobilephone,
    title: raw.position,
    company_id: raw.company != null ? String(raw.company) : undefined,
    created_at: toIsoDatetime(raw._createdtime),
    updated_at: toIsoDatetime(raw._timestamp),
    metadata: raw,
  }
}

export function untransformContact(data: Partial<Contact>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.first_name !== undefined) out.firstname = data.first_name
  if (data.last_name !== undefined) out.lastname = data.last_name
  if (data.email !== undefined) out.email = data.email
  if (data.phone !== undefined) out.phone = data.phone
  if (data.company_id !== undefined) out.company = { _id: data.company_id }
  return out
}
