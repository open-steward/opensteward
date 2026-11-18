/**
 * Transform Octadesk contact (person) to canonical Contact.
 *
 * Octadesk uses "persons" as the resource name for contacts/customers.
 * GET /persons returns an array of person objects.
 *
 * Fields: id, name, email, phone, organization{id, name}, createdAt
 */
import type { Contact } from '../../../schema'
import { pickStr, strMap } from './shared'

export interface RawOctadeskContact {
  /** Octadesk person UUID */
  id?: string
  name?: string
  email?: string
  phone?: string | null
  organization?: { id?: string; name?: string; [key: string]: unknown }
  createdAt?: string
  [key: string]: unknown
}

export function transformContact(raw: RawOctadeskContact): Contact {
  return {
    id: String(raw.id ?? ''),
    externalId: String(raw.id ?? ''),
    email: pickStr(raw.email),
    name: pickStr(raw.name) ?? '',
    phone: pickStr(raw.phone),
    organizationId: raw.organization?.id ? String(raw.organization.id) : undefined,
    platform: 'octadesk',
    metadata: strMap({
      organizationName: raw.organization?.name,
    }),
    raw,
  }
}
