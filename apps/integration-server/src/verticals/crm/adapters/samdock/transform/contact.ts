import { IsoDatetime } from '@opensteward/shared'
import type { Contact } from '../../../schema/contact'

/**
 * Samdock's `Person`, as GET /api/contacts/Persons and GET /api/contacts/persons/{id}
 * document it (https://samdock.readme.io/reference/personscontroller_browse.md).
 * Only the fields this transform reads are typed; the rest stay in `metadata`.
 */
export interface RawSamdockContact {
  /** "The ID of the person" (required). */
  _id: string
  /** "The email of the person" */
  email?: string
  /** "The first name of the person" */
  firstName?: string
  /** "The last name of the person" (required). */
  lastName?: string
  /** "The phone number of the person" */
  phoneNumber?: string
  /** "The mobile phone number of the person" */
  mobileNumber?: string
  /** "The created at timestamp of the person", `"format": "date-time"`. */
  createdAt?: string
  [key: string]: unknown
}

/** The documented `"format": "date-time"`, or nothing: the docs' own example ("4/21/2021-14:21:02") is not one. */
export function samdockDateTime(value: unknown): string | undefined {
  return IsoDatetime.safeParse(value).success ? (value as string) : undefined
}

export function samdockId(value: unknown, resource: string): string {
  if (typeof value !== 'string' || value === '') {
    throw new Error(`Samdock ${resource} has no _id`)
  }
  return value
}

export function transformContact(raw: RawSamdockContact): Contact {
  return {
    id: samdockId(raw._id, 'person'),
    first_name: raw.firstName,
    last_name: raw.lastName,
    name: [raw.firstName, raw.lastName].filter(Boolean).join(' ') || undefined,
    email: raw.email,
    phone: raw.phoneNumber,
    mobile: raw.mobileNumber,
    created_at: samdockDateTime(raw.createdAt),
    metadata: raw,
  }
}

export function untransformContact(data: Partial<Contact>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.first_name !== undefined) out.first_name = data.first_name
  if (data.last_name !== undefined) out.last_name = data.last_name
  if (data.email !== undefined) out.email = data.email
  if (data.phone !== undefined) out.phone = data.phone
  if (data.company_id !== undefined) out.organization_id = data.company_id
  if (data.owner_id !== undefined) out.owner_id = data.owner_id
  return out
}
