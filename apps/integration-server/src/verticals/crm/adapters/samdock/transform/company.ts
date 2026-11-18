import type { Company } from '../../../schema/company'
import { samdockDateTime, samdockId } from './contact'

/**
 * Samdock's `Organization`, as GET /api/contacts/Organizations and
 * GET /api/contacts/organizations/{id} document it
 * (https://samdock.readme.io/reference/organizationscontroller_browse.md).
 */
export interface RawSamdockCompany {
  /** "The ID of the organization" (required). */
  _id: string
  /** "The name of the organization" (required). */
  name: string
  /** "The phone number of the organization" */
  phoneNumber?: string
  /** "The website of the organization", e.g. "http://iIntcom.com". */
  website?: string
  /** "The created at timestamp of the organization", `"format": "date-time"`. */
  createdAt?: string
  [key: string]: unknown
}

/** The host of the documented `website` URL; nothing when it is not a URL. */
function hostOf(website: unknown): string | undefined {
  if (typeof website !== 'string' || !URL.canParse(website)) return undefined
  return new URL(website).hostname || undefined
}

export function transformCompany(raw: RawSamdockCompany): Company {
  if (typeof raw.name !== 'string') throw new Error('Samdock organization has no name')
  return {
    id: samdockId(raw._id, 'organization'),
    name: raw.name,
    phone: raw.phoneNumber,
    domain: hostOf(raw.website),
    created_at: samdockDateTime(raw.createdAt),
    metadata: raw,
  }
}

export function untransformCompany(data: Partial<Company>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.name !== undefined) out.name = data.name
  if (data.phone !== undefined) out.phone = data.phone
  if (data.domain !== undefined) out.website = data.domain
  if (data.owner_id !== undefined) out.owner_id = data.owner_id
  return out
}
