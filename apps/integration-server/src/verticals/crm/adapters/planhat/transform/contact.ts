import type { Contact } from '../../../schema/contact'

/**
 * Planhat calls contacts "End users".
 *
 * Fields are the ones in the "Get endusers List" example response at
 * https://www.planhat.com/developers/api/enduser, e.g.
 *   "_id": "56bccdf554d64d837d01bf2c", "companyId": "56bccdf554d64d837d01be59",
 *   "name": "John Bakers", "email": "antonella.silva_1@att.com",
 *   "firstName": "John", "lastName": "Bakers", "tags": ["Main Contact", ...],
 *   "position": "Fireman", "phone": "07606356442",
 *   "createDate": "2016-02-11T18:07:49.000Z", "updatedAt": "2021-07-12T09:49:56.321Z"
 */
export interface RawPlanhatContact {
  _id: string
  name?: string
  firstName?: string
  lastName?: string
  email?: string
  phone?: string
  position?: string
  companyId?: string
  tags?: string[]
  createDate?: string
  updatedAt?: string
  [key: string]: unknown
}

export function transformContact(raw: RawPlanhatContact): Contact {
  return {
    id: raw._id,
    first_name: raw.firstName,
    last_name: raw.lastName,
    name: raw.name,
    email: raw.email,
    phone: raw.phone,
    title: raw.position,
    company_id: raw.companyId,
    tags: raw.tags,
    created_at: raw.createDate,
    updated_at: raw.updatedAt,
    metadata: raw,
  }
}

export function untransformContact(data: Partial<Contact>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.first_name !== undefined) out.firstName = data.first_name
  if (data.last_name !== undefined) out.lastName = data.last_name
  if (data.email !== undefined) out.email = data.email
  if (data.phone !== undefined) out.phone = data.phone
  if (data.company_id !== undefined) out.companyId = data.company_id
  if (data.owner_id !== undefined) out.ownerId = data.owner_id
  if (data.tags !== undefined) out.tags = data.tags
  return out
}
