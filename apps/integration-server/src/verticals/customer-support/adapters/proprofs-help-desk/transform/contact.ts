/**
 * Transform ProProfs Help Desk customer data into the canonical Contact shape.
 *
 * ProProfs does not expose a standalone "list contacts" API endpoint.
 * Contacts are extracted from ticket objects (customer_email, customer_name,
 * customer_phone) or from the company_contact/create/ endpoint response.
 * We use the email address as the stable identifier since no numeric contact
 * ID is returned from the read path.
 */
import type { Contact } from '../../../schema'
import { pickStr, strMap } from './shared'

export interface RawProprofsContact {
  /** Unique identifier, if available (e.g. from a dedicated contact endpoint). */
  id?: string | number
  email?: string
  name?: string
  phone?: string | null
  company_name?: string | null
  portal?: string | null
  [key: string]: unknown
}

export function transformContact(raw: RawProprofsContact): Contact {
  const email = pickStr(raw.email)
  const id    = raw.id != null ? String(raw.id) : (email ?? '')

  return {
    id,
    externalId:     id,
    email,
    name:           pickStr(raw.name) ?? '',
    phone:          pickStr(raw.phone),
    organizationId: pickStr(raw.company_name),
    platform: 'proprofs-help-desk',
    metadata: strMap({
      portal: raw.portal,
    }),
    raw,
  }
}
