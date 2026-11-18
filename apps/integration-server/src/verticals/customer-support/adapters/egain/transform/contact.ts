/**
 * Transform an eGain Customer into the canonical OpenSteward Contact schema.
 *
 * eGain Customer endpoint: GET /ws/v12/interaction/customer/{ids}
 * Schema documented at:
 *   https://hd.egain.com/api/authoring_interaction_api_reference/html/dd/df5/
 *   class_customer_by_i_ds_examples.html
 */
import type { Contact } from '../../../schema'
import { strMap } from './shared'

/**
 * A ContactPoint from eGain's nested contact structure.
 * Type is one of: phone, email, postal, social, web.
 */
interface EgainContactPoint {
  id?: number | string
  type?: string
  phone?: { phoneNo?: string; countryCode?: string; areaCode?: string }
  email?: { emailAddress?: string }
  postal?: {
    address_1?: string
    address_2?: string
    city?: string
    state?: string
    zip?: string
    country?: string
  }
  [key: string]: unknown
}

interface EgainContactPerson {
  id?: number | string
  firstName?: string
  lastName?: string
  jobTitle?: string
  loginId?: string
  contactPoints?: {
    contactPoint?: EgainContactPoint[]
  }
  [key: string]: unknown
}

/**
 * Raw eGain customer object as returned by GET /ws/v12/interaction/customer.
 *
 * eGain customers have a nested structure: Customer → ContactPersons → ContactPoints.
 * PII allowed by schema-firewall: email, name, phone only.
 */
export interface RawEgainCustomer {
  id: number | string
  customerName?: string
  type?: { value?: string; displayValue?: string }
  level?: string
  role?: string
  lastModified?: { date?: string }
  contactPersons?: {
    contactPerson?: EgainContactPerson[]
  }
  [key: string]: unknown
}

/** Extract the primary email address from the first contact person's contact points. */
function extractEmail(raw: RawEgainCustomer): string | undefined {
  const persons = raw.contactPersons?.contactPerson ?? []
  for (const person of persons) {
    const points = person.contactPoints?.contactPoint ?? []
    for (const point of points) {
      if (point.type === 'email' && point.email?.emailAddress) {
        return point.email.emailAddress
      }
    }
  }
  return undefined
}

/** Extract the primary phone number from the first contact person's contact points. */
function extractPhone(raw: RawEgainCustomer): string | undefined {
  const persons = raw.contactPersons?.contactPerson ?? []
  for (const person of persons) {
    const points = person.contactPoints?.contactPoint ?? []
    for (const point of points) {
      if (point.type === 'phone' && point.phone?.phoneNo) {
        const cc = point.phone.countryCode ? `+${point.phone.countryCode} ` : ''
        const ac = point.phone.areaCode ? `(${point.phone.areaCode}) ` : ''
        return `${cc}${ac}${point.phone.phoneNo}`.trim()
      }
    }
  }
  return undefined
}

/** Derive the display name from customerName or the first contact person. */
function extractName(raw: RawEgainCustomer): string {
  if (raw.customerName) return raw.customerName
  const person = raw.contactPersons?.contactPerson?.[0]
  if (person) {
    const parts = [person.firstName, person.lastName].filter(Boolean)
    if (parts.length > 0) return parts.join(' ')
  }
  return ''
}

export function transformContact(raw: RawEgainCustomer): Contact {
  return {
    id: String(raw.id),
    externalId: String(raw.id),
    email: extractEmail(raw),
    name: extractName(raw),
    phone: extractPhone(raw),
    platform: 'egain',
    metadata: strMap({
      customerType: raw.type?.value,
      level: raw.level,
      role: raw.role,
    }),
    raw,
  }
}
