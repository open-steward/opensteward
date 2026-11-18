/**
 * FreeScout customer -> canonical Contact transform.
 *
 * FreeScout customer fields (camelCase in API responses):
 *   id, firstName, lastName, emails[], phones[], company, jobTitle, address, notes
 *
 * We surface email + name + phone only (PII firewall).
 */
import type { Contact } from '../../../schema'
import { pickStr, strMap } from './shared'

export interface RawFreescoutCustomer {
  id: number
  firstName?: string | null
  lastName?: string | null
  emails?: Array<{ value?: string; type?: string }> | null
  phones?: Array<{ value?: string; type?: string }> | null
  company?: string | null
  jobTitle?: string | null
  [key: string]: unknown
}

function primaryEmail(raw: RawFreescoutCustomer): string | undefined {
  if (!Array.isArray(raw.emails) || raw.emails.length === 0) return undefined
  // Prefer 'work' type, fall back to first
  const work = raw.emails.find((e) => e.type === 'work')
  return pickStr((work ?? raw.emails[0])?.value)
}

function primaryPhone(raw: RawFreescoutCustomer): string | undefined {
  if (!Array.isArray(raw.phones) || raw.phones.length === 0) return undefined
  return pickStr(raw.phones[0]?.value)
}

function fullName(raw: RawFreescoutCustomer): string {
  const parts = [pickStr(raw.firstName), pickStr(raw.lastName)].filter(Boolean)
  return parts.join(' ') || ''
}

export function transformContact(raw: RawFreescoutCustomer): Contact {
  return {
    id: String(raw.id),
    externalId: String(raw.id),
    email: primaryEmail(raw),
    name: fullName(raw),
    phone: primaryPhone(raw),
    platform: 'freescout',
    metadata: strMap({ company: raw.company, jobTitle: raw.jobTitle }),
    raw,
  }
}
