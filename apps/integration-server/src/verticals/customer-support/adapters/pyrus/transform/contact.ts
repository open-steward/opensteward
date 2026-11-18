/**
 * Pyrus person (contact) → canonical Contact transform.
 *
 * From GET /contacts, persons are nested under organization.persons[].
 * Each person has first_name, last_name, email, mobile_phone, department_id.
 * The organization_id is the Pyrus organization the person belongs to.
 */
import type { Contact } from '../../../schema'
import { pickStr, strMap } from './shared'

export interface RawPyrusPerson {
  id?: number
  first_name?: string
  last_name?: string
  email?: string
  mobile_phone?: string
  phone?: string
  type?: string
  department_id?: number | null
  department_name?: string | null
  organization_id?: number
  [key: string]: unknown
}

export function transformContact(raw: RawPyrusPerson): Contact {
  const firstName = pickStr(raw.first_name) ?? ''
  const lastName = pickStr(raw.last_name) ?? ''
  const name = [firstName, lastName].filter(Boolean).join(' ') || ''

  return {
    id: String(raw.id ?? ''),
    externalId: String(raw.id ?? ''),
    email: pickStr(raw.email),
    name,
    phone: pickStr(raw.mobile_phone) ?? pickStr(raw.phone),
    organizationId: raw.organization_id != null ? String(raw.organization_id) : undefined,
    platform: 'pyrus',
    metadata: strMap({
      departmentId: raw.department_id,
      departmentName: raw.department_name,
      type: raw.type,
    }),
    raw,
  }
}
