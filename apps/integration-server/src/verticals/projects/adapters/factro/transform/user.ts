/**
 * Factro user transform.
 *
 * Factro exposes contacts (persons) via GET /contacts. Contact fields:
 *   id, firstName, lastName, emailAddress, description, city, street,
 *   zipCode, phone, mobilePhone, salutation
 *
 * There is no employee/user listing endpoint in the public REST API, so we
 * map contacts to the canonical User schema.
 */
import type { User } from '../../../schema'
import { pickStr, strMap } from './shared'

export interface RawFactroContact {
  id: string
  firstName?: string
  lastName?: string
  emailAddress?: string
  description?: string
  city?: string
  phone?: string
  mobilePhone?: string
  salutation?: string
  [key: string]: unknown
}

export function transformUser(raw: RawFactroContact, workspaceId?: string): User {
  const firstName = pickStr(raw.firstName) ?? ''
  const lastName = pickStr(raw.lastName) ?? ''
  const name = [firstName, lastName].filter(Boolean).join(' ') || raw.id
  return {
    id: raw.id,
    externalId: raw.id,
    email: pickStr(raw.emailAddress),
    name,
    workspaceIds: workspaceId ? [workspaceId] : [],
    platform: 'factro',
    metadata: strMap({
      salutation: raw.salutation,
      city: raw.city,
      phone: raw.phone ?? raw.mobilePhone,
    }),
    raw,
  }
}
